"use strict";
const http       = require("http");
const fs         = require("fs");
const path       = require("path");
const nodemailer = require("nodemailer");

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

let fantasyProjections = null; // weekly projections from getNFLProjections
let injuryData   = { date: "", list: [] };    // from getNFLInjuriesByDate
let inactiveData = { date: "", list: [] };    // from getNFLInactiveList

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

// ── Tank01 daily call budget ──────────────────────────────────────────────────
const DAILY_CALL_LIMIT = 1000; // RapidAPI hard limit per billing window
const HARD_STOP_LIMIT  = 900;  // suspend all calls at this count

// Billing window resets at 22:54 UTC each day.
// Returns "YYYY-MM-DD" for the day the current window started.
function billingDayStr() {
    const now = new Date();
    const h = now.getUTCHours(), m = now.getUTCMinutes();
    const base = new Date(now);
    // Before 22:54 UTC → still in yesterday's window
    if (h < 22 || (h === 22 && m < 54)) base.setUTCDate(base.getUTCDate() - 1);
    const y  = base.getUTCFullYear();
    const mo = String(base.getUTCMonth() + 1).padStart(2, "0");
    const d  = String(base.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
}

// Returns ISO strings for the start and end of the current billing window.
function billingWindowTimes() {
    const [y, mo, d] = billingDayStr().split("-").map(Number);
    const start = new Date(Date.UTC(y, mo - 1, d, 22, 54, 0));
    const end   = new Date(start.getTime() + 24 * 3_600_000);
    return { start: start.toISOString(), end: end.toISOString() };
}

// ── API warning / hard-stop emails ───────────────────────────────────────────
// Requires env vars: GMAIL_USER and GMAIL_APP_PASSWORD (Gmail App Password).
let email500Sent = false; // reset each billing window
let email900Sent = false; // reset each billing window

async function sendApiWarningEmail(count, isHardStop = false) {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
        log("warn", "API warning email skipped — GMAIL_USER / GMAIL_APP_PASSWORD not set");
        return;
    }
    const appUrl    = (process.env.APP_URL || "").replace(/\/$/, "");
    const healthUrl = appUrl ? `${appUrl}/health` : "/health";
    const { start, end } = billingWindowTimes();
    const remaining = Math.max(0, DAILY_CALL_LIMIT - count);

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
    });

    const headline = isHardStop
        ? "🛑 API Hard Stop — Mid Stats"
        : "⚠️ API Limit Warning — Mid Stats";
    const subtitle = isHardStop
        ? `All Tank01 API calls have been suspended. The server will resume automatically when the billing window resets at 22:54 UTC.`
        : `Your Tank01 NFL API usage has hit the ${count}-call threshold.`;
    const accent = isHardStop ? "#c0392b" : "#e67e22";

    const html = `
<div style="font-family:system-ui,sans-serif;max-width:540px;color:#1a1a1a">
  <h2 style="color:${accent};margin-bottom:4px">${headline}</h2>
  <p style="color:#555;margin-top:0">${subtitle}</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:600">Calls used</td><td style="padding:8px 12px;font-weight:700;color:${isHardStop ? "#c0392b" : "#333"}">${count}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Limit</td><td style="padding:8px 12px">${DAILY_CALL_LIMIT}</td></tr>
    <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:600">Remaining</td><td style="padding:8px 12px;color:${remaining < 100 ? "#c0392b" : "#27ae60"};font-weight:700">${remaining}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Window start</td><td style="padding:8px 12px">${start}</td></tr>
    <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:600">Window end</td><td style="padding:8px 12px;font-weight:600">${end}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Resets at</td><td style="padding:8px 12px">22:54 UTC daily</td></tr>
  </table>
  <a href="${healthUrl}" style="display:inline-block;background:#2980b9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">View Server Health →</a>
</div>`;

    const subject = isHardStop
        ? `🛑 API Hard Stop — ${count}/${DAILY_CALL_LIMIT} calls, all requests suspended`
        : `⚠️ API Warning — ${count}/${DAILY_CALL_LIMIT} calls used`;

    try {
        await transporter.sendMail({
            from:    `"Mid Stats" <${gmailUser}>`,
            to:      "thomaslap98@gmail.com",
            subject,
            html,
        });
        log("info", `API ${isHardStop ? "hard-stop" : "warning"} email sent (${count}/${DAILY_CALL_LIMIT} calls)`);
    } catch (err) {
        log("error", `Failed to send API email: ${err.message}`);
    }
}

