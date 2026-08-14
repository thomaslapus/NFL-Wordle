"use strict";
const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// ── Tank01 NFL API (via RapidAPI) ─────────────────────────────────────────────
// Set RAPIDAPI_KEY in your environment before starting the server.
//   Local:  export RAPIDAPI_KEY=your_key_here
//   Render: Dashboard → Environment → RAPIDAPI_KEY=your_key_here
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";
const TANK01_BASE   = `https://${RAPIDAPI_HOST}`;
const NFL_SEASON    = 2026;

// How often the background poller refreshes live game state (during game windows only).
// 120 s × ~60 cycles/day × ~20 game days/season ≈ ~3,600 calls/season for live polling.
// Each cycle = 1 call to getNFLGamesForDate + up to 4 box-score calls for live detail.
const LIVE_POLL_MS = 120_000;

// ── Persistent cache directory ────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ── In-memory state ───────────────────────────────────────────────────────────
let playerData  = [];   // Wordle: Sleeper API (free, unlimited)
let teamStats   = null; // Stats page: Tank01, cached weekly
let playerStats = null; // Stats/Fantasy: Tank01, cached weekly

// Live game state: { [YYYYMMDD]: { updatedAt: ms, games: [...normalized] } }
const liveState = {};

// ── Logger ────────────────────────────────────────────────────────────────────
function log(level, message) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
function isRateLimited(ip) {
    const now = Date.now(), WINDOW = 60_000, MAX = 100;
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW });
        return false;
    }
    if (entry.count >= MAX) return true;
    entry.count++;
    return false;
}
setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of rateLimitMap) if (now > e.resetTime) rateLimitMap.delete(ip);
}, 5 * 60_000);

// ── Content types & cache headers ─────────────────────────────────────────────
const CONTENT_TYPES = {
    ".html": "text/html",  ".css": "text/css",  ".js": "application/javascript",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
    ".svg": "image/svg+xml", ".ico": "image/x-icon",
};
const CACHE_MAX_AGE = { ".css": 86_400, ".js": 86_400, ".png": 604_800, ".jpg": 604_800 };

// ── Disk cache helpers ────────────────────────────────────────────────────────
function readDiskCache(file) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); }
    catch { return null; }
}
function writeDiskCache(file, data) {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data), "utf8");
}

