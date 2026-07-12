// ============================================================
// NFL Wordle — Node.js HTTP server
// Tier 3 infrastructure additions:
//   - Environment variable port (process.env.PORT)
//   - Structured logger with timestamps
//   - /health endpoint
//   - Cache-Control headers for static assets
//   - In-memory rate limiting
//   - Path traversal protection
// ============================================================

const http = require("http");
const fs   = require("fs");
const path = require("path");

// Was: hardcoded 3000
// Now: reads PORT from environment variable first.
//      Hosting platforms (Render, Railway, Fly.io) inject their own port via process.env.PORT —
//      if you hardcode 3000 your app won't bind to the right port and will fail to start.
const PORT = process.env.PORT || 3000;

let playerData = [];

// ============================================================
// Logger
// Was: scattered console.log() calls with no timestamps or levels
// Now: every log line has an ISO timestamp and a severity level,
//      making production logs grep-able and readable
// ============================================================
function log(level, message) {
    const ts = new Date().toISOString(); // e.g. "2026-06-15T14:32:01.123Z"
    console.log(`[${ts}] [${level.toUpperCase()}] ${message}`);
}

// ============================================================
// Rate limiter
// Was: no rate limiting — one user or bot could send unlimited requests
// Now: tracks request count per IP in a 60-second sliding window.
//      If a single IP exceeds 100 requests per minute it gets a 429 response.
//      Map entries are cleaned up every 5 minutes to prevent memory growth.
// ============================================================
const rateLimitMap = new Map(); // key: IP string, value: { count, resetTime }

function isRateLimited(ip) {
    const now       = Date.now();
    const WINDOW_MS = 60_000; // 1 minute
    const MAX_REQS  = 100;

    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetTime) {
        // First request this window, or the window has expired — start a fresh window
        rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
        return false;
    }

    if (entry.count >= MAX_REQS) return true; // over the limit

    entry.count++;
    return false;
}

// Sweep stale entries every 5 minutes so the Map doesn't grow forever
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetTime) rateLimitMap.delete(ip);
    }
}, 5 * 60_000);

// ============================================================
// Content-type map
// Was: if/else chain covering only .css and .js
// Now: object lookup; add new file types here as needed
// ============================================================
const CONTENT_TYPES = {
    ".html": "text/html",
    ".css":  "text/css",
    ".js":   "application/javascript",
    ".json": "application/json",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
};

// ============================================================
// Cache-Control headers
// Was: no cache headers — browsers re-downloaded every file on every page load
// Now: CSS and JS are cacheable for 1 day (they don't change often);
//      HTML is always re-fetched so users see the latest markup immediately.
//      Images can be cached for a week.
// ============================================================
const CACHE_MAX_AGE = {
    ".css": 86_400,   // 1 day in seconds
    ".js":  86_400,
    ".png": 604_800,  // 7 days
    ".jpg": 604_800,
};

// ============================================================
// Player data — fetched from Sleeper API once at startup, held in memory
// ============================================================
async function fetchPlayerData() {
    try {
        log("info", "Fetching player data from Sleeper API...");
        const apiRes    = await fetch("https://api.sleeper.app/v1/players/nfl");
        const rawData   = await apiRes.json();

        playerData = Object.values(rawData).filter(
            p => p.depth_chart_order && p.depth_chart_order <= 1 &&
                 p.active === true && p.team !== null
        );
        playerData.sort((a, b) => a.full_name.localeCompare(b.full_name));

        log("info", `Player data loaded (${playerData.length} players)`);
    } catch (err) {
        log("error", `Failed to fetch player data: ${err.message}`);
    }
}

// Deterministic daily player selection — same player for all users on the same UTC date.
// The date string is hashed to a stable array index so no database or cron job is needed;
// the answer simply changes when the date changes at midnight UTC.
function getDailyPlayer() {
    const today = new Date().toISOString().slice(0, 10); // "2026-06-15"
    let hash    = 0;
    for (let i = 0; i < today.length; i++) {
        hash = (hash * 31 + today.charCodeAt(i)) % playerData.length;
    }
    return playerData[Math.abs(hash)];
}

// ============================================================
// HTTP server
// ============================================================
const server = http.createServer((req, res) => {
    // Strip query strings (e.g. /file.css?v=2 → /file.css) before routing
    const urlPath = req.url.split("?")[0];

    // Get the client's real IP; x-forwarded-for is set by proxies/load balancers
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    log("info", `${req.method} ${urlPath} — ${ip}`);

    // Rate limit check — return 429 Too Many Requests if over the limit
    if (isRateLimited(ip)) {
        res.writeHead(429, { "Content-Type": "text/plain" });
        res.end("Too many requests. Please slow down.");
        return;
    }

    // ---- Health check ----
    // Was: no health check endpoint
    // Now: hosting platforms (Render, Railway, Fly) ping /health to verify the app is alive.
    //      Returns JSON with status, player count, and server uptime in seconds.
    if (urlPath === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status:  "ok",
            players: playerData.length,
            uptime:  Math.floor(process.uptime())
        }));
        return;
    }

    // ---- API: player list (for autocomplete) ----
    if (urlPath === "/api/players") {
        res.writeHead(200, {
            "Content-Type":  "application/json",
            "Cache-Control": "public, max-age=3600", // browsers cache for 1 hour
        });
        res.end(JSON.stringify(playerData));
        return;
    }

    // ---- API: today's daily player ----
    if (urlPath === "/api/daily-player") {
        res.writeHead(200, {
            "Content-Type":  "application/json",
            "Cache-Control": "no-store", // never cache the answer
        });
        res.end(JSON.stringify(getDailyPlayer()));
        return;
    }

    // ---- Static file serving ----

    // Build the file path; map "/" to the main HTML file
    const filePath = path.join(__dirname, urlPath === "/" ? "NFL-Wordle.html" : urlPath);

    // Path traversal protection:
    // Was: no protection — a crafted URL like /../../etc/passwd would resolve outside the project
    //      folder and expose arbitrary server files
    // Now: path.resolve() normalises the path (removes ../ sequences), then we confirm
    //      the result still starts inside __dirname before reading anything
    const safePath = path.resolve(filePath);
    if (!safePath.startsWith(path.resolve(__dirname))) {
        log("warn", `Blocked path traversal attempt: ${urlPath} from ${ip}`);
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
    }

    const ext         = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const maxAge      = CACHE_MAX_AGE[ext];
    const cacheHeader = maxAge
        ? `public, max-age=${maxAge}`
        : "no-cache, no-store, must-revalidate"; // HTML: always re-fetch

    fs.readFile(filePath, (err, data) => {
        if (err) {
            log("warn", `File not found: ${urlPath}`);
            // Try to serve the custom 404 page; fall back to a plain text response
            fs.readFile(path.join(__dirname, "404.html"), (err404, data404) => {
                res.writeHead(404, { "Content-Type": "text/html" });
                res.end(err404 ? "<h1>404 — Page not found</h1>" : data404);
            });
            return;
        }

        res.writeHead(200, {
            "Content-Type":  contentType,
            "Cache-Control": cacheHeader,
        });
        res.end(data);
    });
});

// ============================================================
// Startup
// Was: server.listen() called immediately while fetchPlayerData() was still in-flight
//      (race condition — early requests got empty player data and crashed /api/daily-player)
// Now: await the player data fetch before opening the port so the server is always ready
// ============================================================
fetchPlayerData().then(() => {
    server.listen(PORT, () => {
        log("info", `Server running on port ${PORT}`);
    });
});
