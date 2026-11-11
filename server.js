"use strict";
const http       = require("http");
const fs         = require("fs");
const path       = require("path");
const crypto     = require("crypto");
const nodemailer = require("nodemailer");
const Database   = require("better-sqlite3");

// Load .env file if present (no dotenv dependency — plain KEY=VALUE parser)
try {
    const envFile = path.join(__dirname, ".env");
    fs.readFileSync(envFile, "utf8").split("\n").forEach(line => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
} catch {}

const PORT = process.env.PORT || 3000;

// ── Tank01 NFL API (via RapidAPI) ─────────────────────────────────────────────
// Set RAPIDAPI_KEY in .env or your environment before starting the server.
//   Local:  echo "RAPIDAPI_KEY=your_key_here" > .env
//   Render: Dashboard → Environment → RAPIDAPI_KEY=your_key_here
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";
const TANK01_BASE   = `https://${RAPIDAPI_HOST}`;
const NFL_SEASON    = 2026;

// How often the background poller refreshes live game state (during game windows only).
// 120 s × ~60 cycles/day × ~20 game days/season ≈ ~3,600 calls/season for live polling.
// Each cycle = 1 call to getNFLGamesForDate + up to 4 box-score calls for live detail.
const LIVE_POLL_MS = 120_000;

// Set LIVE_POLLING=false (or NO_POLL=1) to start the server without any API calls.
// Useful during DB seeding days when the budget is exhausted.
//   LIVE_POLLING=false node server.js
const LIVE_POLLING = process.env.LIVE_POLLING !== "false" && process.env.NO_POLL !== "1";

// ── Persistent cache directory ────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ── SQLite database ───────────────────────────────────────────────────────────
let nflDb = null;
try {
    nflDb = new Database(path.join(DATA_DIR, "nfl.db"));
    nflDb.pragma("journal_mode = WAL");
    nflDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL COLLATE NOCASE,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            last_login INTEGER,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_prefs (
            user_id INTEGER NOT NULL,
            pref_key TEXT NOT NULL,
            pref_val TEXT NOT NULL,
            PRIMARY KEY (user_id, pref_key)
        );
    `);
} catch (err) {
    console.warn(`[WARN] SQLite unavailable: ${err.message} — falling back to JSON cache`);
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
}
function genToken() {
    return crypto.randomBytes(32).toString("hex");
}
function getAuthUser(req) {
    if (!nflDb) return null;
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;
    const session = nflDb.prepare("SELECT user_id, expires_at FROM user_sessions WHERE token=?").get(token);
    if (!session || session.expires_at < Math.floor(Date.now()/1000)) return null;
    return nflDb.prepare("SELECT id, email, username FROM users WHERE id=?").get(session.user_id);
}

// Load 2025 player totals from DB into the hist2025Stats format the server already uses
function loadHist2025StatsFromDB() {
    if (!nflDb) return null;
    try {
        const rows = nflDb.prepare(`
            SELECT p.espn_id AS espnId, p.name, p.position AS pos,
                   p.draft_year AS draftYear, p.draft_round AS draftRound, p.draft_pick AS draftPick,
                   COALESCE(t.team_abbr, stints.team_abbr) AS team,
                   COALESCE(t.games_played, 0) AS games,
                   COALESCE(t.passing_att, 0)  AS passAtt,
                   COALESCE(t.passing_cmp, 0)  AS passComp,
                   COALESCE(t.passing_yds, 0)  AS passYds,
                   COALESCE(t.passing_tds, 0)  AS passTDs,
                   COALESCE(t.interceptions, 0) AS passINT,
                   COALESCE(t.fumbles_lost, 0)  AS fumbleLost,
                   COALESCE(t.rushing_att, 0)  AS rushAtt,
                   COALESCE(t.rushing_yds, 0)  AS rushYds,
                   COALESCE(t.rushing_tds, 0)  AS rushTDs,
                   COALESCE(t.targets, 0)       AS targets,
                   COALESCE(t.receptions, 0)    AS recRec,
                   COALESCE(t.receiving_yds, 0) AS recYds,
                   COALESCE(t.receiving_tds, 0) AS recTDs,
                   COALESCE(t.fantasy_pts_std, 0) AS fantasyPtsStd,
                   COALESCE(t.fantasy_pts_ppr, 0) AS fantasyPtsPpr,
                   COALESCE(t.sacks, 0)              AS sacks,
                   COALESCE(t.solo_tackles, 0)       AS soloTackles,
                   COALESCE(t.assisted_tackles, 0)   AS assistedTackles,
                   COALESCE(t.tackles_for_loss, 0)   AS tacklesForLoss,
                   COALESCE(t.passes_defended, 0)    AS passesDefended,
                   COALESCE(t.def_interceptions, 0)  AS defInterceptions,
                   COALESCE(t.forced_fumbles, 0)     AS forcedFumbles,
                   COALESCE(t.def_tds, 0)            AS defTds,
                   COALESCE(gl.total_snaps, 0)  AS totalSnaps
            FROM players p
            LEFT JOIN season_player_totals_2025 t
                   ON t.espn_id = p.espn_id AND t.team_abbr != 'TOT'
            LEFT JOIN (
                SELECT espn_id, MIN(team_abbr) AS team_abbr
                FROM player_team_stints WHERE season = 2025
                GROUP BY espn_id
            ) stints ON stints.espn_id = p.espn_id
            LEFT JOIN (
                SELECT espn_id, SUM(COALESCE(snap_count, 0)) AS total_snaps
                FROM game_logs WHERE season = 2025 AND snap_count IS NOT NULL
                GROUP BY espn_id
            ) gl ON gl.espn_id = p.espn_id
            WHERE p.position IN (
                'QB','RB','WR','TE','K',
                'DE','DT','NT','LB','ILB','OLB','MLB','CB','S','FS','SS','DB','EDG'
            )
        `).all();
        if (!rows.length) return null;
        return rows.map(r => {
            const g = Math.max(1, r.games);
            return {
                id: r.espnId, espnId: r.espnId, name: r.name, pos: r.pos, team: r.team,
                draftYear: r.draftYear, draftRound: r.draftRound, draftPick: r.draftPick,
                games: r.games,
                passYds: r.passYds,  passTDs: r.passTDs,  passAtt: r.passAtt,
                passCmp: r.passComp, passINT: r.passINT, fumbleLost: r.fumbleLost,
                compPct: r.passAtt > 0 ? +(r.passComp / r.passAtt * 100).toFixed(1) : 0,
                rushYds: r.rushYds,  rushTDs: r.rushTDs,  rushAtt: r.rushAtt,
                ypc:     r.rushAtt > 0 ? +(r.rushYds / r.rushAtt).toFixed(1) : 0,
                rushYpg: +(r.rushYds / g).toFixed(1),
                recYds: r.recYds,   recTDs: r.recTDs,   recRec: r.recRec,
                targets: r.targets,
                recYpg: +(r.recYds / g).toFixed(1),
                recPg:  +(r.recRec / g).toFixed(1),
                totalYds: r.passYds + r.rushYds + r.recYds,
                totalTDs: r.passTDs + r.rushTDs + r.recTDs,
                ypg: +((r.passYds + r.rushYds + r.recYds) / g).toFixed(1),
                snapsPerGame: r.totalSnaps > 0 ? +(r.totalSnaps / g).toFixed(1) : null,
                fantasyPtsStd: r.fantasyPtsStd,
                fantasyPtsPpr: r.fantasyPtsPpr,
                sacks:          r.sacks,
                soloTackles:    r.soloTackles,
                assistedTackles: r.assistedTackles,
                tacklesForLoss: r.tacklesForLoss,
                passesDefended: r.passesDefended,
                defInterceptions: r.defInterceptions,
                forcedFumbles:  r.forcedFumbles,
                defTds:         r.defTds,
            };
        });
    } catch (err) {
        console.warn(`[WARN] loadHist2025StatsFromDB: ${err.message}`);
        return null;
    }
}

// Load 2025 player stats from game_logs directly, optionally filtered by week range.
// maxWeek=18 → regular season only; maxWeek=23 → include playoffs.
function loadHist2025StatsByWeekFromDB(maxWeek = 23) {
    if (!nflDb) return null;
    try {
        const rows = nflDb.prepare(`
            SELECT p.espn_id AS espnId, p.name, p.position AS pos,
                   p.draft_year AS draftYear, p.draft_round AS draftRound, p.draft_pick AS draftPick,
                   COALESCE(last_gl.team_abbr, stints.team_abbr) AS team,
                   COUNT(DISTINCT CASE WHEN g.week >= 1 AND g.week <= ? THEN g.game_id END) AS games,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.passing_att, 0)   ELSE 0 END) AS passAtt,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.passing_cmp, 0)   ELSE 0 END) AS passComp,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.passing_yds, 0)   ELSE 0 END) AS passYds,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.passing_tds, 0)   ELSE 0 END) AS passTDs,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.interceptions, 0) ELSE 0 END) AS passINT,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.fumbles_lost, 0)  ELSE 0 END) AS fumbleLost,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.rushing_att, 0)   ELSE 0 END) AS rushAtt,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.rushing_yds, 0)   ELSE 0 END) AS rushYds,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.rushing_tds, 0)   ELSE 0 END) AS rushTDs,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.targets, 0)       ELSE 0 END) AS targets,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.receptions, 0)    ELSE 0 END) AS recRec,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.receiving_yds, 0) ELSE 0 END) AS recYds,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.receiving_tds, 0) ELSE 0 END) AS recTDs,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.fantasy_pts_std, 0) ELSE 0 END) AS fantasyPtsStd,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.fantasy_pts_ppr, 0) ELSE 0 END) AS fantasyPtsPpr,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.sacks, 0)              ELSE 0 END) AS sacks,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.solo_tackles, 0)       ELSE 0 END) AS soloTackles,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.assisted_tackles, 0)   ELSE 0 END) AS assistedTackles,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.tackles_for_loss, 0)   ELSE 0 END) AS tacklesForLoss,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.passes_defended, 0)    ELSE 0 END) AS passesDefended,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.def_interceptions, 0)  ELSE 0 END) AS defInterceptions,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.forced_fumbles, 0)     ELSE 0 END) AS forcedFumbles,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? THEN COALESCE(g.def_tds, 0)            ELSE 0 END) AS defTds,
                   SUM(CASE WHEN g.week >= 1 AND g.week <= ? AND g.snap_count IS NOT NULL THEN COALESCE(g.snap_count, 0) ELSE 0 END) AS totalSnaps
            FROM players p
            LEFT JOIN game_logs g ON g.espn_id = p.espn_id AND g.season = 2025
            LEFT JOIN (
                SELECT espn_id, team_abbr, MAX(week) AS _w
                FROM game_logs WHERE season = 2025 AND week BETWEEN 1 AND 18
                GROUP BY espn_id
            ) last_gl ON last_gl.espn_id = p.espn_id
            LEFT JOIN (
                SELECT espn_id, MIN(team_abbr) AS team_abbr
                FROM player_team_stints WHERE season = 2025
                GROUP BY espn_id
            ) stints ON stints.espn_id = p.espn_id
            WHERE p.position IN (
                'QB','RB','WR','TE','K',
                'DE','DT','NT','LB','ILB','OLB','MLB','CB','S','FS','SS','DB','EDG'
            )
            GROUP BY p.espn_id
        `).all(...Array(25).fill(maxWeek));
        if (!rows.length) return null;
        return rows.map(r => {
            const g = Math.max(1, r.games);
            return {
                id: r.espnId, espnId: r.espnId, name: r.name, pos: r.pos, team: r.team,
                draftYear: r.draftYear, draftRound: r.draftRound, draftPick: r.draftPick,
                games: r.games,
                passYds: r.passYds,  passTDs: r.passTDs,  passAtt: r.passAtt,
                passCmp: r.passComp, passINT: r.passINT, fumbleLost: r.fumbleLost,
                compPct: r.passAtt > 0 ? +(r.passComp / r.passAtt * 100).toFixed(1) : 0,
                rushYds: r.rushYds,  rushTDs: r.rushTDs,  rushAtt: r.rushAtt,
                ypc:     r.rushAtt > 0 ? +(r.rushYds / r.rushAtt).toFixed(1) : 0,
                rushYpg: +(r.rushYds / g).toFixed(1),
                recYds: r.recYds,   recTDs: r.recTDs,   recRec: r.recRec,
                targets: r.targets,
                recYpg: +(r.recYds / g).toFixed(1),
                recPg:  +(r.recRec / g).toFixed(1),
                totalYds: r.passYds + r.rushYds + r.recYds,
                totalTDs: r.passTDs + r.rushTDs + r.recTDs,
                ypg: +((r.passYds + r.rushYds + r.recYds) / g).toFixed(1),
                snapsPerGame: r.totalSnaps > 0 ? +(r.totalSnaps / g).toFixed(1) : null,
                fantasyPtsStd: r.fantasyPtsStd,
                fantasyPtsPpr: r.fantasyPtsPpr,
                sacks: r.sacks, soloTackles: r.soloTackles, assistedTackles: r.assistedTackles,
                tacklesForLoss: r.tacklesForLoss, passesDefended: r.passesDefended,
                defInterceptions: r.defInterceptions, forcedFumbles: r.forcedFumbles, defTds: r.defTds,
            };
        });
    } catch (err) {
        console.warn(`[WARN] loadHist2025StatsByWeekFromDB: ${err.message}`);
        return null;
    }
}

// Load 2026 player totals from DB (same structure as 2025 loader)
function loadHist2026StatsFromDB() {
    if (!nflDb) return null;
    try {
        const rows = nflDb.prepare(`
            SELECT p.espn_id AS espnId, p.name, p.position AS pos,
                   p.draft_year AS draftYear, p.draft_round AS draftRound, p.draft_pick AS draftPick,
                   COALESCE(t.team_abbr, (
                       SELECT s.team_abbr FROM player_team_stints s
                       WHERE s.espn_id = p.espn_id
                       ORDER BY s.season DESC, s.week_start DESC LIMIT 1
                   ), '—') AS team,
                   COALESCE(t.games_played, 0) AS games,
                   COALESCE(t.passing_att, 0)  AS passAtt,
                   COALESCE(t.passing_cmp, 0)  AS passComp,
                   COALESCE(t.passing_yds, 0)  AS passYds,
                   COALESCE(t.passing_tds, 0)  AS passTDs,
                   COALESCE(t.interceptions, 0) AS passINT,
                   COALESCE(t.fumbles_lost, 0)  AS fumbleLost,
                   COALESCE(t.rushing_att, 0)  AS rushAtt,
                   COALESCE(t.rushing_yds, 0)  AS rushYds,
                   COALESCE(t.rushing_tds, 0)  AS rushTDs,
                   COALESCE(t.targets, 0)       AS targets,
                   COALESCE(t.receptions, 0)    AS recRec,
                   COALESCE(t.receiving_yds, 0) AS recYds,
                   COALESCE(t.receiving_tds, 0) AS recTDs,
                   COALESCE(t.fantasy_pts_std, 0) AS fantasyPtsStd,
                   COALESCE(t.fantasy_pts_ppr, 0) AS fantasyPtsPpr,
                   COALESCE(t.sacks, 0)              AS sacks,
                   COALESCE(t.solo_tackles, 0)       AS soloTackles,
                   COALESCE(t.assisted_tackles, 0)   AS assistedTackles,
                   COALESCE(t.tackles_for_loss, 0)   AS tacklesForLoss,
                   COALESCE(t.passes_defended, 0)    AS passesDefended,
                   COALESCE(t.def_interceptions, 0)  AS defInterceptions,
                   COALESCE(t.forced_fumbles, 0)     AS forcedFumbles,
                   COALESCE(t.def_tds, 0)            AS defTds
            FROM players p
            LEFT JOIN season_player_totals_2026 t ON t.espn_id = p.espn_id
            WHERE p.position IN (
                'QB','RB','WR','TE','K',
                'DE','DT','NT','LB','ILB','OLB','MLB','CB','S','FS','SS','DB','EDG'
            )
        `).all();
        if (!rows.length) return null;
        return rows.map(r => {
            const g = Math.max(1, r.games);
            return {
                id: r.espnId, espnId: r.espnId, name: r.name, pos: r.pos, team: r.team,
                draftYear: r.draftYear, draftRound: r.draftRound, draftPick: r.draftPick,
                games: r.games,
                passYds: r.passYds, passTDs: r.passTDs, passAtt: r.passAtt,
                passCmp: r.passComp, passINT: r.passINT, fumbleLost: r.fumbleLost,
                compPct: r.passAtt > 0 ? +(r.passComp / r.passAtt * 100).toFixed(1) : 0,
                rushYds: r.rushYds, rushTDs: r.rushTDs, rushAtt: r.rushAtt,
                ypc: r.rushAtt > 0 ? +(r.rushYds / r.rushAtt).toFixed(1) : 0,
                rushYpg: +(r.rushYds / g).toFixed(1),
                recYds: r.recYds, recTDs: r.recTDs, recRec: r.recRec, targets: r.targets,
                recYpg: +(r.recYds / g).toFixed(1),
                recPg:  +(r.recRec / g).toFixed(1),
                totalYds: r.passYds + r.rushYds + r.recYds,
                totalTDs: r.passTDs + r.rushTDs + r.recTDs,
                ypg: +((r.passYds + r.rushYds + r.recYds) / g).toFixed(1),
                fantasyPtsStd: r.fantasyPtsStd, fantasyPtsPpr: r.fantasyPtsPpr,
                sacks: r.sacks, soloTackles: r.soloTackles, assistedTackles: r.assistedTackles,
                tacklesForLoss: r.tacklesForLoss, passesDefended: r.passesDefended,
                defInterceptions: r.defInterceptions, forcedFumbles: r.forcedFumbles, defTds: r.defTds,
            };
        });
    } catch (err) {
        console.warn(`[WARN] loadHist2026StatsFromDB: ${err.message}`);
        return null;
    }
}

// Load 2025 team standings from DB into the hist2025TeamStats format
function loadHist2025TeamStatsFromDB() {
    if (!nflDb) return null;
    try {
        const rows = nflDb.prepare(`
            SELECT t.abbr, te.name, te.conference, te.division, te.logo_url AS logo,
                   t.won, t.lost, t.tied, t.ppg, t.papg, t.ypg, t.yapg
            FROM team_season_stats_2025 t
            JOIN teams te ON te.abbr = t.abbr
        `).all();
        if (!rows.length) return null;
        return rows.map(r => ({
            abbr: r.abbr, name: r.name, conference: r.conference,
            division: r.division, logo: r.logo,
            won: r.won, lost: r.lost, tied: r.tied,
            ppg: r.ppg, papg: r.papg, ypg: r.ypg, yapg: r.yapg,
        }));
    } catch (err) {
        console.warn(`[WARN] loadHist2025TeamStatsFromDB: ${err.message}`);
        return null;
    }
}

// Load the 2026 season schedule from DB into the in-memory seasonSchedule object
function loadScheduleFromDB() {
    if (!nflDb) return 0;
    try {
        const rows = nflDb.prepare(`
            SELECT game_id, game_date, week, home_team, away_team,
                   kickoff, channel, status, home_score, away_score
            FROM schedules WHERE season = ?
        `).all(NFL_SEASON);
        for (const g of rows) {
            if (!seasonSchedule[g.game_date]) seasonSchedule[g.game_date] = [];
            const already = seasonSchedule[g.game_date].find(x => x.gameID === g.game_id);
            if (!already) {
                seasonSchedule[g.game_date].push({
                    gameID:    g.game_id,
                    date:      g.game_date,
                    kickoff:   g.kickoff   || "",
                    channel:   g.channel   || "",
                    status:    g.status    || "upcoming",
                    awayTeam:  g.away_team,
                    homeTeam:  g.home_team,
                    awayScore: g.away_score ?? null,
                    homeScore: g.home_score ?? null,
                    quarter: null, clock: null, possession: null,
                    down: null, yardsToGo: null, yardLine: null, lastPlay: null,
                });
            }
        }
        return rows.length;
    } catch (err) {
        console.warn(`[WARN] loadScheduleFromDB: ${err.message}`);
        return 0;
    }
}

// ── In-memory state ───────────────────────────────────────────────────────────
let playerData  = [];   // Wordle: Sleeper API (free, unlimited)
let teamStats   = null; // Stats page: Tank01, cached weekly
let playerStats = null; // Stats/Fantasy: Tank01, cached weekly

let hist2025Stats     = null; // 2025 player stats: Tank01, cached permanently
let hist2025TeamStats = null; // 2025 team stats: Tank01, cached permanently
let wordle2025Players = null; // Merged Tank01 2025 stats + Sleeper metadata for Wordle
let building2025      = false; // prevents concurrent 2025 player-stat fetches

// Normalize a player name for cross-source matching (Tank01 ↔ Sleeper)
const normKey = name => (name || "").toLowerCase().replace(/[^a-z]/g, "");

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
        ? "🛑 API Hard Stop — I Suck at Fantasy"
        : "⚠️ API Limit Warning — I Suck at Fantasy";
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
            from:    `"I Suck at Fantasy" <${gmailUser}>`,
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
let callBudget     = readDiskCache("api_calls.json") || { date: "", count: 0 };
let apiHardStopped = false;
let lastApiCallTime = null;

function formatLastApiCall(ts) {
    if (!ts) return "never";
    const mins = Math.floor((Date.now() - ts) / 60000);
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (mins < 1) return `just now (${hh}:${mm})`;
    return `${mins} min ago (${hh}:${mm})`;
}

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
    lastApiCallTime = Date.now();
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

    // Quarter: API returns "1st"/"2nd"/"3rd"/"4th"/OT ordinal strings — normalize to "1"/"2"/"3"/"4"/"OT"
    const rawQtr = pickStr(raw, "currentPeriod", "quarter", "period", "qtr",
                            "lineScore.period") || null;
    const quarter = rawQtr
        ? rawQtr.replace(/^(\d+)(?:st|nd|rd|th)$/i, "$1")   // "3rd" → "3", "1st" → "1"
        : null;

    // Clock: prefer top-level, fall back into lineScore
    const clock = pickStr(raw, "gameClock", "clock", "timeLeft", "lineScore.gameClock") || null;

    // Possession: Tank01 uses teamPosBall for possessing team abbreviation
    let possession = (pickStr(raw, "teamPosBall", "possession") || "").toUpperCase() || null;
    if (!possession && raw?.lineScore) {
        const ls = raw.lineScore;
        if (ls?.home?.currentlyInPossession === "True")
            possession = (ls.home.teamAbv || pickStr(raw, "homeTeam", "home", "homeTeamAbbr") || "").toUpperCase() || null;
        else if (ls?.away?.currentlyInPossession === "True")
            possession = (ls.away.teamAbv || pickStr(raw, "awayTeam", "away", "awayTeamAbbr") || "").toUpperCase() || null;
    }

    // Quarter-by-quarter line scores from lineScore
    let lineScore = null;
    if (raw?.lineScore?.away && raw?.lineScore?.home) {
        const ls = raw.lineScore;
        lineScore = {
            away: { Q1: ls.away.Q1, Q2: ls.away.Q2, Q3: ls.away.Q3, Q4: ls.away.Q4, OT: ls.away.OT },
            home: { Q1: ls.home.Q1, Q2: ls.home.Q2, Q3: ls.home.Q3, Q4: ls.home.Q4, OT: ls.home.OT },
        };
    }

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
        quarter,
        clock,
        possession,
        lineScore,
        down:       (() => {
            let d = pickStr(raw, "down") || null;
            if (!d) {
                const dad = pickStr(raw, "downAndDistance", "down_and_distance") || "";
                const m = dad.match(/(\d+)(?:st|nd|rd|th)?\s+(?:and|&)/i);
                if (m) d = m[1];
            }
            return d;
        })(),
        yardsToGo:  (() => {
            let y = pickStr(raw, "yardsToGo", "yards_to_go", "distance") || null;
            if (!y) {
                const dad = pickStr(raw, "downAndDistance", "down_and_distance") || "";
                const m = dad.match(/(?:and|&)\s+(\S+)/i);
                if (m) y = m[1]; // "10", "Goal", etc.
            }
            return y;
        })(),
        yardLine:   pickStr(raw, "yardLine", "yard_line", "scrimmage", "ballOn") || null,
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

// ── Play-by-play cache ────────────────────────────────────────────────────────
// Appends new plays to plays_<gameID>.json, deduplicating by playID.
function cachePlays(gameID, newPlays) {
    if (!Array.isArray(newPlays) || newPlays.length === 0) return;
    const cacheFile = `plays_${gameID}.json`;
    const existing  = readDiskCache(cacheFile) || [];
    const seen      = new Set(existing.map(p => p.playID ?? JSON.stringify(p)));
    const toAdd     = newPlays.filter(p => !seen.has(p.playID ?? JSON.stringify(p)));
    if (toAdd.length > 0) {
        writeDiskCache(cacheFile, [...existing, ...toAdd]);
        log("info", `Cached ${toAdd.length} new plays for ${gameID}`);
    }
}

// ── Fetch detailed box score for a single live game ───────────────────────────
// Fetches with play-by-play enabled; new plays are appended to disk cache.
async function fetchBoxScore(gameID) {
    const body  = await tank01Get("/getNFLBoxScore", { gameID, playByPlay: "true" });
    const info  = body?.gameInfo ?? body?.game ?? body ?? {};

    // Tank01 box score stores play-by-play under "allPlayByPlay"
    const allPlays = body?.allPlayByPlay ?? body?.plays ?? body?.gameLog ?? body?.playByPlay ?? info?.plays ?? [];
    cachePlays(gameID, allPlays);

    const normalized = normalizeGame({ ...body, ...info, gameID });

    // Extract last play description from allPlayByPlay
    if (Array.isArray(allPlays) && allPlays.length > 0) {
        const last = allPlays[allPlays.length - 1];
        normalized.lastPlay = last.play || last.description || null;
        // Pass last 5 plays for the recent plays feed
        normalized.recentPlays = allPlays.slice(-20).reverse().map(p => ({
            play: p.play || p.description || "",
            period: p.playPeriod || p.period || "",
            clock:  p.playClock  || p.clock  || "",
            down:   p.downAndDistance || "",
        })).filter(p => p.play);
    }

    // Scoring plays summary
    if (Array.isArray(body?.scoringPlays)) {
        normalized.scoringPlays = body.scoringPlays.map(s => ({
            team:       s.team || "",
            scoreType:  s.scoreType || "TD",
            period:     s.scorePeriod || "",
            time:       s.scoreTime  || "",
            desc:       s.score      || "",
            awayScore:  s.awayScore  ?? "",
            homeScore:  s.homeScore  ?? "",
        }));
    }

    // Player stats — flatten the playerID-keyed dict into an array
    if (body?.playerStats && typeof body.playerStats === "object" && !Array.isArray(body.playerStats)) {
        normalized.playerStats = Object.values(body.playerStats)
            .filter(p => p.longName && p.teamAbv)
            .map(p => ({
                name:      p.longName,
                team:      p.teamAbv,
                Passing:   p.Passing   || null,
                Rushing:   p.Rushing   || null,
                Receiving: p.Receiving || null,
                Defense:   p.Defense   || null,
                Kicking:   p.Kicking   || null,
            }));
    }

    return normalized;
}

// ── Persist live/final game data to SQLite ────────────────────────────────────
function persistGames(games) {
    if (!nflDb) return;
    try {
        const upsertSched = nflDb.prepare(`
            UPDATE schedules SET home_score=@homeScore, away_score=@awayScore, status=@status
            WHERE game_id=@gameID
        `);
        const upsertTeamLog = nflDb.prepare(`
            INSERT OR REPLACE INTO team_game_logs (
                game_id, season, week, game_date, team_abbr, opp_abbr, home_away,
                team_score, opp_score, result
            ) VALUES (
                @game_id, @season, @week, @game_date, @team_abbr, @opp_abbr, @home_away,
                @team_score, @opp_score, @result
            )
        `);

        const persist = nflDb.transaction(gameList => {
            for (const g of gameList) {
                if (!g.gameID) continue;
                upsertSched.run({
                    gameID:    g.gameID,
                    homeScore: g.homeScore ?? null,
                    awayScore: g.awayScore ?? null,
                    status:    g.status,
                });
                if (g.status !== "final") continue;
                const datePart = (g.gameID.split("_")[0] ?? "");
                const dateMs   = new Date(`${datePart.slice(0,4)}-${datePart.slice(4,6)}-${datePart.slice(6,8)}`).getTime();
                const season   = parseInt(datePart.slice(0, 4)) || NFL_SEASON;
                const week     = Math.max(1, Math.floor((dateMs - new Date("2026-09-09").getTime()) / (7*86400000)) + 1);
                const away = g.awayTeam, home = g.homeTeam;
                const as_ = +(g.awayScore ?? 0), hs = +(g.homeScore ?? 0);
                if (!away || !home) continue;
                for (const [abbr, opp, ha, ts, os] of [
                    [away, home, "away", as_, hs],
                    [home, away, "home", hs,  as_],
                ]) {
                    upsertTeamLog.run({
                        game_id: g.gameID, season, week, game_date: datePart,
                        team_abbr: abbr, opp_abbr: opp, home_away: ha,
                        team_score: ts, opp_score: os,
                        result: ts > os ? "W" : ts < os ? "L" : "T",
                    });
                }
            }
        });
        persist(games);

        // Recalculate team_season_stats_2026 for affected teams
        const finalGames = games.filter(g => g.status === "final" && g.awayTeam && g.homeTeam);
        const affected = new Set(finalGames.flatMap(g => [g.awayTeam, g.homeTeam]));
        if (affected.size) {
            const recalc = nflDb.prepare(`
                INSERT OR REPLACE INTO team_season_stats_2026 (abbr, won, lost, tied, ppg, papg)
                SELECT team_abbr,
                    SUM(CASE WHEN result='W' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN result='L' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN result='T' THEN 1 ELSE 0 END),
                    ROUND(AVG(team_score), 2),
                    ROUND(AVG(opp_score),  2)
                FROM team_game_logs WHERE season=2026 AND team_abbr=?
                GROUP BY team_abbr
            `);
            for (const abbr of affected) recalc.run(abbr);
            log("info", `Recalculated season stats for: ${[...affected].join(", ")}`);
        }
    } catch (err) {
        log("warn", `persistGames error: ${err.message}`);
    }
}

function verifyFinalGame(g) {
    if (!nflDb || !g.gameID) return;
    try {
        const rows = nflDb.prepare(
            "SELECT team_abbr, team_score FROM team_game_logs WHERE game_id=?"
        ).all(g.gameID);
        if (rows.length < 2) {
            log("warn", `Verify ${g.gameID}: only ${rows.length} rows (expected 2)`);
            return;
        }
        for (const r of rows) {
            const expected = r.team_abbr === g.awayTeam ? +(g.awayScore??0) : +(g.homeScore??0);
            if (r.team_score !== expected)
                log("warn", `Verify ${g.gameID}: ${r.team_abbr} score mismatch — DB=${r.team_score} live=${expected}`);
            else
                log("info", `Verify ${g.gameID} ${r.team_abbr}: score ${r.team_score} ✓`);
        }
    } catch (err) {
        log("warn", `verifyFinalGame error: ${err.message}`);
    }
}

// ── Live game poller ──────────────────────────────────────────────────────────
// Runs every LIVE_POLL_MS. During game windows:
//   - 1 call to getNFLGamesForDate for today's scoreboard
//   - Up to 4 box-score calls for live games missing quarter/clock
// Outside game windows the poller returns immediately (0 calls).
let pollRunning = false;
const prevGameStatus = {}; // tracks prior cycle status to detect live→final transitions

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

    const today = todayStr();
    try {
        const games = await fetchGamesForDate(today);
        liveState[today] = { updatedAt: Date.now(), games };

        // Enrich up to 4 live games with box score detail (quarter, clock, field position, last play).
        // Skip box score calls when budget is tight (< 200 calls left) to preserve coverage.
        const callsLeft = DAILY_CALL_LIMIT - callBudget.count;
        const liveGames = callsLeft >= 200
            ? games.filter(g => g.status === "live").slice(0, 4)
            : [];
        for (const g of liveGames) {
            try {
                const detail = await fetchBoxScore(g.gameID);
                // Merge only non-null values from box score so scores-only data isn't wiped
                const merge = {};
                for (const k of ["quarter","clock","possession","down","yardsToGo","yardLine","lastPlay","lineScore","recentPlays","scoringPlays","playerStats"]) {
                    if (detail[k] != null) merge[k] = detail[k];
                }
                Object.assign(g, merge);
                log("info", `  Box score ${g.gameID}: Q${g.quarter} ${g.clock} poss=${g.possession}`);
            } catch (err) {
                log("warn", `Box score failed for ${g.gameID}: ${err.message}`);
            }
        }

        // Persist scores + final game records to DB after every poll.
        persistGames(games);

        // Verify games that just transitioned live → final this cycle.
        for (const g of games) {
            if (g.status === "final" && prevGameStatus[g.gameID] === "live") {
                log("info", `Game just finished: ${g.gameID} — verifying DB`);
                verifyFinalGame(g);
            }
            prevGameStatus[g.gameID] = g.status;
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

// Live poll fires every 2 minutes but guards on isGameWindow() — 0 API calls outside windows.
if (LIVE_POLLING) setInterval(pollLiveGames, LIVE_POLL_MS);

// ── Team stats (1 API call) ───────────────────────────────────────────────────
async function buildTeamStats(season = null) {
    if (apiHardStopped) { log("info", "buildTeamStats skipped — API hard stopped"); return null; }
    log("info", `Fetching team stats (1 call)${season ? ` for ${season}` : ""}...`);
    const params = { teamStats: "true", topPerformers: "true" };
    if (season) params.season = String(season);
    const body  = await tank01Get("/getNFLTeams", params);
    const teams = body?.nflTeams
        ?? (Array.isArray(body?.body) ? body.body : null)
        ?? (Array.isArray(body) ? body : []);

    if (teams.length > 0) {
        log("info", `Team keys: ${Object.keys(teams[0]).join(", ")}`);
        if (teams[0].teamStats)
            log("info", `teamStats keys: ${Object.keys(teams[0].teamStats).join(", ")}`);
        if (teams[0].logos)
            log("info", `logos[0]: ${JSON.stringify(teams[0].logos[0])}`);
    }

    const result = teams.map(t => {
        const wins  = parseInt(t.wins ?? t.win ?? t.teamWins ?? 0) || 0;
        const loss  = parseInt(t.loss ?? t.teamLoss ?? t.losses ?? 0) || 0;
        const tie   = parseInt(t.tie  ?? t.ties ?? 0) || 0;
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

async function buildPlayerStats(teams, season = NFL_SEASON) {
    if (apiHardStopped) { log("info", "buildPlayerStats skipped — API hard stopped"); return null; }
    log("info", `Fetching player stats for ${season} (${teams.length} calls)...`);
    const KEEP = new Set(["QB","RB","WR","TE","K","FB"]);
    const all  = [];
    let sampleLogged = false;

    for (const team of teams) {
        try {
            const body      = await tank01Get("/getNFLTeamRoster", { teamAbv: team.abbr, getStats: "true", season });
            const bodyInner = body?.body ?? body;
            const roster    = bodyInner?.roster ?? (Array.isArray(bodyInner) ? bodyInner : []);

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
                const totalYds = passYds + rushYds + recYds;
                const totalTDs = passTDs + rushTDs + recTDs;
                if (totalYds === 0 && totalTDs === 0) continue;
                // Only count games when the player has actual stats (avoids stale carried-over game counts)
                const games = pick(s, "gamesPlayed","games","GP") || pick(p, "gamesPlayed","games");

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

// Builds the Wordle player pool by merging Tank01 2025 stats with Sleeper metadata.
// Called after both playerData (Sleeper) and hist2025Stats are available.
function buildWordle2025Players() {
    if (!hist2025Stats?.length || !playerData.length) return null;

    const sleeperByName = {};
    for (const p of playerData) {
        const key = normKey(p.full_name);
        if (key) sleeperByName[key] = p;
    }

    const result = [];
    for (const tp of hist2025Stats) {
        if ((tp.games || 0) < 5) continue; // skip very limited appearances
        const key = normKey(tp.name);
        const sp  = sleeperByName[key] || {};
        result.push({
            full_name: tp.name,
            team:      tp.team,
            position:  tp.pos,
            age:       sp.age    ?? null,
            number:    sp.number ?? null,
            college:   sp.college ?? null,
            passYds:   tp.passYds  || 0,
            rushYds:   tp.rushYds  || 0,
            recYds:    tp.recYds   || 0,
            recRec:    tp.recRec   || 0,
            passTDs:   tp.passTDs  || 0,
            rushTDs:   tp.rushTDs  || 0,
            recTDs:    tp.recTDs   || 0,
            games:     tp.games    || 0,
        });
    }
    return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

// Picks today's Wordle player from the 2025 pool (or Sleeper list as fallback).
function getDailyWordlePlayer() {
    const pool = wordle2025Players?.length ? wordle2025Players : playerData;
    if (!pool.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < today.length; i++) hash = (hash * 31 + today.charCodeAt(i)) % pool.length;
    return pool[Math.abs(hash)];
}

// ── Pre-game injury fetch scheduler ──────────────────────────────────────────
// Reads today's game kickoff times from seasonSchedule, groups them into windows,
// and schedules injury + inactive fetches 90 minutes before each window opens.
const PRE_GAME_BUFFER_MS = 90 * 60 * 1000;
const scheduledPreGameFetches = new Set(); // "YYYYMMDD_windowHour" keys

function parseKickoffET(timeStr) {
    if (!timeStr) return null;
    const m = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(am|pm|a|p)?/i);
    if (!m) return null;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const ap = (m[3] || "").toLowerCase();
    if (ap.startsWith("p") && h !== 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
    return h + min / 60;
}

// Group sorted kickoff hours into windows — games within 2h share one window.
function getGameWindows(games) {
    const times = games
        .map(g => parseKickoffET(g.kickoff ?? g.gameTime ?? g.time))
        .filter(t => t !== null)
        .sort((a, b) => a - b);
    if (!times.length) return [];
    const windows = [[times[0]]];
    for (let i = 1; i < times.length; i++) {
        if (times[i] - windows[windows.length - 1][0] <= 2) {
            windows[windows.length - 1].push(times[i]);
        } else {
            windows.push([times[i]]);
        }
    }
    return windows.map(w => Math.min(...w)); // earliest time in each window
}

async function schedulePreGameFetches() {
    const todayKey   = todayStr().replace(/-/g, "");
    const todayGames = seasonSchedule[todayKey];
    if (!Array.isArray(todayGames) || todayGames.length === 0) return;

    const windows = getGameWindows(todayGames);
    const now = new Date();
    const isDST = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10;
    const etOffsetH = isDST ? 4 : 5;

    for (const windowHourET of windows) {
        const key = `${todayKey}_${Math.floor(windowHourET)}`;
        if (scheduledPreGameFetches.has(key)) continue;
        scheduledPreGameFetches.add(key);

        // Convert window time (ET) to a UTC Date for today
        const windowDate = new Date();
        windowDate.setUTCHours(
            Math.floor(windowHourET) + etOffsetH,
            Math.round((windowHourET % 1) * 60),
            0, 0
        );
        const delay = windowDate.getTime() - PRE_GAME_BUFFER_MS - Date.now();

        if (delay <= 0) {
            // Window already within 90-min buffer or passed — fetch now
            log("info", `Pre-game window ~${Math.floor(windowHourET)}:00 ET: fetching injuries now`);
            await fetchInjuries().catch(() => {});
            await fetchInactives().catch(() => {});
        } else {
            const mins = Math.round(delay / 60_000);
            log("info", `Pre-game injury fetch in ${mins}m (window ~${Math.floor(windowHourET)}:00 ET)`);
            setTimeout(async () => {
                log("info", `Pre-game injury fetch firing for ~${Math.floor(windowHourET)}:00 ET window`);
                await fetchInjuries().catch(() => {});
                await fetchInactives().catch(() => {});
            }, delay);
        }
    }
}

// ── Midnight roster + injury refresh ──────────────────────────────────────────
// Runs once at midnight ET each night: refreshes team stats, player stats, injuries.
// Replaces the old weekly-on-Tuesday + daily-3pm pattern.
function msUntilMidnightET() {
    const now = new Date();
    const isDST = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10;
    const etOffsetH = isDST ? 4 : 5;
    const midnight = new Date(now);
    midnight.setUTCHours(etOffsetH, 0, 10, 0); // 00:00:10 ET (slight offset to clear billing window)
    if (midnight.getTime() <= now.getTime()) midnight.setUTCDate(midnight.getUTCDate() + 1);
    return midnight.getTime() - now.getTime();
}

async function runNightlyUpdate() {
    log("info", "Nightly update: refreshing rosters and injury list...");
    try {
        if (!apiHardStopped) {
            const newTeamStats = await buildTeamStats().catch(() => null);
            if (newTeamStats) { teamStats = newTeamStats; writeDiskCache("team_stats.json", teamStats); }
            const newPlayerStats = await buildPlayerStats(teamStats).catch(() => null);
            if (newPlayerStats?.length) { playerStats = newPlayerStats; writeDiskCache("player_stats.json", playerStats); }
            else if (newPlayerStats !== null) log("warn", "Nightly: buildPlayerStats returned 0 players (preseason?) — keeping previous cache");
            await fetchInjuries().catch(() => {});
        }
        log("info", "Nightly update complete");
        // Push updated DB to GitHub so Render picks it up on next deploy.
        if (process.env.GITHUB_REPO && process.env.GITHUB_TOKEN) {
            const { exec } = require("child_process");
            exec("bash scripts/push-db.sh", { cwd: __dirname }, (err, stdout) => {
                if (err) log("warn", `push-db failed: ${err.message}`);
                else log("info", `push-db: ${stdout.trim()}`);
            });
        }
    } catch (err) {
        log("error", `Nightly update error: ${err.message}`);
    }

    // Reset pre-game tracker for the new day, reload schedule, re-schedule fetches
    scheduledPreGameFetches.clear();
    setTimeout(async () => {
        await loadSeasonSchedule().catch(() => {});
        await schedulePreGameFetches().catch(() => {});
    }, 5_000);

    // Schedule next nightly run
    const delay = msUntilMidnightET();
    log("info", `Next nightly update in ${Math.round(delay / 3_600_000 * 10) / 10}h`);
    setTimeout(runNightlyUpdate, delay);
}

function scheduleMidnightUpdate() {
    const delay = msUntilMidnightET();
    log("info", `Nightly update scheduled in ${Math.round(delay / 3_600_000 * 10) / 10}h`);
    setTimeout(runNightlyUpdate, delay);
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
        // Enrich with ESPN IDs from playerStats when the projection data lacks them
        if (playerStats) {
            const idToEspn = {};
            for (const p of playerStats) if (p.id && p.espnId) idToEspn[p.id] = p.espnId;
            for (const p of raw) {
                if (!p.espnID && !p.espnId && p.playerID && idToEspn[p.playerID])
                    p.espnID = idToEspn[p.playerID];
            }
        }
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
    const today = todayStr();
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

// ── Historical game log builder (getNFLGamesForPlayer per past season) ─────────
// Phase 1: fetch rosters to get player IDs (32 calls)
// Phase 2: fetch per-player game logs for skill positions (one call per player)
async function buildAndEnrichSeasonStats(season) {
    if (!RAPIDAPI_KEY || apiHardStopped) throw new Error("API not available");
    log("info", `Building ${season} season stats via getNFLGamesForPlayer...`);
    const KEEP = new Set(["QB","RB","WR","TE","FB"]);
    const roster = [];

    // Phase 1: rosters — don't filter by gamesPlayed (Tank01 omits it for past seasons)
    for (const abbr of ALL_TEAM_ABBRS) {
        try {
            const body = await tank01Get("/getNFLTeamRoster", { teamAbv: abbr, getStats: "true", season: String(season) });
            const players = body?.roster ?? (Array.isArray(body) ? body : []);
            for (const p of players) {
                const pos = simplifyPos(p.pos ?? p.position ?? "");
                if (!KEEP.has(pos)) continue;
                const id = p.playerID ?? p.id;
                if (!id) continue;
                roster.push({
                    id,
                    espnId: p.espnID ?? p.espnId ?? "",
                    name: p.longName ?? p.fullName ?? p.name ?? "",
                    pos, team: abbr,
                });
            }
        } catch (err) { log("warn", `${season} roster ${abbr}: ${err.message}`); }
    }
    log("info", `Phase 1: ${roster.length} skill players in ${season}`);

    // Phase 2: game logs
    const result = [];
    for (const player of roster) {
        try {
            const body = await tank01Get("/getNFLGamesForPlayer", { playerID: player.id, season: String(season) });
            const games = Array.isArray(body) ? body
                : (body?.playerGameStats ?? body?.games ?? body?.gameLog ?? body?.stats ?? []);
            if (!Array.isArray(games) || !games.length) continue;

            let passYds=0,passTDs=0,passAtt=0,passComp=0,passINT=0;
            let rushYds=0,rushTDs=0,rushAtt=0;
            let recYds=0,recTDs=0,recRec=0,targets=0,gp=0;
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
            const g = gp;
            result.push({
                id: player.id, espnId: player.espnId, name: player.name, pos: player.pos, team: player.team,
                games: gp, passYds, passTDs, passAtt, passComp, passINT,
                compPct: passAtt > 0 ? +(passComp/passAtt*100).toFixed(1) : 0,
                rushYds, rushTDs, rushAtt,
                ypc:     rushAtt > 0 ? +(rushYds/rushAtt).toFixed(1) : 0,
                rushYpg: +(rushYds/g).toFixed(1),
                recYds, recTDs, recRec, targets,
                recYpg:  +(recYds/g).toFixed(1),
                recPg:   +(recRec/g).toFixed(1),
                totalYds: passYds+rushYds+recYds, totalTDs: passTDs+rushTDs+recTDs,
                ypg: +((passYds+rushYds+recYds)/g).toFixed(1),
            });
        } catch (err) { log("warn", `getNFLGamesForPlayer ${player.name} (${season}): ${err.message}`); }
    }
    log("info", `Phase 2 done: ${result.length} players enriched for ${season}`);
    return result;
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

// ── Startup: load all data from disk/DB — zero API calls ─────────────────────

// Current-season stats from JSON disk cache
teamStats   = readDiskCache("team_stats.json")   ?? readDiskCache("team_stats_tank01.json");
playerStats = readDiskCache("player_stats.json") ?? readDiskCache("player_stats_tank01.json");
if (Array.isArray(playerStats) && playerStats.length === 0) {
    log("warn", "player_stats.json is empty — discarding");
    playerStats = null;
}
// Discard team stats if all records have zero wins/ppg (preseason placeholder)
if (Array.isArray(teamStats) && teamStats.length > 0 && teamStats.every(t => !t.won && !t.ppg)) {
    log("warn", "team_stats.json contains all-zero stats (preseason) — discarding");
    teamStats = null;
}
fantasyProjections = readDiskCache("fantasy_projections.json");
injuryData   = readDiskCache("injuries.json")  || { date: "", list: [] };
inactiveData = readDiskCache("inactives.json") || { date: "", list: [] };

if (teamStats)   log("info", `Disk cache: ${teamStats.length} teams`);
if (playerStats) log("info", `Disk cache: ${playerStats.length} players`);

// 2025 historical stats — try DB first, fall back to JSON file
hist2025Stats = loadHist2025StatsFromDB();
if (hist2025Stats?.length) {
    log("info", `DB: ${hist2025Stats.length} 2025 players loaded`);
} else {
    const _h25raw = readDiskCache("player_stats_2025.json");
    if (_h25raw?.some(p => (p.passYds||0)+(p.rushYds||0)+(p.recYds||0) > 0)) {
        hist2025Stats = _h25raw;
        log("info", `Disk cache: ${hist2025Stats.length} 2025 historical players`);
    }
}

// 2025 historical team stats — try DB first, fall back to JSON file
hist2025TeamStats = loadHist2025TeamStatsFromDB();
if (hist2025TeamStats?.length) {
    log("info", `DB: ${hist2025TeamStats.length} 2025 team stats loaded`);
} else {
    const _ht25raw = readDiskCache("team_stats_2025.json");
    if (_ht25raw?.length) {
        hist2025TeamStats = _ht25raw;
        log("info", `Disk cache: ${hist2025TeamStats.length} 2025 historical teams`);
    }
}

// Season schedule — try DB first, fall back to JSON file
const dbScheduleCount = loadScheduleFromDB();
if (dbScheduleCount > 0) {
    log("info", `DB: ${dbScheduleCount} schedule entries loaded (${Object.keys(seasonSchedule).length} dates)`);
} else {
    const _sched = readDiskCache(`schedule_${NFL_SEASON}.json`);
    if (_sched) {
        Object.assign(seasonSchedule, _sched);
        log("info", `Disk cache: schedule loaded (${Object.keys(seasonSchedule).length} dates)`);
    }
}

if (!RAPIDAPI_KEY) {
    log("warn", "RAPIDAPI_KEY not set — live game polling and admin endpoints disabled");
}

if (LIVE_POLLING) {
    scheduleMidnightUpdate();
    setTimeout(pollLiveGames, 5_000);
    setTimeout(async () => {
        await schedulePreGameFetches().catch(err => log("error", `schedulePreGameFetches: ${err.message}`));
    }, 5_000);
} else {
    log("info", "LIVE_POLLING=false — live game polling, nightly update, and pre-game fetches disabled (0 API calls on startup)");
}

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
                lastAPICall:         formatLastApiCall(lastApiCallTime),
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

        // ── /api/wordle-players ───────────────────────────────────────
        // Returns 2025 stat-enriched player pool (Tank01+Sleeper merge).
        // Falls back to Sleeper active list when 2025 stats are not yet cached.
        if (urlPath === "/api/wordle-players") {
            const pool = wordle2025Players?.length ? wordle2025Players : playerData;
            return sendJson(200, pool, 3600);
        }

        // ── /api/daily-wordle-player ──────────────────────────────────
        if (urlPath === "/api/daily-wordle-player") {
            if (!wordle2025Players?.length && playerData.length === 0) {
                return sendJson(503, { error: "Player data unavailable" });
            }
            const player = getDailyWordlePlayer();
            if (!player) return sendJson(503, { error: "No player available" });
            return sendJson(200, player);
        }

        // ── /api/historical-team-stats?season=YYYY ───────────────────
        if (urlPath === "/api/historical-team-stats") {
            const reqSeason = parseInt(parsed.searchParams.get("season") || "2025");
            if (reqSeason === 2025 && hist2025TeamStats?.length) {
                return sendJson(200, hist2025TeamStats, 86_400);
            }
            if (!RAPIDAPI_KEY || apiHardStopped) {
                return sendJson(503, { status: "unavailable", message: `${reqSeason} team data not yet cached` });
            }
            return sendJson(202, { status: "fetching", message: `${reqSeason} team data not yet cached — check back shortly` });
        }

        // ── /api/standings ────────────────────────────────────────────
        if (urlPath === "/api/standings") {
            const rows = nflDb.prepare(`
                SELECT t.abbr, t.name, t.conference, t.division, t.logo_url,
                       COALESCE(ts.won, 0)  AS won,
                       COALESCE(ts.lost, 0) AS lost,
                       COALESCE(ts.tied, 0) AS tied,
                       ts.ppg, ts.papg
                FROM teams t
                LEFT JOIN team_season_stats_2026 ts ON ts.abbr = t.abbr
                ORDER BY t.conference, t.division,
                         (COALESCE(ts.won,0)*2 + COALESCE(ts.tied,0)) DESC,
                         COALESCE(ts.lost,0) ASC
            `).all();

            // Build win% map for SOS calculations
            const winPct = {};
            for (const r of rows) {
                const g = r.won + r.lost + r.tied;
                winPct[r.abbr] = g ? (r.won + r.tied * 0.5) / g : 0.5;
            }

            // Get all regular season games
            const games = nflDb.prepare(`
                SELECT home_team, away_team, game_date
                FROM schedules WHERE season = 2026 AND week >= 1
            `).all();

            const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const avg = arr => arr.length
                ? arr.reduce((s, a) => s + (winPct[a] ?? 0.5), 0) / arr.length
                : null;

            const result = rows.map(r => {
                const played = [], remaining = [];
                for (const g of games) {
                    let opp = null;
                    if (g.home_team === r.abbr) opp = g.away_team;
                    else if (g.away_team === r.abbr) opp = g.home_team;
                    if (!opp) continue;
                    (g.game_date <= today ? played : remaining).push(opp);
                }
                return { ...r, sos_played: avg(played), sos_remaining: avg(remaining) };
            });
            return sendJson(200, result, 900);
        }

        // ── /api/power-rankings?season=YYYY ──────────────────────────
        if (urlPath === "/api/power-rankings") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            const season = parseInt(parsed.searchParams.get("season") || "2026");
            try {
                const rows = nflDb.prepare(`
                    SELECT t.abbr, t.name, t.conference, t.division,
                           COALESCE(ts.won, 0)  AS won,
                           COALESCE(ts.lost, 0) AS lost,
                           COALESCE(ts.tied, 0) AS tied,
                           COALESCE(ts.ppg, 0)  AS ppg,
                           COALESCE(ts.papg, 0) AS papg
                    FROM teams t
                    LEFT JOIN team_season_stats_2026 ts ON ts.abbr = t.abbr
                `).all();

                const maxPpg = Math.max(...rows.map(r => r.ppg || 0), 1);
                const maxPapg = Math.max(...rows.map(r => r.papg || 0), 1);

                const scored = rows.map(r => {
                    const g = r.won + r.lost + r.tied;
                    const pct = g ? (r.won + r.tied * 0.5) / g : 0;
                    const diff = (r.ppg || 0) - (r.papg || 0);
                    // Power score: 40% record, 30% PPG, 20% PA, 10% point diff
                    const power = pct * 0.4 + (r.ppg / maxPpg) * 0.3 + (1 - r.papg / maxPapg) * 0.2 + (diff > 0 ? Math.min(diff / 20, 1) : 0) * 0.1;
                    return { ...r, pct: +pct.toFixed(3), diff: +diff.toFixed(1), power: +power.toFixed(4) };
                });

                scored.sort((a, b) => b.power - a.power);
                const result = scored.map((r, i) => ({ ...r, rank: i + 1 }));
                return sendJson(200, result, 900);
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        // ── /api/data-freshness ───────────────────────────────────────
        if (urlPath === "/api/data-freshness") {
            if (!nflDb) return sendJson(200, { dataWeek: 0, currentWeek: 1, upToDate: false }, 300);
            const SEASON_START = new Date("2026-09-09").getTime();
            const MS_PER_WEEK  = 7 * 86400 * 1000;
            const currentWeek  = Math.max(1, Math.floor((Date.now() - SEASON_START) / MS_PER_WEEK) + 1);
            // Last week with >= 400 distinct players
            const row = nflDb.prepare(`
                SELECT MAX(week) as w FROM (
                    SELECT week FROM game_logs WHERE season=2026 AND week > 0
                    GROUP BY week HAVING COUNT(DISTINCT espn_id) >= 400
                )
            `).get();
            const dataWeek = row?.w ?? 0;
            return sendJson(200, { dataWeek, currentWeek, upToDate: dataWeek >= currentWeek - 1, season: 2026 }, 3600);
        }

        // ── /api/top-performers?season=YYYY ───────────────────────────
        if (urlPath === "/api/top-performers") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            const season = parseInt(parsed.searchParams.get("season") || "2026");
            const tbl = season === 2026 ? "season_player_totals_2026" : "season_player_totals_2025";
            try {
                const q = (pos, orderCol, limit = 3) => nflDb.prepare(`
                    SELECT p.espn_id AS espnId, p.name, p.position AS pos,
                           COALESCE(t.team_abbr, '—') AS team,
                           COALESCE(t.passing_yds,0) AS passYds, COALESCE(t.passing_tds,0) AS passTDs,
                           COALESCE(t.rushing_yds,0) AS rushYds, COALESCE(t.rushing_tds,0) AS rushTDs,
                           COALESCE(t.receptions,0)  AS recs,    COALESCE(t.receiving_yds,0) AS recYds,
                           COALESCE(t.receiving_tds,0) AS recTDs,
                           COALESCE(t.fantasy_pts_ppr,0) AS fantPts,
                           COALESCE(t.games_played,0) AS gp
                    FROM players p JOIN ${tbl} t ON t.espn_id = p.espn_id
                    WHERE p.position = ? AND t.${orderCol} > 0
                    ORDER BY t.${orderCol} DESC LIMIT ?
                `).all(pos, limit);

                return sendJson(200, {
                    passers:   q("QB", "passing_yds"),
                    rushers:   q("RB", "rushing_yds"),
                    receivers: q("WR", "receiving_yds"),
                    te:        q("TE", "receiving_yds", 1),
                }, 900);
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
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
            if (playerStats) return sendJson(200, playerStats, 900);
            // API cache unavailable — fall back to DB roster with whatever 2026 stats exist
            const dbPlayers = loadHist2026StatsFromDB();
            if (dbPlayers?.length) return sendJson(200, dbPlayers, 300);
            const msg = RAPIDAPI_KEY
                ? "Fetching player data — try again in ~90 seconds"
                : "RAPIDAPI_KEY not configured";
            return sendJson(503, { status: "loading", message: msg });
        }

        // ── /api/historical-player-stats?season=YYYY ─────────────────
        // Returns player stats for a past season. Checks disk cache first;
        // if missing, triggers a background fetch from Tank01 (32 calls).
        // ── /api/admin/refresh-2026 — reload 2026 stats from disk cache into memory ──
        // Run db/refresh-2026-stats.js first to populate the JSON files, then call this.
        if (urlPath === "/api/admin/refresh-2026" && req.method === "POST") {
            try {
                const freshTeams   = readDiskCache("team_stats.json");
                const freshPlayers = readDiskCache("player_stats.json");
                let teamCount = 0, playerCount = 0;

                if (freshTeams?.length) {
                    teamStats  = freshTeams;
                    teamCount  = freshTeams.length;
                    log("info", `refresh-2026: ${teamCount} teams reloaded from disk`);
                }
                if (Array.isArray(freshPlayers) && freshPlayers.some(p => (p.passYds||0)+(p.rushYds||0)+(p.recYds||0) > 0)) {
                    playerStats  = freshPlayers;
                    playerCount  = freshPlayers.length;
                    log("info", `refresh-2026: ${playerCount} players reloaded from disk`);
                }

                // Reload team_season_stats_2026 into memory
                const freshHist2026Teams = nflDb?.prepare(
                    "SELECT abbr, won, lost, tied, ppg, papg, ypg, yapg FROM team_season_stats_2026"
                ).all() ?? [];

                return sendJson(200, {
                    ok: true,
                    teams:   teamCount,
                    players: playerCount,
                    db2026Teams: freshHist2026Teams.length,
                });
            } catch (err) {
                log("error", `refresh-2026 error: ${err.message}`);
                return sendJson(500, { ok: false, error: err.message });
            }
        }

        // ── /api/reload-db-stats — reload 2025 stats from DB without restarting ──
        if (urlPath === "/api/reload-db-stats" && req.method === "POST") {
            const fresh = loadHist2025StatsFromDB();
            if (fresh?.length) {
                hist2025Stats = fresh;
                log("info", `reload-db-stats: ${fresh.length} players reloaded from DB`);
                return sendJson(200, { ok: true, count: fresh.length });
            }
            return sendJson(200, { ok: false, count: 0 });
        }

        // ── /api/seed-progress — returns current seed + budget status ────────
        if (urlPath === "/api/seed-progress") {
            try {
                const progressFile = path.join(__dirname, "db", "seed-2025-progress.json");
                let prog = null;
                try { prog = JSON.parse(fs.readFileSync(progressFile, "utf8")); } catch {}
                const processedCount = prog?.processed?.length ?? 0;
                const rosterCount    = prog?.roster?.length  ?? 0;
                const pendingCount   = Math.max(0, rosterCount - processedCount);
                const dbPlayers   = nflDb ? nflDb.prepare("SELECT COUNT(*) AS c FROM players").get().c : 0;
                const dbGameLogs  = nflDb ? nflDb.prepare("SELECT COUNT(*) AS c FROM game_logs WHERE season=2025").get().c : 0;
                const dbWithLogs  = nflDb ? nflDb.prepare("SELECT COUNT(DISTINCT espn_id) AS c FROM game_logs WHERE season=2025").get().c : 0;
                return sendJson(200, {
                    budget:        callBudget.count,
                    budgetDate:    callBudget.date,
                    remaining:     Math.max(0, 1000 - callBudget.count),
                    hardStopped:   apiHardStopped,
                    rosterCount,
                    processedCount,
                    pendingCount,
                    seederRunning: !!global._seederRunning,
                    dbPlayers,
                    dbGameLogs,
                    dbWithLogs,
                });
            } catch (e) {
                return sendJson(500, { error: e.message });
            }
        }

        // ── /api/seed-remaining — spawn the seeder for un-fetched players ────
        if (urlPath === "/api/seed-remaining" && req.method === "POST") {
            if (apiHardStopped)
                return sendJson(429, { error: "API hard stop active — budget exhausted for today" });
            if (global._seederRunning)
                return sendJson(409, { error: "Seeder already running" });
            const { spawn } = require("child_process");
            const seedScript = path.join(__dirname, "db", "seed-2025.js");
            const child = spawn(process.execPath, [seedScript], {
                detached: false,
                stdio:    ["ignore", "pipe", "pipe"],
                env:      { ...process.env },
            });
            global._seederRunning = true;
            let lastLine = "starting…";
            const onData = chunk => {
                const lines = chunk.toString().trim().split("\n").filter(Boolean);
                if (lines.length) lastLine = lines[lines.length - 1].slice(0, 120);
                log("info", `[seeder] ${lines[lines.length - 1] || ""}`);
            };
            child.stdout.on("data", onData);
            child.stderr.on("data", onData);
            child.on("close", code => {
                global._seederRunning = false;
                global._seederLastLine = lastLine;
                log("info", `[seeder] exited with code ${code}`);
                // Auto-reload stats into memory when done
                const fresh = loadHist2025StatsFromDB();
                if (fresh?.length) { hist2025Stats = fresh; log("info", `[seeder] reloaded ${fresh.length} players into memory`); }
            });
            global._seederLastLine = lastLine;
            log("info", "Seeder spawned from /api/seed-remaining");
            return sendJson(200, { ok: true, message: "Seeder started — poll /api/seed-progress for status" });
        }

        if (urlPath === "/api/historical-player-stats") {
            const reqSeason  = parseInt(parsed.searchParams.get("season") || "2025");
            const reqPlayoffs = parsed.searchParams.get("playoffs") !== "false"; // default true
            const maxWeek    = reqPlayoffs ? 23 : 18;

            // Regular-season-only filter: always query game_logs directly (accurate week filtering)
            if (reqSeason === 2025 && !reqPlayoffs) {
                const regSeason = loadHist2025StatsByWeekFromDB(18);
                if (regSeason?.length) return sendJson(200, regSeason, 3600);
            }

            // Serve from in-memory first — avoids a disk read and correctly reflects a just-completed fetch
            if (reqSeason === 2025 && hist2025Stats?.length) return sendJson(200, hist2025Stats, 86_400);
            // Try DB for 2026 season data — serve roster even with 0 stats so UI can display players
            if (reqSeason === 2026) {
                const db26 = loadHist2026StatsFromDB();
                if (db26?.length) return sendJson(200, db26, 300);
            }
            const cacheFile = `player_stats_${reqSeason}.json`;
            const cached = readDiskCache(cacheFile);
            if (cached) {
                const hasRealStats = cached.some(p => (p.passYds||0)+(p.rushYds||0)+(p.recYds||0) > 0);
                if (hasRealStats) return sendJson(200, cached, 86_400);
                // Cache exists but has all-zero stats (Tank01 returned bad historical data) — re-fetch
                log("warn", `${reqSeason} cache has all-zero stats — will re-fetch`);
            }

            if (!RAPIDAPI_KEY || apiHardStopped || !teamStats) {
                return sendJson(503, { status: "unavailable", message: `${reqSeason} data not yet cached` });
            }

            if (reqSeason === 2025 && building2025)
                return sendJson(202, { status: "fetching", message: "2025 fetch already in progress — refresh in ~60 seconds" });

            // Guard: building 2025 stats costs ~232 calls. Tonight's game needs ~182 more.
            // Only allow the build if remaining budget covers both: ~232 + ~200 buffer = 432+.
            const remainingCalls = DAILY_CALL_LIMIT - callBudget.count;
            const todayHasGames  = (seasonSchedule[todayStr().replace(/-/g,"")] ?? []).length > 0;
            if (remainingCalls < 450 && todayHasGames) {
                return sendJson(503, {
                    status: "deferred",
                    message: `API budget reserved for tonight's live game (${remainingCalls} calls left). ` +
                             `Fetch 2025 stats via /api/admin/cache-season-logs?season=2025 after 10pm ET.`,
                });
            }

            (async () => {
                if (reqSeason === 2025) building2025 = true;
                try {
                    log("info", `Background: fetching historical player stats for ${reqSeason}...`);
                    const hist = await buildAndEnrichSeasonStats(reqSeason).catch(() => null);
                    if (hist?.length) {
                        writeDiskCache(cacheFile, hist);
                        log("info", `Historical ${reqSeason} stats cached: ${hist.length} players`);
                        if (reqSeason === 2025) {
                            hist2025Stats = hist;
                            wordle2025Players = buildWordle2025Players();
                        }
                    }
                } finally { if (reqSeason === 2025) building2025 = false; }
            })();

            return sendJson(202, { status: "fetching", message: `Fetching ${reqSeason} data — refresh in ~60 seconds` });
        }

        // ── /api/projections ──────────────────────────────────────────
        if (urlPath === "/api/projections") {
            if (!fantasyProjections) {
                return sendJson(503, { status: "loading", message: "Projections not yet available" });
            }
            return sendJson(200, fantasyProjections, 3600);
        }

        // ── /api/team-game-logs?team=KC&season=2025 ──────────────────
        // Returns all game log rows from team_game_logs for a team+season.
        if (urlPath === "/api/team-game-logs") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            try {
                const team   = (parsed.searchParams.get("team") || "").toUpperCase();
                const season = parseInt(parsed.searchParams.get("season") || "2026");
                let rows;
                if (team) {
                    rows = nflDb.prepare(
                        "SELECT * FROM team_game_logs WHERE team_abbr = ? AND season = ? ORDER BY week, game_date"
                    ).all(team, season);
                } else {
                    rows = nflDb.prepare(
                        "SELECT * FROM team_game_logs WHERE season = ? ORDER BY week, game_date, team_abbr"
                    ).all(season);
                }
                return sendJson(200, { season, team: team || null, games: rows }, 3600);
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
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

            // Serve from in-memory live state if fresh.
            // TTL: 2 min when live (matches poller interval so browser refreshes don't trigger
            // extra Tank01 calls between cycles), 10 min otherwise.
            // When hard-stopped, always serve whatever we have in liveState rather than
            // returning an error to users mid-game.
            const live = liveState[dateStr];
            if (live) {
                const hasLive = live.games.some(g => g.status === "live");
                const ttl = hasLive ? 120_000 : 600_000;
                if (Date.now() - live.updatedAt < ttl || apiHardStopped) {
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

        // ── /api/game-boxscore?gameID=... ────────────────────────────
        // Returns player stats from a concluded game boxscore.
        // Caches to boxscore_stats_{gameID}.json after first fetch.
        if (urlPath === "/api/game-boxscore") {
            const gameID = parsed.searchParams.get("gameID");
            if (!gameID) return sendJson(400, { error: "gameID required" });

            const statsCache = readDiskCache(`boxscore_stats_${gameID}.json`);
            if (statsCache) return sendJson(200, { source: "cache", ...statsCache });

            if (!RAPIDAPI_KEY) return sendJson(503, { status: "no-key" });
            if (apiHardStopped) return sendJson(503, { error: "API hard stopped" });
            try {
                const body = await tank01Get("/getNFLBoxScore", { gameID, playByPlay: "false" });
                const info = body?.gameInfo ?? body?.game ?? body ?? {};
                const awayAbbr = (info.awayTeam ?? info.away ?? "").toUpperCase();
                const homeAbbr = (info.homeTeam ?? info.home ?? "").toUpperCase();
                const awayScore = pick(info,"awayScore","awayPts") || pick(body,"awayScore","awayPts");
                const homeScore = pick(info,"homeScore","homePts") || pick(body,"homeScore","homePts");

                // Tank01 returns playerStats as a dict keyed by playerID — same as live box score
                let flatPlayers = [];
                const bps = body?.playerStats;
                if (bps && typeof bps === "object" && !Array.isArray(bps)) {
                    flatPlayers = Object.values(bps)
                        .filter(p => p.longName && p.teamAbv)
                        .map(p => ({
                            name:      p.longName,
                            team:      p.teamAbv,
                            Passing:   p.Passing   || null,
                            Rushing:   p.Rushing   || null,
                            Receiving: p.Receiving || null,
                            Defense:   p.Defense   || null,
                            Kicking:   p.Kicking   || null,
                        }));
                }

                const result = { away: awayAbbr, home: homeAbbr, awayScore, homeScore, playerStats: flatPlayers };
                writeDiskCache(`boxscore_stats_${gameID}.json`, result);
                return sendJson(200, { source: "api", ...result });
            } catch (err) {
                return sendJson(502, { error: err.message });
            }
        }

        // ── /api/admin/cache-season-logs?season=2025 ─────────────────
        // Triggers a background fetch of all skill-player game logs for a past season.
        // Phase 1: 32 roster calls; Phase 2: ~1 call per skill player (~150-200 calls).
        // Only usable for seasons prior to NFL_SEASON.
        if (urlPath === "/api/admin/cache-season-logs") {
            if (!RAPIDAPI_KEY) return sendJson(503, { error: "RAPIDAPI_KEY not configured" });
            const season = parseInt(parsed.searchParams.get("season") || "2025");
            const force  = parsed.searchParams.get("force") === "true";
            if (season >= NFL_SEASON) return sendJson(400, { error: `season must be < ${NFL_SEASON}` });
            const cacheFile = `player_stats_${season}.json`;
            const existing  = readDiskCache(cacheFile);
            if (existing && !force) return sendJson(200, { status: "already-cached", count: existing.length, season });
            if (apiHardStopped) return sendJson(503, { error: "API hard stopped — wait for billing window reset" });
            if (season === 2025 && building2025)
                return sendJson(202, { status: "fetching", season, message: "2025 fetch already in progress" });
            // Require explicit force=true when budget is tight and there are games today
            const adminRemaining = DAILY_CALL_LIMIT - callBudget.count;
            const adminGameDay   = (seasonSchedule[todayStr().replace(/-/g,"")] ?? []).length > 0;
            if (adminRemaining < 300 && adminGameDay && !force) {
                return sendJson(503, {
                    error: `Only ${adminRemaining} calls left — add &force=true to override budget guard, or wait until after the game.`,
                });
            }
            (async () => {
                if (season === 2025) building2025 = true;
                try {
                    const data = await buildAndEnrichSeasonStats(season);
                    if (data.length) {
                        writeDiskCache(cacheFile, data);
                        log("info", `Season ${season} cached: ${data.length} players`);
                        if (season === 2025) {
                            hist2025Stats = data;
                            wordle2025Players = buildWordle2025Players();
                            log("info", `2025 stats updated in-memory: ${data.length} players, Wordle pool: ${wordle2025Players?.length ?? 0}`);
                        }
                    }
                } catch (err) { log("error", `cache-season-logs ${season}: ${err.message}`); }
                finally { if (season === 2025) building2025 = false; }
            })();
            return sendJson(202, {
                status: "fetching",
                season,
                message: `Fetching ${season} game logs via getNFLGamesForPlayer (32 roster + ~200 game log calls). Check /health for call budget.`,
            });
        }

        // ── /api/player-game-logs?espnId=X&season=Y ──────────────────
        if (urlPath === "/api/player-game-logs") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            const espnId = parsed.searchParams.get("espnId");
            const season = parseInt(parsed.searchParams.get("season") || "2026");
            if (!espnId) return sendJson(400, { error: "espnId required" });
            try {
                const rows = nflDb.prepare(`
                    SELECT week, opp_abbr, home_away, passing_yds, passing_tds,
                           rushing_yds, rushing_tds, receiving_yds, receiving_tds,
                           fantasy_pts_std, fantasy_pts_ppr
                    FROM game_logs
                    WHERE espn_id = ? AND season = ? AND week BETWEEN 1 AND 18
                    ORDER BY week ASC
                `).all(espnId, season);
                return sendJson(200, rows, 300);
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        // ── /api/season-trends?season=Y ──────────────────────────────
        if (urlPath === "/api/season-trends") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            const season = parseInt(parsed.searchParams.get("season") || "2026");
            try {
                const avgRows = nflDb.prepare(`
                    SELECT espn_id, AVG(COALESCE(fantasy_pts_std,0)) AS seasonAvg
                    FROM game_logs WHERE season = ? AND week BETWEEN 1 AND 18
                    GROUP BY espn_id
                `).all(season);
                const last3Rows = nflDb.prepare(`
                    SELECT espn_id, AVG(fantasy_pts_std) AS last3Avg
                    FROM (
                        SELECT espn_id, fantasy_pts_std,
                               ROW_NUMBER() OVER (PARTITION BY espn_id ORDER BY week DESC) AS rn
                        FROM game_logs WHERE season = ? AND week BETWEEN 1 AND 18
                    ) WHERE rn <= 3
                    GROUP BY espn_id
                `).all(season);
                const trends = {};
                for (const r of avgRows) trends[r.espn_id] = { seasonAvg: +(r.seasonAvg||0).toFixed(2), last3Avg: 0 };
                for (const r of last3Rows) if (trends[r.espn_id]) trends[r.espn_id].last3Avg = +(r.last3Avg||0).toFixed(2);
                return sendJson(200, trends, 900);
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        // ── /api/search?q=X ──────────────────────────────────────────
        if (urlPath === "/api/search") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            const q = (parsed.searchParams.get("q") || "").trim();
            if (q.length < 2) return sendJson(200, []);
            try {
                const like = `%${q}%`;
                const players = nflDb.prepare(`
                    SELECT p.espn_id AS espnId, p.name, p.position AS pos,
                           COALESCE(t.team_abbr, (
                               SELECT s.team_abbr FROM player_team_stints s
                               WHERE s.espn_id = p.espn_id
                               ORDER BY s.season DESC, s.week_start DESC LIMIT 1
                           ), '—') AS team
                    FROM players p
                    LEFT JOIN season_player_totals_2026 t ON t.espn_id = p.espn_id
                    WHERE p.name LIKE ? AND p.position IN ('QB','RB','WR','TE','K')
                    ORDER BY p.name LIMIT 8
                `).all(like);
                const teams = nflDb.prepare(`
                    SELECT abbr, name FROM teams WHERE name LIKE ? OR abbr LIKE ? LIMIT 3
                `).all(like, like);
                const results = [
                    ...players.map(p => ({ type:"player", name:p.name, pos:p.pos, team:p.team, espnId:p.espnId })),
                    ...teams.map(t => ({ type:"team", name:t.name, abbr:t.abbr })),
                ].slice(0, 10);
                return sendJson(200, results, 60);
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        // ── Auth endpoints ────────────────────────────────────────────
        if (urlPath === "/api/auth/register" && req.method === "POST") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            const chunks = [];
            req.on("data", c => chunks.push(c));
            await new Promise(r => req.on("end", r));
            let body;
            try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return sendJson(400, { error: "Invalid JSON" }); }
            const { email, username, password } = body || {};
            if (!email || !username || !password || password.length < 6) return sendJson(400, { error: "email, username and password (min 6 chars) required" });
            const existing = nflDb.prepare("SELECT id FROM users WHERE email=?").get(email.trim().toLowerCase());
            if (existing) return sendJson(409, { error: "Email already registered" });
            const salt = crypto.randomBytes(16).toString("hex");
            const hash = hashPassword(password, salt);
            const { lastInsertRowid: userId } = nflDb.prepare("INSERT INTO users (email, username, password_hash, salt) VALUES (?,?,?,?)").run(email.trim().toLowerCase(), username.trim(), hash, salt);
            const token = genToken();
            const expires = Math.floor(Date.now()/1000) + 30*24*3600;
            nflDb.prepare("INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, userId, expires);
            return sendJson(201, { token, user: { id: userId, email: email.trim().toLowerCase(), username: username.trim() } });
        }
        if (urlPath === "/api/auth/login" && req.method === "POST") {
            if (!nflDb) return sendJson(503, { error: "DB unavailable" });
            const chunks = [];
            req.on("data", c => chunks.push(c));
            await new Promise(r => req.on("end", r));
            let body;
            try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return sendJson(400, { error: "Invalid JSON" }); }
            const { email, password } = body || {};
            if (!email || !password) return sendJson(400, { error: "email and password required" });
            const user = nflDb.prepare("SELECT * FROM users WHERE email=?").get(email.trim().toLowerCase());
            if (!user || hashPassword(password, user.salt) !== user.password_hash) return sendJson(401, { error: "Invalid email or password" });
            const token = genToken();
            const expires = Math.floor(Date.now()/1000) + 30*24*3600;
            nflDb.prepare("INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, user.id, expires);
            nflDb.prepare("UPDATE users SET last_login=unixepoch() WHERE id=?").run(user.id);
            return sendJson(200, { token, user: { id: user.id, email: user.email, username: user.username } });
        }
        if (urlPath === "/api/auth/me" && req.method === "GET") {
            const user = getAuthUser(req);
            if (!user) return sendJson(401, { error: "Unauthorized" });
            return sendJson(200, { user });
        }
        if (urlPath === "/api/auth/logout" && req.method === "POST") {
            const auth = req.headers["authorization"] || "";
            const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
            if (token && nflDb) nflDb.prepare("DELETE FROM user_sessions WHERE token=?").run(token);
            return sendJson(200, { ok: true });
        }
        if (urlPath === "/api/user/prefs" && req.method === "GET") {
            const user = getAuthUser(req);
            if (!user) return sendJson(401, { error: "Unauthorized" });
            const rows = nflDb.prepare("SELECT pref_key, pref_val FROM user_prefs WHERE user_id=?").all(user.id);
            const prefs = Object.fromEntries(rows.map(r => [r.pref_key, JSON.parse(r.pref_val)]));
            return sendJson(200, prefs);
        }
        if (urlPath === "/api/user/prefs" && req.method === "PUT") {
            const user = getAuthUser(req);
            if (!user) return sendJson(401, { error: "Unauthorized" });
            const chunks = [];
            req.on("data", c => chunks.push(c));
            await new Promise(r => req.on("end", r));
            let body;
            try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return sendJson(400, { error: "Invalid JSON" }); }
            const { key, value } = body || {};
            if (!key) return sendJson(400, { error: "key required" });
            nflDb.prepare("INSERT INTO user_prefs (user_id, pref_key, pref_val) VALUES (?,?,?) ON CONFLICT(user_id, pref_key) DO UPDATE SET pref_val=excluded.pref_val").run(user.id, key, JSON.stringify(value));
            return sendJson(200, { ok: true });
        }

        // ── /api/espn-league?leagueId=X&season=Y ─────────────────────
        if (urlPath === "/api/espn-league") {
            const leagueId = parsed.searchParams.get("leagueId");
            const season   = parsed.searchParams.get("season") || "2026";
            const espnS2   = parsed.searchParams.get("espn_s2") || "";
            const swid     = parsed.searchParams.get("swid")    || "";
            if (!leagueId) return sendJson(400, { error: "leagueId required" });
            try {
                const espnUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mRoster&view=mTeam&view=mSettings`;
                const headers = {
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Referer": "https://fantasy.espn.com/",
                    "Origin": "https://fantasy.espn.com",
                };
                if (espnS2 && swid) {
                    headers["Cookie"] = `espn_s2=${espnS2}; SWID=${swid}`;
                }
                const espnRes = await fetch(espnUrl, { headers });
                if (!espnRes.ok) {
                    const body = await espnRes.json().catch(() => ({}));
                    const msg  = body?.messages?.[0] || `ESPN returned ${espnRes.status}`;
                    return sendJson(espnRes.status, { error: msg });
                }
                const data = await espnRes.json();
                return sendJson(200, data, 300);
            } catch (e) {
                return sendJson(502, { error: e.message });
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

        // ── /game/:gameID — serve game recap page ─────────────────────
        if (urlPath.startsWith("/game/")) {
            const html = fs.readFileSync(path.join(__dirname, "game.html"));
            res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache" });
            res.end(html);
            return;
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
    // Build Wordle 2025 pool now that Sleeper data is available
    if (hist2025Stats) {
        wordle2025Players = buildWordle2025Players();
        log("info", `Wordle 2025 pool built: ${wordle2025Players?.length ?? 0} players`);
    }

    server.listen(PORT, () => log("info", `Server running on port ${PORT}`));
});
