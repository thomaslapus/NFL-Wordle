"use strict";
const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// ── API-Sports NFL ────────────────────────────────────────────────────────────
// Set APISPORTS_KEY in your environment before starting the server.
//   Local:  export APISPORTS_KEY=your_key_here  (in terminal before node server.js)
//   Render: Dashboard → Environment → Add APISPORTS_KEY=your_key_here
//
// Free plan: 100 calls/day.  The 2025 season is done, so data is historical —
// we fetch ~66 calls ONCE on first boot, cache to disk, and never fetch again.
const APISPORTS_KEY = process.env.APISPORTS_KEY || "";
const NFL_LEAGUE    = 1;     // 1 = NFL in API-Sports
const NFL_SEASON    = 2025;

// ── Persistent cache directory ────────────────────────────────────────────────
// JSON files in ./data/ survive server restarts (important on Render free tier).
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── In-memory state ───────────────────────────────────────────────────────────
let playerData  = [];    // Wordle: Sleeper API — free, unlimited, has jersey numbers
let teamStats   = null;  // Stats page: API-Sports, persisted to disk
let playerStats = null;  // Stats page: API-Sports, persisted to disk

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

// ── Sleeper: Wordle player list ───────────────────────────────────────────────
// Sleeper is kept for the Wordle because it provides jersey number + age,
// which the comparison rows need and which API-Sports doesn't expose.
async function fetchPlayerData() {
    try {
        log("info", "Fetching player data from Sleeper API...");
        const res  = await fetch("https://api.sleeper.app/v1/players/nfl");
        const raw  = await res.json();
        playerData = Object.values(raw)
            .filter(p => p.depth_chart_order <= 1 && p.active && p.team)
            .sort((a, b) => a.full_name.localeCompare(b.full_name));
        log("info", `Sleeper: ${playerData.length} active players loaded`);
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

// ── API-Sports helpers ────────────────────────────────────────────────────────
async function apiSportsGet(endpoint, params = {}) {
    if (!APISPORTS_KEY) throw new Error("APISPORTS_KEY not set");
    const url = new URL(`https://v1.american-football.api-sports.io${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const res = await fetch(url.toString(), { headers: { "x-apisports-key": APISPORTS_KEY } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);

    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length) throw new Error(JSON.stringify(json.errors));

    const remaining = json["remaining"]?.["requests-day"] ?? "?";
    log("info", `API-Sports ${endpoint} → ${json.results ?? 0} results, ${remaining} calls left today`);
    return json.response;
}

// Try to read a numeric stat from API-Sports response — handles both
// array [{type,value}] and nested-object {passing:{yards:N}} formats.
function getStat(data, ...keys) {
    if (!data) return 0;
    if (Array.isArray(data)) {
        for (const item of data)
            for (const k of keys)
                if (item.type === k || item.name === k) return parseFloat(item.value) || 0;
        return 0;
    }
    for (const k of keys) {
        const val = k.split(".").reduce((cur, part) => cur?.[part], data);
        if (val !== undefined && val !== null) return parseFloat(val) || 0;
    }
    return 0;
}

function abbrevFromName(name = "") {
    const w = name.split(" ");
    return w[w.length - 1].slice(0, 3).toUpperCase();
}

function simplifyPos(pos = "") {
    if (["DE","DT","NT"].includes(pos)) return "DL";
    if (["CB","S","FS","SS"].includes(pos)) return "DB";
    if (["OT","OG","C","G","T"].includes(pos)) return "OL";
    return pos;
}

// ── Disk cache helpers ────────────────────────────────────────────────────────
function readDiskCache(file) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); }
    catch { return null; }
}
function writeDiskCache(file, data) {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data), "utf8");
}

// ── Build team stats ──────────────────────────────────────────────────────────
// Calls: 1 (standings) + 1 (teams) + 32 (team statistics) = 34 total
async function buildTeamStats() {
    log("info", "=== Fetching team stats from API-Sports (34 calls) ===");

    const standings = await apiSportsGet("/standings", { league: NFL_LEAGUE, season: NFL_SEASON });
    const teams     = await apiSportsGet("/teams",     { league: NFL_LEAGUE, season: NFL_SEASON });

    const teamMap = {};
    for (const t of (teams || [])) teamMap[t.id] = t;

    const standMap = {};
    for (const s of (standings || [])) if (s.team?.id) standMap[s.team.id] = s;

    const result = [];

    for (const [id, stand] of Object.entries(standMap)) {
        const team  = teamMap[id] ?? stand.team ?? {};
        const games = (stand.won || 0) + (stand.lost || 0) + (stand.ties || 0) || 17;
        const ptsFor = stand.points?.for ?? 0;
        const ptsAg  = stand.points?.against ?? 0;

        let ypg = 0, yapg = 0;
        try {
            const stats = await apiSportsGet("/teams/statistics", {
                league: NFL_LEAGUE, season: NFL_SEASON, team: id,
            });
            // Field names differ by API version — try all known aliases
            ypg  = getStat(stats,
                "total_yards", "Total Yards", "total_net_yards",
                "Total Net Yards", "Offensive Yards", "yards.gained",
                "passing.yards",  // fallback: passing only
            );
            yapg = getStat(stats,
                "yards_allowed", "Total Yards Allowed", "Yards Allowed",
                "Defensive Yards", "yards.allowed",
            );
            // If the API returned season totals rather than per-game, convert
            if (ypg  > 3_000) ypg  = +(ypg  / games).toFixed(1);
            if (yapg > 3_000) yapg = +(yapg / games).toFixed(1);
        } catch (err) {
            log("warn", `Team stats skipped for team ${id}: ${err.message}`);
        }

        result.push({
            id:         Number(id),
            name:       team.name ?? "Unknown",
            abbr:       (team.code ?? abbrevFromName(team.name)).toUpperCase(),
            logo:       team.logo ?? "",
            conference: stand.conference ?? "",
            division:   stand.division   ?? "",
            won:        stand.won  ?? 0,
            lost:       stand.lost ?? 0,
            ppg:        games > 0 ? +(ptsFor / games).toFixed(1) : 0,
            papg:       games > 0 ? +(ptsAg  / games).toFixed(1) : 0,
            ypg,
            yapg,
        });
    }

    result.sort((a, b) => a.name.localeCompare(b.name));
    log("info", `=== Team stats done: ${result.length} teams ===`);
    return result;
}

// ── Build player stats ────────────────────────────────────────────────────────
// Calls: 32 (one per team) = 32 total
// Only keeps skill-position players (QB/RB/WR/TE/K) who actually played.
async function buildPlayerStats(teams) {
    log("info", "=== Fetching player stats from API-Sports (32 calls) ===");
    const KEEP = new Set(["QB","RB","WR","TE","K","FB"]);
    const all  = [];

    for (const team of teams) {
        try {
            const res = await apiSportsGet("/players/statistics", {
                league: NFL_LEAGUE, season: NFL_SEASON, team: team.id,
            });

            for (const entry of (res || [])) {
                const p = entry.player;
                if (!p) continue;

                const pos = simplifyPos(p.position ?? "");
                if (!KEEP.has(pos)) continue;

                // statistics may be [{season,passing,...}] or a plain object
                const raw = Array.isArray(entry.statistics)
                    ? (entry.statistics.find(s => s.season === NFL_SEASON) ?? entry.statistics[0] ?? {})
                    : (entry.statistics ?? {});

                const passing   = raw.passing   ?? {};
                const rushing   = raw.rushing   ?? {};
                const receiving = raw.receiving ?? {};
                const gamesRaw  = raw.games     ?? {};

                const games    = typeof gamesRaw === "number" ? gamesRaw : (gamesRaw.played ?? 0);
                const passYds  = passing.yards       ?? 0;
                const passTDs  = passing.touchdowns  ?? 0;
                const passAtt  = passing.attempts    ?? 0;
                const passComp = passing.completions ?? 0;
                const rushYds  = rushing.yards       ?? 0;
                const rushTDs  = rushing.touchdowns  ?? 0;
                const rushAtt  = rushing.attempts    ?? 0;
                const recYds   = receiving.yards       ?? 0;
                const recTDs   = receiving.touchdowns  ?? 0;
                const recRec   = receiving.receptions ?? receiving.total ?? 0;

                const totalYds = passYds + rushYds + recYds;
                const totalTDs = passTDs + rushTDs + recTDs;

                if (totalYds === 0 && totalTDs === 0 && games === 0) continue;

                all.push({
                    id:       p.id,
                    name:     p.name ?? `${p.firstname ?? ""} ${p.lastname ?? ""}`.trim(),
                    pos,
                    team:     team.abbr,
                    teamName: team.name,
                    teamLogo: team.logo,
                    games,
                    passYds, passTDs, passAtt, passComp,
                    compPct:  passAtt > 0  ? +(passComp / passAtt * 100).toFixed(1) : 0,
                    rushYds, rushTDs, rushAtt,
                    ypc:     rushAtt > 0  ? +(rushYds / rushAtt).toFixed(1)  : 0,
                    cpg:     games > 0    ? +(rushAtt / games).toFixed(1)    : 0,
                    rushYpg: games > 0    ? +(rushYds / games).toFixed(1)    : 0,
                    recYds, recTDs, recRec,
                    recYpg:  games > 0   ? +(recYds / games).toFixed(1)     : 0,
                    recPg:   games > 0   ? +(recRec  / games).toFixed(1)    : 0,
                    totalYds, totalTDs,
                    ypg:     games > 0   ? +(totalYds / games).toFixed(1)   : 0,
                });
            }
        } catch (err) {
            log("warn", `Player stats failed for ${team.name}: ${err.message}`);
        }
    }

    log("info", `=== Player stats done: ${all.length} players ===`);
    return all;
}

// ── Startup: load cache OR fetch in background ────────────────────────────────
teamStats   = readDiskCache("team_stats_2025.json");
playerStats = readDiskCache("player_stats_2025.json");

if (teamStats)   log("info", `Disk cache: ${teamStats.length} teams`);
if (playerStats) log("info", `Disk cache: ${playerStats.length} players`);

if ((!teamStats || !playerStats) && APISPORTS_KEY) {
    log("info", "Starting background API-Sports fetch...");
    (async () => {
        try {
            if (!teamStats) {
                teamStats = await buildTeamStats();
                writeDiskCache("team_stats_2025.json", teamStats);
            }
            if (!playerStats) {
                playerStats = await buildPlayerStats(teamStats);
                writeDiskCache("player_stats_2025.json", playerStats);
            }
            log("info", "Background fetch complete — all stats cached to disk");
        } catch (err) {
            log("error", `Background fetch failed: ${err.message}`);
        }
    })();
} else if (!APISPORTS_KEY) {
    log("warn", "APISPORTS_KEY not set — /api/team-stats and /api/player-stats will return 503");
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    try {
        const urlPath = req.url.split("?")[0];
        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
        log("info", `${req.method} ${urlPath} — ${ip}`);

        if (isRateLimited(ip)) {
            res.writeHead(429, { "Content-Type": "text/plain" });
            res.end("Too many requests. Please slow down.");
            return;
        }

        // ── Health check ────────────────────────────────────────────
        if (urlPath === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                status: "ok",
                players:     playerData.length,
                teamStats:   teamStats   ? teamStats.length   : null,
                playerStats: playerStats ? playerStats.length : null,
                uptime:      Math.floor(process.uptime()),
            }));
            return;
        }

        // ── Wordle: player list (Sleeper) ───────────────────────────
        if (urlPath === "/api/players") {
            res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
            res.end(JSON.stringify(playerData));
            return;
        }

        // ── Wordle: daily player ────────────────────────────────────
        if (urlPath === "/api/daily-player") {
            if (playerData.length === 0) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Player data unavailable — Sleeper API may be down" }));
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify(getDailyPlayer()));
            return;
        }

        // ── Stats: team data ────────────────────────────────────────
        if (urlPath === "/api/team-stats") {
            if (!teamStats) {
                const message = APISPORTS_KEY
                    ? "Stats are loading — server is fetching 2025 data for the first time. Try again in ~60 seconds."
                    : "APISPORTS_KEY is not configured on this server.";
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "loading", message }));
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
            res.end(JSON.stringify(teamStats));
            return;
        }

        // ── Stats: player data ──────────────────────────────────────
        if (urlPath === "/api/player-stats") {
            if (!playerStats) {
                const message = APISPORTS_KEY
                    ? "Player stats are loading — server is fetching 2025 data. Try again in ~90 seconds."
                    : "APISPORTS_KEY is not configured on this server.";
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "loading", message }));
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
            res.end(JSON.stringify(playerStats));
            return;
        }

        // ── Static files ────────────────────────────────────────────
        const filePath = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
        const safePath = path.resolve(filePath);
        if (!safePath.startsWith(path.resolve(__dirname))) {
            log("warn", `Path traversal blocked: ${urlPath}`);
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end("Forbidden");
            return;
        }

        const ext         = path.extname(filePath).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
        const maxAge      = CACHE_MAX_AGE[ext];
        const cacheHeader = maxAge
            ? `public, max-age=${maxAge}`
            : "no-cache, no-store, must-revalidate";

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
        log("error", `Unhandled request error: ${err.message}`);
        if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal server error");
        }
    }
});

// Start Sleeper fetch first, then open the port
fetchPlayerData().then(() => {
    server.listen(PORT, () => log("info", `Server running on port ${PORT}`));
});