// Persisted to disk so the count survives server restarts within the same billing window.
let callBudget    = readDiskCache("api_calls.json") || { date: "", count: 0 };
// MANUAL HARD STOP — active until billing window resets at 22:54 UTC 2026-08-14.
// Automatically cleared by checkDailyLimit() when the new window opens.
let apiHardStopped = true;

function checkDailyLimit() {
    const today = billingDayStr();
    if (callBudget.date !== today) {
        // Distinguish a genuine new billing window from a fresh server start.
        // On a fresh start callBudget.date is "" — we must NOT clear apiHardStopped
        // because the disk is wiped on every Render deploy and the hard stop would
        // silently vanish before any API call is even attempted.
        const genuineNewWindow = callBudget.date !== "" && callBudget.date < today;
        callBudget   = { date: today, count: 0 };
        email500Sent = false;
        email900Sent = false;
        writeDiskCache("api_calls.json", callBudget);
        if (genuineNewWindow) {
            apiHardStopped = false; // real new window → lift automatic stop
            const { start, end } = billingWindowTimes();
            log("info", `New billing window — hard stop lifted. ${start} → ${end}`);
        } else {
            // Fresh start: leave apiHardStopped as it was initialized
            const { start, end } = billingWindowTimes();
            log("info", `Tank01 billing window: ${start} → ${end} | hard stop: ${apiHardStopped}`);
        }
    }

    // Hard stop: block all calls until window resets
    if (apiHardStopped) {
        throw new Error("API calls suspended until billing window resets at 22:54 UTC");
    }

    if (callBudget.count >= DAILY_CALL_LIMIT) {
        log("error", `Tank01 absolute limit hit (${callBudget.count}/${DAILY_CALL_LIMIT}). Blocking call.`);
        throw new Error(`Daily API call limit of ${DAILY_CALL_LIMIT} reached — resets at 22:54 UTC`);
    }

    callBudget.count++;

    // 500-call warning email
    if (callBudget.count === 500 && !email500Sent) {
        email500Sent = true;
        log("warn", `Tank01 calls: ${callBudget.count}/${DAILY_CALL_LIMIT} — sending 500-call warning`);
        sendApiWarningEmail(callBudget.count, false).catch(err => log("error", `Email error: ${err.message}`));
    }

    // 900-call hard stop + email
    if (callBudget.count >= HARD_STOP_LIMIT && !apiHardStopped) {
        apiHardStopped = true;
        log("warn", `Tank01 API hard stopped at ${callBudget.count}/${DAILY_CALL_LIMIT} — all calls suspended until 22:54 UTC`);
        if (!email900Sent) {
            email900Sent = true;
            sendApiWarningEmail(callBudget.count, true).catch(err => log("error", `Email error: ${err.message}`));
        }
        writeDiskCache("api_calls.json", callBudget);
    }

    // Persist every 5 calls so a crash doesn't lose more than 5
    if (callBudget.count % 5 === 0) writeDiskCache("api_calls.json", callBudget);
}