// ── Tank01 fetch wrapper ──────────────────────────────────────────────────────
async function tank01Get(endpoint, params = {}) {
    if (!RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY not set");
    const url = new URL(`${TANK01_BASE}${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    log("info", `Tank01 GET ${url.toString()}`);
    const res = await fetch(url.toString(), {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        log("error", `Tank01 ${res.status} for ${endpoint}: ${body.slice(0, 200)}`);
        throw new Error(`HTTP ${res.status} for ${endpoint}`);
    }
    const json = await res.json();
    if (json.statusCode && json.statusCode !== 200)
        throw new Error(`Tank01 ${json.statusCode}: ${JSON.stringify(json.body)}`);
    return json.body ?? json;
}

// ── Field extractors (defensive multi-alias) ──────────────────────────────────
function pick(obj, ...paths) {
    if (!obj) return 0;
    for (const p of paths) {
        const val = p.split(".").reduce((cur, k) => cur?.[k], obj);
        if (val !== undefined && val !== null && val !== "") return parseFloat(val) || 0;
    }
    return 0;
}
function pickStr(obj, ...paths) {
    if (!obj) return "";
    for (const p of paths) {
        const val = p.split(".").reduce((cur, k) => cur?.[k], obj);
        if (val !== undefined && val !== null && val !== "") return String(val);
    }
    return "";
}

// ── Date/time helpers ─────────────────────────────────────────────────────────
function todayStr() {
    // Returns YYYYMMDD in server's local time zone
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${dd}`;
}

// Approximate ET hour, used only for game-window detection
function etHour() {
    const now = new Date();
    const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
    const isDST = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10;
    return ((utcH - (isDST ? 4 : 5)) + 24) % 24;
}
function etDay() {
    const now = new Date();
    const isDST = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10;
    const etMs = now.getTime() - (isDST ? 4 : 5) * 3_600_000;
    return new Date(etMs).getUTCDay(); // 0=Sun, 1=Mon, …, 4=Thu
}

// ── Game-window detection ─────────────────────────────────────────────────────
// Returns true if we might have live NFL games right now.
// Only polls during actual game windows to save API calls.
function isGameWindow() {
    const today = todayStr();
    const hour  = etHour();
    const day   = etDay();
    // Must be a date we know has games; skip if future or no games listed
    if (hour < 11) return false;         // Before 11 AM ET, nothing is live
    if (hour >= 24) return false;        // Sanity
    // Thu night, Sat (Dec/playoffs), Sun all-day, Mon night
    if (day === 4 && hour >= 19) return true;  // Thu ≥7 pm
    if (day === 6 && hour >= 12) return true;  // Sat ≥noon
    if (day === 0 && hour >= 12) return true;  // Sun ≥noon
    if (day === 1 && hour >= 19) return true;  // Mon ≥7 pm
    return false;
}

// ── Normalize a raw Tank01 game object ────────────────────────────────────────
// Tank01 field names vary across endpoints — we try many aliases defensively.
function normalizeGame(raw) {
    const statusRaw = pickStr(raw, "gameStatus", "status", "gameState").toLowerCase();
    let status = "upcoming";
    if (statusRaw.includes("progress") || statusRaw.includes("live") || statusRaw.includes("active"))
        status = "live";
    else if (statusRaw.includes("final") || statusRaw.includes("complet") || statusRaw.includes("over"))
        status = "final";

    const awayScore = pick(raw, "awayScore", "awayPts", "away_score") || null;
    const homeScore = pick(raw, "homeScore", "homePts", "home_score") || null;

    return {
        gameID:     pickStr(raw, "gameID",   "game_id", "id"),
        date:       pickStr(raw, "gameDate", "date"),
        kickoff:    pickStr(raw, "gameTime", "kickoff", "gameTimeET", "time"),
        channel:    pickStr(raw, "networkChannel", "channel", "tv", "network"),
        status,
        awayTeam:   (pickStr(raw, "awayTeam", "away", "awayTeamAbbr") || "TBD").toUpperCase(),
        homeTeam:   (pickStr(raw, "homeTeam", "home", "homeTeamAbbr") || "TBD").toUpperCase(),
        awayRecord: pickStr(raw, "awayRecord", "awayWinLoss", "away_record").replace(/[()]/g, ""),
        homeRecord: pickStr(raw, "homeRecord", "homeWinLoss", "home_record").replace(/[()]/g, ""),
        awayScore:  status !== "upcoming" ? (awayScore ?? 0) : null,
        homeScore:  status !== "upcoming" ? (homeScore ?? 0) : null,
        quarter:    pickStr(raw, "currentPeriod", "quarter", "period", "qtr") || null,
        clock:      pickStr(raw, "gameClock",      "clock",   "timeLeft") || null,
        possession: (pickStr(raw, "teamPosBall", "possession", "ballOn") || "").toUpperCase() || null,
        lastUpdated: Date.now(),
    };
}

// ── Full-season schedule cache ────────────────────────────────────────────────
// Keyed by YYYYMMDD → array of normalized game objects (upcoming, no scores).
// Loaded at startup from getNFLGamesForWeek (one call per week).
const seasonSchedule = {};

// Maps an NFL week number to approximate start date for validation
function weekToDate(week, year) {
    // Week 1 of 2026 regular season starts ~Sep 3 2026
    const week1 = new Date(`${year}-09-03`);
    const d = new Date(week1.getTime() + (week - 1) * 7 * 86_400_000);
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

async function loadSeasonSchedule() {
    if (!RAPIDAPI_KEY) return;
    const cacheFile = `schedule_${NFL_SEASON}.json`;
    const cached = readDiskCache(cacheFile);
    if (cached) {
        Object.assign(seasonSchedule, cached);
        log("info", `Schedule cache: ${Object.keys(seasonSchedule).length} dates`);
        return;
    }

    log("info", "Loading full season schedule from getNFLGamesForWeek...");
    const result = {};
    // Preseason weeks 1-4, regular season weeks 1-18, then playoffs separately
    const weeks = [
        { gameWeek: "Preseason Week 1", seasonType: "pre" },
        { gameWeek: "Preseason Week 2", seasonType: "pre" },
        { gameWeek: "Preseason Week 3", seasonType: "pre" },
        { gameWeek: "Preseason Week 4", seasonType: "pre" },
        ...Array.from({length: 18}, (_, i) => ({ gameWeek: String(i + 1), seasonType: "reg" })),
        { gameWeek: "Wild Card",      seasonType: "post" },
        { gameWeek: "Divisional",     seasonType: "post" },
        { gameWeek: "Conference",     seasonType: "post" },
        { gameWeek: "Super Bowl",     seasonType: "post" },
    ];

    for (const { gameWeek, seasonType } of weeks) {
        try {
            const body = await tank01Get("/getNFLGamesForWeek", {
                gameWeek,
                gameYear: NFL_SEASON,
                seasonType,
            });
            // Log shape on first call
            if (Object.keys(result).length === 0) {
                log("info", `getNFLGamesForWeek keys: ${Object.keys(body ?? {}).join(", ")}`);
            }
            const raw = Array.isArray(body) ? body
                : (body?.schedule ?? body?.games ?? Object.values(body ?? {}));
            if (!Array.isArray(raw)) continue;

            for (const g of raw) {
                const game = normalizeGame(g);
                if (!game.date) continue;
                const dateKey = game.date.replace(/-/g, "");
                if (!result[dateKey]) result[dateKey] = [];
                result[dateKey].push(game);
            }
        } catch (err) {
            log("warn", `Schedule fetch failed for ${gameWeek}: ${err.message}`);
        }
    }

    Object.assign(seasonSchedule, result);
    writeDiskCache(cacheFile, result);
    log("info", `Season schedule loaded: ${Object.keys(result).length} dates`);
}

// ── Fetch all games for a date (1 API call) ───────────────────────────────────
// getNFLScoresOnly returns all games + scores for a given date.
async function fetchGamesForDate(dateStr) {
    log("info", `Fetching scores for ${dateStr}...`);
    const body = await tank01Get("/getNFLScoresOnly", { gameDate: dateStr });
    // Log shape on first call so we can see what the API returns
    if (body && typeof body === "object" && !Array.isArray(body)) {
        log("info", `getNFLScoresOnly keys: ${Object.keys(body).join(", ")}`);
    }
    // Tank01 may return the list at various keys — try common shapes
    const raw  = Array.isArray(body) ? body
               : (body?.games ?? body?.scoreboard ?? body?.schedule ?? Object.values(body ?? {}));
    const games = (Array.isArray(raw) ? raw : []).map(normalizeGame);
    log("info", `  → ${games.length} games for ${dateStr}`);
    return games;
}

// ── Fetch detailed box score for a single live game ───────────────────────────
// Called only when a game is live and the scoreboard response lacks quarter/clock.
async function fetchBoxScore(gameID) {
    const body = await tank01Get("/getNFLBoxScore", { gameID, playByPlay: "false" });
    const raw  = body?.gameInfo ?? body?.game ?? body ?? {};
    return normalizeGame({ ...raw, gameID });
}

// ── Live game poller ──────────────────────────────────────────────────────────
// Runs every LIVE_POLL_MS. During game windows:
//   - 1 call to getNFLGamesForDate for today's scoreboard
//   - Up to 4 box-score calls for live games missing quarter/clock
// Outside game windows the poller returns immediately (0 calls).
let pollRunning = false;

async function pollLiveGames() {
    if (pollRunning || !RAPIDAPI_KEY) return;
    if (!isGameWindow()) return;
    pollRunning = true;

    const today = todayStr();
    try {
        const games = await fetchGamesForDate(today);
        liveState[today] = { updatedAt: Date.now(), games };

        // Enrich up to 4 live games with quarter/clock detail
        const liveGames = games.filter(g => g.status === "live" && !g.quarter).slice(0, 4);
        for (const g of liveGames) {
            try {
                const detail = await fetchBoxScore(g.gameID);
                Object.assign(g, { quarter: detail.quarter, clock: detail.clock, possession: detail.possession });
            } catch (err) {
                log("warn", `Box score failed for ${g.gameID}: ${err.message}`);
            }
        }

        // Permanently cache any newly-final games (never re-fetch)
        for (const g of games.filter(g => g.status === "final")) {
            const cacheFile = `boxscore_${g.gameID}.json`;
            if (!readDiskCache(cacheFile)) {
                writeDiskCache(cacheFile, g);
                log("info", `Cached final game: ${g.gameID}`);
            }
        }

        const liveCount = games.filter(g => g.status === "live").length;
        log("info", `Poll done: ${games.length} games total, ${liveCount} live`);
    } catch (err) {
        log("error", `Live poll error: ${err.message}`);
    } finally {
        pollRunning = false;
    }
}

setInterval(pollLiveGames, LIVE_POLL_MS);

// ── Team stats (1 API call) ───────────────────────────────────────────────────
async function buildTeamStats() {
    log("info", "Fetching team stats (1 call)...");
    const body  = await tank01Get("/getNFLTeams", { teamStats: "true", topPerformers: "true" });
    const teams = body?.nflTeams ?? (Array.isArray(body) ? body : []);

    if (teams.length > 0) {
        log("info", `Team keys: ${Object.keys(teams[0]).join(", ")}`);
        if (teams[0].teamStats)
            log("info", `teamStats keys: ${Object.keys(teams[0].teamStats).join(", ")}`);
        if (teams[0].logos)
            log("info", `logos[0]: ${JSON.stringify(teams[0].logos[0])}`);
    }

    const result = teams.map(t => {
        const wins  = parseInt(t.wins)  || 0;
        const loss  = parseInt(t.loss)  || 0;
        const tie   = parseInt(t.tie)   || 0;
        const games = wins + loss + tie || 17;
        const pf    = parseFloat(t.pf)  || 0;
        const pa    = parseFloat(t.pa)  || 0;

        let logo = "";
        if (Array.isArray(t.logos) && t.logos.length) {
            const l = t.logos[0];
            logo = typeof l === "string" ? l : (l?.src ?? l?.href ?? l?.url ?? "");
        }
        logo = logo || t.espnLogo1 || t.espnLogo ||
               `https://a.espncdn.com/i/teamlogos/nfl/500/${(t.teamAbv||"").toLowerCase()}.png`;

        let ypg = 0, yapg = 0;
        const ts = t.teamStats;
        if (ts) {
            ypg  = pick(ts, "Offense.totalYards", "offense.totalYards", "totalYards", "offYards", "offTotalYds");
            yapg = pick(ts, "Defense.totalYards", "defense.totalYards", "defenseTotalYards", "defYards");
            if (ypg  > 3_000) ypg  = +(ypg  / games).toFixed(1);
            if (yapg > 3_000) yapg = +(yapg / games).toFixed(1);
        }

        return {
            id:         t.teamID ?? t.teamAbv,
            name:       `${t.teamCity ?? ""} ${t.teamName ?? ""}`.trim(),
            abbr:       (t.teamAbv ?? "").toUpperCase(),
            logo,
            conference: t.conference ?? t.conferenceAbv ?? "",
            division:   t.division   ?? "",
            won: wins, lost: loss,
            ppg:  games > 0 ? +(pf / games).toFixed(1) : 0,
            papg: games > 0 ? +(pa / games).toFixed(1) : 0,
            ypg, yapg,
        };
    });

    result.sort((a, b) => a.name.localeCompare(b.name));
    log("info", `Team stats complete: ${result.length} teams`);
    return result;
}

// ── Player stats (32 API calls) ───────────────────────────────────────────────
function simplifyPos(pos = "") {
    if (["DE","DT","NT"].includes(pos)) return "DL";
    if (["CB","S","FS","SS"].includes(pos)) return "DB";
    if (["OT","OG","C","G","T"].includes(pos)) return "OL";
    if (["ILB","OLB","MLB"].includes(pos)) return "LB";
    return pos;
}

async function buildPlayerStats(teams) {
    log("info", `Fetching player stats (${teams.length} calls)...`);
    const KEEP = new Set(["QB","RB","WR","TE","K","FB"]);
    const all  = [];
    let sampleLogged = false;

    for (const team of teams) {
        try {
            const body   = await tank01Get("/getNFLTeamRoster", { teamAbv: team.abbr, getStats: "true" });
            const roster = body?.roster ?? (Array.isArray(body) ? body : []);

            if (!sampleLogged && roster.length > 0) {
                log("info", `Player keys: ${Object.keys(roster[0]).join(", ")}`);
                if (roster[0].stats) log("info", `Player stats keys: ${Object.keys(roster[0].stats).join(", ")}`);
                sampleLogged = true;
            }

            for (const p of roster) {
                const pos = simplifyPos(p.pos ?? p.position ?? "");
                if (!KEEP.has(pos)) continue;
                const s = p.stats ?? {};

                const passYds  = pick(s, "passYds",  "passYards",   "passingYards");
                const passTDs  = pick(s, "passTD",   "passTDs",     "passingTDs",  "passScore");
                const passAtt  = pick(s, "passAtt",  "passAttempts","attempts");
                const passComp = pick(s, "passComp", "passCompletions", "completions");
                const rushYds  = pick(s, "rushYds",  "rushYards",   "rushingYards");
                const rushTDs  = pick(s, "rushTD",   "rushTDs",     "rushingTDs",  "rushScore");
                const rushAtt  = pick(s, "carries",  "rushAtt",     "rushAttempts","att");
                const recYds   = pick(s, "recYds",   "recYards",    "receivingYards");
                const recTDs   = pick(s, "recTD",    "recTDs",      "receivingTDs","recScore");
                const recRec   = pick(s, "receptions","rec",        "recCatches",  "catches");
                const games    = pick(s, "gamesPlayed","games","GP") || pick(p, "gamesPlayed","games");

                const totalYds = passYds + rushYds + recYds;
                const totalTDs = passTDs + rushTDs + recTDs;
                if (totalYds === 0 && totalTDs === 0 && games === 0) continue;

                const g = games || 1;
                all.push({
                    id:       p.playerID ?? p.id,
                    espnId:   p.espnID   ?? p.espnId ?? "",
                    name:     p.longName  ?? p.fullName ?? p.name ?? "",
                    pos, team: team.abbr, teamName: team.name,
                    teamLogo: team.logo,
                    games,
                    passYds, passTDs, passAtt, passComp,
                    compPct:  passAtt > 0 ? +(passComp / passAtt * 100).toFixed(1) : 0,
                    rushYds, rushTDs, rushAtt,
                    ypc:      rushAtt > 0 ? +(rushYds  / rushAtt).toFixed(1) : 0,
                    cpg:      +(rushAtt / g).toFixed(1),
                    rushYpg:  +(rushYds  / g).toFixed(1),
                    recYds, recTDs, recRec,
                    recYpg:   +(recYds / g).toFixed(1),
                    recPg:    +(recRec  / g).toFixed(1),
                    totalYds, totalTDs,
                    ypg:      +(totalYds / g).toFixed(1),
                });
            }
        } catch (err) {
            log("warn", `Player stats failed for ${team.abbr}: ${err.message}`);
        }
    }

    log("info", `Player stats complete: ${all.length} players`);
    return all;
}

// ── Sleeper: Wordle player list (free, unlimited) ─────────────────────────────
async function fetchPlayerData() {
    try {
        log("info", "Fetching Sleeper player list...");
        const res  = await fetch("https://api.sleeper.app/v1/players/nfl");
        const raw  = await res.json();
        playerData = Object.values(raw)
            .filter(p => p.depth_chart_order <= 1 && p.active && p.team)
            .sort((a, b) => a.full_name.localeCompare(b.full_name));
        log("info", `Sleeper: ${playerData.length} active players`);
    } catch (err) {
        log("error", `Sleeper fetch failed: ${err.message}`);
    }
}

function getDailyPlayer() {
    const today = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < today.length; i++) hash = (hash * 31 + today.charCodeAt(i)) % playerData.length;
    return playerData[Math.abs(hash)];
}

// ── Weekly stats refresh ──────────────────────────────────────────────────────
// Refreshes team + player stats on Tuesday at 3am ET (after Monday Night Football ends).
// This keeps data current while costing only 33 calls/week.
function scheduleWeeklyRefresh() {
    if (!RAPIDAPI_KEY) return;

    function msUntilNextTuesday3am() {
        const now   = new Date();
        const isDST = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10;
        const etOffset = isDST ? 4 : 5;
        const etNow = new Date(now.getTime() - etOffset * 3_600_000);
        const daysUntil = (9 - etNow.getUTCDay()) % 7 || 7;
        const target = new Date(etNow);
        target.setUTCDate(target.getUTCDate() + daysUntil);
        target.setUTCHours(3 + etOffset, 0, 0, 0);
        return Math.max(target.getTime() - now.getTime(), 60_000);
    }

    setTimeout(async function refresh() {
        log("info", "Weekly stats refresh...");
        try {
            teamStats = await buildTeamStats();
            writeDiskCache("team_stats.json", teamStats);
            playerStats = await buildPlayerStats(teamStats);
            writeDiskCache("player_stats.json", playerStats);
            log("info", "Weekly refresh complete");
        } catch (err) {
            log("error", `Weekly refresh failed: ${err.message}`);
        }
        setTimeout(refresh, 7 * 24 * 3_600_000);
    }, msUntilNextTuesday3am());
}

// ── Startup: load from disk cache, then fetch if missing ─────────────────────
// Compatible with old cache file names (team_stats_tank01.json) and new names.
teamStats   = readDiskCache("team_stats.json")   ?? readDiskCache("team_stats_tank01.json");
playerStats = readDiskCache("player_stats.json") ?? readDiskCache("player_stats_tank01.json");

if (teamStats)   log("info", `Disk cache: ${teamStats.length} teams`);
if (playerStats) log("info", `Disk cache: ${playerStats.length} players`);

if ((!teamStats || !playerStats) && RAPIDAPI_KEY) {
    log("info", "First-run: fetching stats in background...");
    (async () => {
        try {
            if (!teamStats) {
                teamStats = await buildTeamStats();
                writeDiskCache("team_stats.json", teamStats);
            }
            if (!playerStats) {
                playerStats = await buildPlayerStats(teamStats);
                writeDiskCache("player_stats.json", playerStats);
            }
            log("info", "First-run fetch complete");
        } catch (err) {
            log("error", `First-run fetch failed: ${err.message}`);
        }
    })();
} else if (!RAPIDAPI_KEY) {
    log("warn", "RAPIDAPI_KEY not set — stats/games endpoints will return 503");
}

scheduleWeeklyRefresh();
setTimeout(pollLiveGames, 5_000);
// Load season schedule in background (cached to disk after first run)
setTimeout(loadSeasonSchedule, 10_000);

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    try {
        const parsed  = new URL(req.url, "http://localhost");
        const urlPath = parsed.pathname;
        const ip      = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
        log("info", `${req.method} ${urlPath} — ${ip}`);

        if (isRateLimited(ip)) {
            res.writeHead(429, { "Content-Type": "text/plain" });
            res.end("Too many requests.");
            return;
        }

        function sendJson(code, obj, maxAge = 0) {
            res.writeHead(code, {
                "Content-Type": "application/json",
                "Cache-Control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store",
                "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify(obj));
        }

        // ── /health ──────────────────────────────────────────────────
        if (urlPath === "/health") {
            return sendJson(200, {
                status: "ok",
                keySet:       !!RAPIDAPI_KEY,
                players:      playerData.length,
                teamStats:    teamStats    ? teamStats.length    : null,
                playerStats:  playerStats  ? playerStats.length  : null,
                liveDates:    Object.keys(liveState),
                inGameWindow: isGameWindow(),
                uptime:       Math.floor(process.uptime()),
            });
        }

        // ── /api/players (Sleeper — Wordle) ──────────────────────────
        if (urlPath === "/api/players") {
            return sendJson(200, playerData, 3600);
        }

        // ── /api/daily-player (Sleeper — Wordle) ─────────────────────
        if (urlPath === "/api/daily-player") {
            if (playerData.length === 0) {
                return sendJson(503, { error: "Player data unavailable — Sleeper API may be down" });
            }
            return sendJson(200, getDailyPlayer());
        }

        // ── /api/team-stats ───────────────────────────────────────────
        if (urlPath === "/api/team-stats") {
            if (!teamStats) {
                const msg = RAPIDAPI_KEY
                    ? "Fetching 2026 season data — try again in ~60 seconds"
                    : "RAPIDAPI_KEY not configured";
                return sendJson(503, { status: "loading", message: msg });
            }
            return sendJson(200, teamStats, 900);
        }

        // ── /api/player-stats ─────────────────────────────────────────
        if (urlPath === "/api/player-stats") {
            if (!playerStats) {
                const msg = RAPIDAPI_KEY
                    ? "Fetching player data — try again in ~90 seconds"
                    : "RAPIDAPI_KEY not configured";
                return sendJson(503, { status: "loading", message: msg });
            }
            return sendJson(200, playerStats, 900);
        }

        // ── /api/games?date=YYYYMMDD ──────────────────────────────────
        // Returns all games for a given date, with live state when available.
        // Server-side cache means this endpoint never causes extra Tank01 calls
        // when the browser refreshes — the poller already fetched the data.
        if (urlPath === "/api/games") {
            if (!RAPIDAPI_KEY) {
                return sendJson(503, { status: "no-key", message: "API key not configured" });
            }

            const dateStr = parsed.searchParams.get("date") || todayStr();
            const today   = todayStr();

            // Serve from in-memory live state if fresh (< 3 min)
            const live = liveState[dateStr];
            if (live && Date.now() - live.updatedAt < 180_000) {
                return sendJson(200, { date: dateStr, source: "live", games: live.games });
            }

            // Future dates — serve from pre-loaded season schedule
            if (dateStr > today) {
                const sched = seasonSchedule[dateStr] ?? [];
                return sendJson(200, { date: dateStr, source: "schedule", games: sched }, 3600);
            }

            // Past dates: try disk cache first (games_YYYYMMDD.json)
            const diskKey   = `games_${dateStr}.json`;
            const diskGames = readDiskCache(diskKey);
            if (diskGames && (dateStr < today || diskGames.every(g => g.status === "final"))) {
                return sendJson(200, { date: dateStr, source: "cache", games: diskGames });
            }

            // Fetch fresh from Tank01
            try {
                const games = await fetchGamesForDate(dateStr);
                liveState[dateStr] = { updatedAt: Date.now(), games };

                // Cache to disk once all games are final (past dates or all-final today)
                if (dateStr < today || games.every(g => g.status === "final")) {
                    writeDiskCache(diskKey, games);
                }

                return sendJson(200, { date: dateStr, source: "api", games });
            } catch (err) {
                log("error", `Games fetch error for ${dateStr}: ${err.message}`);
                // Return disk cache as fallback even if potentially stale
                if (diskGames) return sendJson(200, { date: dateStr, source: "stale-cache", games: diskGames });
                return sendJson(502, { status: "error", message: "Failed to fetch game data" });
            }
        }

        // ── /api/game?gameID=... (detailed box score) ─────────────────
        if (urlPath === "/api/game") {
            const gameID = parsed.searchParams.get("gameID");
            if (!gameID) return sendJson(400, { error: "gameID required" });

            const cached = readDiskCache(`boxscore_${gameID}.json`);
            if (cached && cached.status === "final") {
                return sendJson(200, { source: "cache", game: cached });
            }

            if (!RAPIDAPI_KEY) return sendJson(503, { status: "no-key" });
            try {
                const game = await fetchBoxScore(gameID);
                if (game.status === "final") writeDiskCache(`boxscore_${gameID}.json`, game);
                return sendJson(200, { source: "api", game });
            } catch (err) {
                return sendJson(502, { error: err.message });
            }
        }

        // ── /api/debug?endpoint=getNFLScoresOnly&gameDate=20260813 ────
        // Passes all query params (except "endpoint") straight to Tank01.
        // Only for development — remove before final deploy.
        if (urlPath === "/api/debug") {
            if (!RAPIDAPI_KEY) return sendJson(503, { error: "No key" });
            const endpoint = parsed.searchParams.get("endpoint");
            if (!endpoint) return sendJson(400, { error: "endpoint param required" });
            const params = {};
            for (const [k, v] of parsed.searchParams) if (k !== "endpoint") params[k] = v;
            try {
                const raw = await tank01Get(`/${endpoint}`, params);
                return sendJson(200, { endpoint, params, raw });
            } catch (err) {
                return sendJson(502, { error: err.message });
            }
        }

        // ── Static files ──────────────────────────────────────────────
        const filePath = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
        const safePath = path.resolve(filePath);
        if (!safePath.startsWith(path.resolve(__dirname))) {
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end("Forbidden");
            return;
        }

        const ext         = path.extname(filePath).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
        const maxAge      = CACHE_MAX_AGE[ext];
        const cacheHeader = maxAge ? `public, max-age=${maxAge}` : "no-cache, no-store, must-revalidate";

        fs.readFile(filePath, (err, data) => {
            if (err) {
                fs.readFile(path.join(__dirname, "404.html"), (e404, d404) => {
                    res.writeHead(404, { "Content-Type": "text/html" });
                    res.end(e404 ? "<h1>404 — Page not found</h1>" : d404);
                });
                return;
            }
            res.writeHead(200, { "Content-Type": contentType, "Cache-Control": cacheHeader });
            res.end(data);
        });

    } catch (err) {
        log("error", `Request error: ${err.message}`);
        if (!res.headersSent) { res.writeHead(500); res.end("Internal server error"); }
    }
});

fetchPlayerData().then(() => {
    server.listen(PORT, () => log("info", `Server running on port ${PORT}`));
});
