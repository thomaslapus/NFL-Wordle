"use strict";
const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// ── Tank01 NFL API (via RapidAPI) ─────────────────────────────────────────────
// Set RAPIDAPI_KEY in your environment before starting the server.
//   Local:  export RAPIDAPI_KEY=your_key_here  (in terminal before node server.js)
//   Render: Dashboard → Environment → Add RAPIDAPI_KEY=your_key_here
//
// Free plan: 1,000 calls/month. Data is historical (2025 season done),
// so we fetch ~33 calls ONCE on first boot, cache to disk, and never fetch again.
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";
const TANK01_BASE   = `https://${RAPIDAPI_HOST}`;
const NFL_SEASON    = 2025;

// ── Persistent cache directory ────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── In-memory state ───────────────────────────────────────────────────────────
let playerData  = [];    // Wordle: Sleeper API — free, unlimited, has jersey numbers
let teamStats   = null;  // Stats page: Tank01, persisted to disk
let playerStats = null;  // Stats page: Tank01, persisted to disk

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

// ── Tank01 helpers ────────────────────────────────────────────────────────────
async function tank01Get(endpoint, params = {}) {
    if (!RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY not set");
    const url = new URL(`${TANK01_BASE}${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const res = await fetch(url.toString(), {
        headers: {
            "X-RapidAPI-Key":  RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);

    const json = await res.json();
    if (json.statusCode && json.statusCode !== 200) {
        throw new Error(`Tank01 status ${json.statusCode}: ${JSON.stringify(json.body)}`);
    }

    return json.body;
}

// Try multiple field name paths on an object — returns first truthy value.
function pick(obj, ...paths) {
    if (!obj) return 0;
    for (const p of paths) {
        const val = p.split(".").reduce((cur, k) => cur?.[k], obj);
        if (val !== undefined && val !== null && val !== "") return parseFloat(val) || 0;
    }
    return 0;
}

function simplifyPos(pos = "") {
    if (["DE","DT","NT"].includes(pos)) return "DL";
    if (["CB","S","FS","SS"].includes(pos)) return "DB";
    if (["OT","OG","C","G","T"].includes(pos)) return "OL";
    if (["ILB","OLB","MLB"].includes(pos)) return "LB";
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
// 1 call to /getNFLTeams — returns all 32 teams with record + stats
async function buildTeamStats() {
    log("info", "=== Fetching team stats from Tank01 (1 call) ===");

    const body  = await tank01Get("/getNFLTeams", { teamStats: "true", topPerformers: "true" });
    const teams = body?.nflTeams ?? (Array.isArray(body) ? body : []);

    if (teams.length > 0) {
        log("info", `Tank01 team keys: ${Object.keys(teams[0]).join(", ")}`);
        if (teams[0].teamStats) {
            const ts = teams[0].teamStats;
            log("info", `teamStats keys: ${Object.keys(ts).join(", ")}`);
            // Log one level deeper to reveal subcategory field names
            for (const cat of Object.keys(ts).slice(0, 3)) {
                if (typeof ts[cat] === "object") {
                    log("info", `  teamStats.${cat} keys: ${Object.keys(ts[cat]).join(", ")}`);
                }
            }
        }
        if (teams[0].logos) log("info", `logos[0]: ${JSON.stringify(teams[0].logos[0])}`);
    }

    const result = [];

    for (const t of teams) {
        const wins  = parseInt(t.wins)  || 0;
        const loss  = parseInt(t.loss)  || 0;
        const tie   = parseInt(t.tie)   || 0;
        const games = wins + loss + tie || 17;
        const pf    = parseFloat(t.pf)  || 0;
        const pa    = parseFloat(t.pa)  || 0;

        // Logo — Tank01 returns logos as an array of objects or an array of strings
        let logo = "";
        if (Array.isArray(t.logos) && t.logos.length) {
            const l = t.logos[0];
            logo = typeof l === "string" ? l : (l?.src ?? l?.href ?? l?.url ?? "");
        }
        if (!logo) logo = t.espnLogo1 ?? t.espnLogo ?? "";

        // Yards stats from teamStats (Tank01's exact sub-keys logged above on first run)
        let ypg = 0, yapg = 0;
        const ts = t.teamStats;
        if (ts) {
            // Offensive yards — try common nested patterns first
            ypg = pick(ts,
                "Offense.totalYards", "offense.totalYards",
                "Passing.passYds",    "passing.passYds",
                "totalYards",         "totalYds",
                "offYards",           "offTotalYds",
            );
            // Defensive yards allowed
            yapg = pick(ts,
                "Defense.totalYards", "defense.totalYards",
                "defenseTotalYards",  "yardsAllowed",
                "defYards",           "defTotalYds",
            );
            // If season totals (not per-game), convert
            if (ypg  > 3_000) ypg  = +(ypg  / games).toFixed(1);
            if (yapg > 3_000) yapg = +(yapg / games).toFixed(1);
        }

        result.push({
            id:         t.teamID ?? t.teamAbv,
            name:       `${t.teamCity ?? ""} ${t.teamName ?? ""}`.trim(),
            abbr:       (t.teamAbv ?? "").toUpperCase(),
            logo,
            conference: t.conference ?? t.conferenceAbv ?? "",
            division:   t.division   ?? "",
            won:  wins,
            lost: loss,
            ppg:  games > 0 ? +(pf / games).toFixed(1) : 0,
            papg: games > 0 ? +(pa / games).toFixed(1) : 0,
            ypg,
            yapg,
        });
    }

    result.sort((a, b) => a.name.localeCompare(b.name));
    log("info", `=== Team stats done: ${result.length} teams ===`);
    return result;
}

// ── Build player stats ────────────────────────────────────────────────────────
// 32 calls — one per team — via /getNFLTeamRoster?teamAbv=XX&getStats=true
async function buildPlayerStats(teams) {
    log("info", "=== Fetching player stats from Tank01 (32 calls) ===");
    const KEEP = new Set(["QB","RB","WR","TE","K","FB"]);
    const all  = [];
    let sampleLogged = false;

    for (const team of teams) {
        try {
            const body   = await tank01Get("/getNFLTeamRoster", {
                teamAbv:  team.abbr,
                getStats: "true",
            });
            const roster = body?.roster ?? (Array.isArray(body) ? body : []);

            if (!sampleLogged && roster.length > 0) {
                const s = roster[0];
                log("info", `Player keys: ${Object.keys(s).join(", ")}`);
                if (s.stats) log("info", `Player stats keys: ${Object.keys(s.stats).join(", ")}`);
                sampleLogged = true;
            }

            for (const p of roster) {
                const pos = simplifyPos(p.pos ?? p.position ?? "");
                if (!KEEP.has(pos)) continue;

                const s = p.stats ?? {};

                // Try multiple camelCase / abbreviation patterns for each stat.
                // The server logs above will reveal the actual key names on first run.
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

                all.push({
                    id:       p.playerID ?? p.id,
                    name:     p.longName  ?? p.fullName ?? p.name ?? "",
                    pos,
                    team:     team.abbr,
                    teamName: team.name,
                    teamLogo: team.logo,
                    games,
                    passYds, passTDs, passAtt, passComp,
                    compPct:  passAtt > 0 ? +(passComp / passAtt * 100).toFixed(1) : 0,
                    rushYds, rushTDs, rushAtt,
                    ypc:      rushAtt > 0 ? +(rushYds  / rushAtt).toFixed(1) : 0,
                    cpg:      games > 0   ? +(rushAtt  / games).toFixed(1)   : 0,
                    rushYpg:  games > 0   ? +(rushYds  / games).toFixed(1)   : 0,
                    recYds, recTDs, recRec,
                    recYpg:   games > 0   ? +(recYds  / games).toFixed(1)    : 0,
                    recPg:    games > 0   ? +(recRec   / games).toFixed(1)   : 0,
                    totalYds, totalTDs,
                    ypg:      games > 0   ? +(totalYds / games).toFixed(1)   : 0,
                });
            }
        } catch (err) {
            log("warn", `Player stats failed for ${team.abbr}: ${err.message}`);
        }
    }

    log("info", `=== Player stats done: ${all.length} players ===`);
    return all;
}

// ── Startup: load cache OR fetch in background ────────────────────────────────
teamStats   = readDiskCache("team_stats_tank01.json");
playerStats = readDiskCache("player_stats_tank01.json");

if (teamStats)   log("info", `Disk cache: ${teamStats.length} teams`);
if (playerStats) log("info", `Disk cache: ${playerStats.length} players`);

if ((!teamStats || !playerStats) && RAPIDAPI_KEY) {
    log("info", "Starting background Tank01 fetch...");
    (async () => {
        try {
            if (!teamStats) {
                teamStats = await buildTeamStats();
                writeDiskCache("team_stats_tank01.json", teamStats);
            }
            if (!playerStats) {
                playerStats = await buildPlayerStats(teamStats);
                writeDiskCache("player_stats_tank01.json", playerStats);
            }
            log("info", "Background fetch complete — all stats cached to disk");
        } catch (err) {
            log("error", `Background fetch failed: ${err.message}`);
        }
    })();
} else if (!RAPIDAPI_KEY) {
    log("warn", "RAPIDAPI_KEY not set — /api/team-stats and /api/player-stats will return 503");
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
                const message = RAPIDAPI_KEY
                    ? "Stats are loading — server is fetching 2025 data for the first time. Try again in ~60 seconds."
                    : "RAPIDAPI_KEY is not configured on this server.";
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
                const message = RAPIDAPI_KEY
                    ? "Player stats are loading — server is fetching 2025 data. Try again in ~90 seconds."
                    : "RAPIDAPI_KEY is not configured on this server.";
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