// ── Tank01 fetch wrapper ──────────────────────────────────────────────────────
async function tank01Get(endpoint, params = {}) {
    if (!RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY not set");
    checkDailyLimit();
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
    // Thu night, Sat (Dec/playoffs), Sun all-day, Mon night, Wed/Fri for special games
    if (day === 3 && hour >= 17) return true;  // Wed ≥5 pm  (intl, Thanksgiving week, Week 1 opener)
    if (day === 4 && hour >= 19) return true;  // Thu ≥7 pm
    if (day === 5 && hour >= 17) return true;  // Fri ≥5 pm  (preseason, Black Friday, Christmas)
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
        down:       pickStr(raw, "down") || null,
        yardsToGo:  pickStr(raw, "yardsToGo", "yards_to_go", "distance") || null,
        yardLine:   pickStr(raw, "yardLine",  "yard_line",   "scrimmage") || null,
        lastPlay:   pickStr(raw, "lastPlay",  "last_play",   "currentPlay", "playDescription") || null,
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
    if (!RAPIDAPI_KEY || apiHardStopped) return;
    const cacheFile = `schedule_${NFL_SEASON}.json`;
    const metaFile  = `schedule_${NFL_SEASON}_meta.json`;
    const cached    = readDiskCache(cacheFile);
    const meta      = readDiskCache(metaFile) || { lastFetch: 0 };
    const hoursSince = (Date.now() - meta.lastFetch) / 3_600_000;

    if (cached && hoursSince < 6) {
        // Don't re-fetch more often than every 6 hours, even if sparse
        // (avoids burning 22+ calls per restart when API has no data yet)
        Object.assign(seasonSchedule, cached);
        log("info", `Schedule cache: ${Object.keys(seasonSchedule).length} dates (last fetch ${Math.round(hoursSince * 60)}m ago)`);
        return;
    }
    if (cached && hoursSince >= 6) {
        const todayKey = todayStr().replace(/-/g,"");
        const futureDates = Object.keys(cached).filter(d => d >= todayKey);
        if (futureDates.length >= 5) {
            Object.assign(seasonSchedule, cached);
            log("info", `Schedule cache: ${Object.keys(seasonSchedule).length} dates — still healthy, skipping re-fetch`);
            return;
        }
        log("info", `Schedule cache sparse (${futureDates.length} future dates) — re-fetching after ${Math.round(hoursSince)}h`);
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
    writeDiskCache(metaFile, { lastFetch: Date.now() });
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
    // playByPlay:"false" keeps the response compact (same object count, less data).
    // lastPlay / down / yardLine come from gameInfo if the API includes them there.
    const body = await tank01Get("/getNFLBoxScore", { gameID, playByPlay: "false" });
    const info = body?.gameInfo ?? body?.game ?? body ?? {};
    return normalizeGame({ ...info, gameID });
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

    // Skip if the schedule is loaded and today has no entry at all
    const todayKey = todayStr().replace(/-/g,"");
    const schedLoaded = Object.keys(seasonSchedule).length > 0;
    if (schedLoaded && !seasonSchedule[todayKey]) {
        log("info", "Today not in season schedule — skipping live poll");
        return;
    }
    if (schedLoaded && Array.isArray(seasonSchedule[todayKey]) && seasonSchedule[todayKey].length === 0) {
        log("info", "No games today per schedule — skipping live poll");
        return;
    }

    pollRunning = true;

    // Fetch inactive list once per game day (before first active poll)
    await fetchInactives().catch(() => {});

    const today = todayStr();
    try {
        const games = await fetchGamesForDate(today);
        liveState[today] = { updatedAt: Date.now(), games };

        // Enrich up to 4 live games with box score detail (quarter, clock, field position, last play)
        const liveGames = games.filter(g => g.status === "live").slice(0, 4);
        for (const g of liveGames) {
            try {
                const detail = await fetchBoxScore(g.gameID);
                Object.assign(g, {
                    quarter:   detail.quarter,
                    clock:     detail.clock,
                    possession:detail.possession,
                    down:      detail.down,
                    yardsToGo: detail.yardsToGo,
                    yardLine:  detail.yardLine,
                    lastPlay:  detail.lastPlay,
                });
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
    if (apiHardStopped) { log("info", "buildTeamStats skipped — API hard stopped"); return null; }
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
    if (apiHardStopped) { log("info", "buildPlayerStats skipped — API hard stopped"); return null; }
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
            // Enrich with per-game logs (only if players have played games)
            await enrichPlayerStatsFromGameLogs();
            // Refresh projections for upcoming week
            await fetchFantasyProjections(1, "reg");
            log("info", "Weekly refresh complete");
        } catch (err) {
            log("error", `Weekly refresh failed: ${err.message}`);
        }
        setTimeout(refresh, 7 * 24 * 3_600_000);
    }, msUntilNextTuesday3am());
}

// ── Fantasy projections (getNFLProjections, 1 call/week) ─────────────────────
async function fetchFantasyProjections(week = 1, seasonType = "reg") {
    if (!RAPIDAPI_KEY || apiHardStopped) return;
    log("info", `Fetching fantasy projections week ${week} (${seasonType})...`);
    try {
        const body = await tank01Get("/getNFLProjections", { week, season: NFL_SEASON, seasonType });
        if (!body) return;
        log("info", `getNFLProjections keys: ${Object.keys(body).join(", ")}`);
        let raw = Array.isArray(body) ? body
                : (body?.playerProjections ?? body?.projections ?? body?.players ?? null);
        if (!raw) { const v = Object.values(body); if (v.length && v[0] && typeof v[0] === "object") raw = v; }
        if (!Array.isArray(raw)) { log("warn", "getNFLProjections: unrecognized shape"); return; }
        fantasyProjections = { week, seasonType, season: NFL_SEASON, players: raw };
        writeDiskCache("fantasy_projections.json", fantasyProjections);
        log("info", `Fantasy projections: ${raw.length} players`);
    } catch (err) {
        log("error", `fetchFantasyProjections failed: ${err.message}`);
    }
}

// ── Injury report (getNFLInjuriesByDate, 1 call/day) ─────────────────────────
function normalizeInjuryStatus(raw = "") {
    const s = String(raw).toLowerCase();
    if (s.includes("ir") || s.includes("reserve") || s.includes("injured reserve")) return "ir";
    if (s.includes("doubtful"))   return "doubtful";
    if (s.includes("questionable") || s.includes("day-to-day")) return "questionable";
    if (s.includes("out") || s.includes("inactive")) return "out";
    return "active";
}

async function fetchInjuries() {
    if (!RAPIDAPI_KEY || apiHardStopped) return;
    const today = utcDateStr();
    if (injuryData.date === today && injuryData.list.length > 0) return;
    log("info", "Fetching injury report...");
    try {
        const body = await tank01Get("/getNFLInjuriesByDate", { injuryDate: today.replace(/-/g,"") });
        if (!body) return;
        log("info", `getNFLInjuriesByDate keys: ${Object.keys(body).join(", ")}`);
        let raw = Array.isArray(body) ? body : (body?.injuries ?? body?.playerInjuries ?? body?.report ?? null);
        if (!raw) { const v = Object.values(body); if (v.length && v[0] && typeof v[0] === "object") raw = v; }
        if (!Array.isArray(raw)) { log("warn", "getNFLInjuriesByDate: unrecognized shape"); return; }
        const list = raw.map(e => ({
            playerID: pickStr(e, "playerID","id"),
            name:     pickStr(e, "playerName","longName","fullName","name"),
            team:     pickStr(e, "teamAbv","team"),
            pos:      pickStr(e, "pos","position"),
            status:   normalizeInjuryStatus(pickStr(e, "injuryStatus","status","designation")),
            bodyPart: pickStr(e, "bodyPart","injury","description"),
        }));
        injuryData = { date: today, list };
        writeDiskCache("injuries.json", injuryData);
        log("info", `Injury report: ${list.length} players`);
    } catch (err) {
        log("error", `fetchInjuries failed: ${err.message}`);
    }
}

// ── Inactive list (getNFLInactiveList, called before game windows) ────────────
async function fetchInactives() {
    if (!RAPIDAPI_KEY) return;
    const today = todayStr();
    if (inactiveData.date === today && inactiveData.list.length > 0) return;
    log("info", "Fetching inactive list...");
    try {
        const body = await tank01Get("/getNFLInactiveList", { gameDate: today.replace(/-/g,"") });
        if (!body) return;
        log("info", `getNFLInactiveList keys: ${Object.keys(body).join(", ")}`);
        let raw = Array.isArray(body) ? body : (body?.inactiveList ?? body?.inactives ?? body?.players ?? null);
        if (!raw) { const v = Object.values(body); if (v.length && v[0] && typeof v[0] === "object") raw = v; }
        if (!Array.isArray(raw)) { log("warn", "getNFLInactiveList: unrecognized shape"); return; }
        const list = raw.map(e => ({
            playerID: pickStr(e, "playerID","id"),
            name:     pickStr(e, "playerName","longName","fullName","name"),
            team:     pickStr(e, "teamAbv","team"),
            pos:      pickStr(e, "pos","position"),
            status:   "out",
        }));
        inactiveData = { date: today, list };
        writeDiskCache("inactives.json", inactiveData);
        log("info", `Inactive list: ${list.length} players`);
    } catch (err) {
        log("error", `fetchInactives failed: ${err.message}`);
    }
}

// ── Daily injury check at 3pm ET ──────────────────────────────────────────────
function scheduleDailyInjuryCheck() {
    if (!RAPIDAPI_KEY) return;
    const now = new Date();
    const isDST = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10;
    const etOffset = isDST ? 4 : 5;
    const etNow = new Date(now.getTime() - etOffset * 3_600_000);
    let target = new Date(etNow);
    target.setUTCHours(15 + etOffset, 0, 0, 0); // 3pm ET
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    const delay = Math.max(target.getTime() - now.getTime(), 60_000);
    log("info", `Daily injury check scheduled in ${Math.round(delay/60000)} min`);
    setTimeout(async function check() {
        await fetchInjuries().catch(err => log("error", `Daily injury check: ${err.message}`));
        setTimeout(check, 24 * 3_600_000);
    }, delay);
}

// ── Per-player game stats (getNFLGamesForPlayer, weekly) ──────────────────────
// Called after buildPlayerStats — only fetches for players who have played games.
async function enrichPlayerStatsFromGameLogs() {
    if (!playerStats || apiHardStopped) return;
    const SKILL = new Set(["QB","RB","WR","TE"]);
    const active = playerStats.filter(p => SKILL.has(p.pos) && p.games > 0);
    if (!active.length) { log("info", "enrichPlayerStatsFromGameLogs: no active skill players yet"); return; }
    log("info", `Fetching game logs for ${active.length} skill players...`);
    let logged = false;
    for (const player of active) {
        try {
            const body = await tank01Get("/getNFLGamesForPlayer", { playerID: player.id, season: NFL_SEASON });
            if (!logged) { log("info", `getNFLGamesForPlayer keys: ${Object.keys(body ?? {}).join(", ")}`); logged = true; }
            const games = Array.isArray(body) ? body : (body?.playerGameStats ?? body?.games ?? body?.gameLog ?? body?.stats ?? []);
            if (!Array.isArray(games) || !games.length) continue;
            let passYds=0,passTDs=0,passAtt=0,passComp=0,passINT=0,rushYds=0,rushTDs=0,rushAtt=0,recYds=0,recTDs=0,recRec=0,targets=0,gp=0;
            for (const g of games) {
                if (!g || typeof g !== "object") continue; gp++;
                passYds  += pick(g,"passYds","passingYards"); passTDs  += pick(g,"passTD","passTDs");
                passAtt  += pick(g,"passAtt","attempts");     passComp += pick(g,"passComp","completions");
                passINT  += pick(g,"int","INT","interceptions","passInt");
                rushYds  += pick(g,"rushYds","rushingYards"); rushTDs  += pick(g,"rushTD","rushTDs");
                rushAtt  += pick(g,"carries","rushAtt","rushAttempts");
                recYds   += pick(g,"recYds","receivingYards"); recTDs  += pick(g,"recTD","recTDs");
                recRec   += pick(g,"receptions","rec","catches"); targets += pick(g,"targets","tgts","tar");
            }
            if (!gp) continue;
            const idx = playerStats.indexOf(player);
            if (idx >= 0) {
                const g = gp;
                playerStats[idx] = { ...player, games:gp, passYds,passTDs,passAtt,passComp,passINT,
                    compPct: passAtt>0 ? +(passComp/passAtt*100).toFixed(1):0,
                    rushYds,rushTDs,rushAtt, ypc: rushAtt>0?+(rushYds/rushAtt).toFixed(1):0,
                    rushYpg:+(rushYds/g).toFixed(1), recYds,recTDs,recRec,targets,
                    recYpg:+(recYds/g).toFixed(1), recPg:+(recRec/g).toFixed(1),
                    totalYds:passYds+rushYds+recYds, totalTDs:passTDs+rushTDs+recTDs,
                    ypg:+((passYds+rushYds+recYds)/g).toFixed(1) };
            }
        } catch (err) { log("warn", `getNFLGamesForPlayer failed for ${player.name}: ${err.message}`); }
    }
    writeDiskCache("player_stats.json", playerStats);
    log("info", "Game log enrichment complete");
}

// ── Team schedules fallback for future games (getNFLTeamSchedule, 32 calls once) ──
// Hardcoded team abbreviations so loadTeamSchedules doesn't depend on teamStats being loaded
const ALL_TEAM_ABBRS = [
    "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
    "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
    "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"
];

async function loadTeamSchedules() {
    if (!RAPIDAPI_KEY || apiHardStopped) return;
    const todayKey = todayStr().replace(/-/g,"");
    const futureDates = Object.keys(seasonSchedule).filter(d => d >= todayKey);
    if (futureDates.length >= 5) { log("info", `Season schedule has ${futureDates.length} future dates — skipping team schedule fetch`); return; }
    // Cooldown: don't retry more than once every 6 hours to avoid burning 32 calls per restart
    const teamMetaFile = `team_schedule_${NFL_SEASON}_meta.json`;
    const teamMeta = readDiskCache(teamMetaFile) || { lastFetch: 0 };
    const hoursSince = (Date.now() - teamMeta.lastFetch) / 3_600_000;
    if (hoursSince < 6) { log("info", `Team schedule fetch on cooldown (${Math.round(hoursSince * 60)}m ago) — skipping`); return; }
    log("info", `Season schedule sparse (${futureDates.length} future dates) — loading team schedules (32 calls)...`);
    let logged = false;
    for (const abbr of ALL_TEAM_ABBRS) {
        try {
            const body = await tank01Get("/getNFLTeamSchedule", { teamAbv: abbr, season: NFL_SEASON });
            if (!logged) { log("info", `getNFLTeamSchedule keys: ${Object.keys(body ?? {}).join(", ")}`); logged = true; }
            // Try common response shapes — Tank01 often nests under the team abbr key or "schedule"
            const sched = body?.[abbr]?.schedule ?? body?.[abbr] ?? body?.teamSchedule ?? body?.schedule ?? body?.games ?? (Array.isArray(body) ? body : null);
            if (!Array.isArray(sched)) {
                // Last resort: iterate values of the body object
                const vals = Object.values(body ?? {});
                if (vals.length && typeof vals[0] === "object" && !Array.isArray(vals[0])) {
                    // Single team schedule object — skip
                }
                if (!Array.isArray(sched)) continue;
            }
            for (const g of sched) {
                const game = normalizeGame(g);
                if (!game.date) continue;
                const dk = game.date.replace(/-/g,"");
                if (dk < todayKey) continue;
                if (!seasonSchedule[dk]) seasonSchedule[dk] = [];
                if (!seasonSchedule[dk].find(x => x.gameID === game.gameID)) seasonSchedule[dk].push(game);
            }
        } catch (err) { log("warn", `getNFLTeamSchedule failed for ${abbr}: ${err.message}`); }
    }
    writeDiskCache(`schedule_${NFL_SEASON}.json`, seasonSchedule);
    writeDiskCache(teamMetaFile, { lastFetch: Date.now() });
    log("info", `After team schedules: ${Object.keys(seasonSchedule).length} total dates (${Object.keys(seasonSchedule).filter(d=>d>=todayKey).length} future)`);
}

// ── Startup: load from disk cache, then fetch if missing ─────────────────────
// Compatible with old cache file names (team_stats_tank01.json) and new names.
teamStats   = readDiskCache("team_stats.json")   ?? readDiskCache("team_stats_tank01.json");
playerStats = readDiskCache("player_stats.json") ?? readDiskCache("player_stats_tank01.json");
fantasyProjections = readDiskCache("fantasy_projections.json");
injuryData   = readDiskCache("injuries.json")  || { date: "", list: [] };
inactiveData = readDiskCache("inactives.json") || { date: "", list: [] };

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
// Load season schedule, then immediately chain team schedule fallback
setTimeout(async () => {
    await loadSeasonSchedule().catch(err => log("error", `loadSeasonSchedule: ${err.message}`));
    await loadTeamSchedules().catch(err => log("error", `loadTeamSchedules: ${err.message}`));
}, 10_000);
// Fetch projections and injury report on startup
setTimeout(async () => {
    await fetchInjuries().catch(() => {});
    if (!fantasyProjections) await fetchFantasyProjections(1, "reg").catch(() => {});
}, 15_000);
scheduleDailyInjuryCheck();

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
            const { start: winStart, end: winEnd } = billingWindowTimes();
            return sendJson(200, {
                status: "ok",
                keySet:              !!RAPIDAPI_KEY,
                players:             playerData.length,
                teamStats:           teamStats    ? teamStats.length    : null,
                playerStats:         playerStats  ? playerStats.length  : null,
                liveDates:           Object.keys(liveState),
                inGameWindow:        isGameWindow(),
                uptime:              Math.floor(process.uptime()),
                apiCallsUsed:        callBudget.count,
                apiCallsLimit:       DAILY_CALL_LIMIT,
                apiCallsLeft:        Math.max(0, DAILY_CALL_LIMIT - callBudget.count),
                apiHardStopped,
                billingWindowStart:  winStart,
                billingWindowEnd:    winEnd,
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

        // ── /api/projections ──────────────────────────────────────────
        if (urlPath === "/api/projections") {
            if (!fantasyProjections) {
                return sendJson(503, { status: "loading", message: "Projections not yet available" });
            }
            return sendJson(200, fantasyProjections, 3600);
        }

        // ── /api/injuries ─────────────────────────────────────────────
        if (urlPath === "/api/injuries") {
            const combined = [...injuryData.list, ...inactiveData.list];
            return sendJson(200, { date: injuryData.date, players: combined }, 1800);
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

            // Serve from in-memory live state if fresh
            // 1 min TTL when a game is live; 10 min otherwise (prevents a browser
            // auto-refresh every 60s from triggering an API call every 3 min)
            const live = liveState[dateStr];
            if (live) {
                const hasLive = live.games.some(g => g.status === "live");
                const ttl = hasLive ? 60_000 : 600_000;
                if (Date.now() - live.updatedAt < ttl) {
                    return sendJson(200, { date: dateStr, source: "live", games: live.games });
                }
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
