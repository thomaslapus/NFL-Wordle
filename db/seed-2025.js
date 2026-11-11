#!/usr/bin/env node
"use strict";
/**
 * Seed 2025 season player data into nfl.db
 *
 * Phase 1 : 32 roster calls  → populates players + player_team_stints
 * Phase 2 : 1 call per skill-position player → populates game_logs + season_player_totals
 *
 * Resumable: progress is saved to db/seed-2025-progress.json after each player.
 * Re-run the script at any time — already-processed players are skipped.
 *
 * Usage:
 *   RAPIDAPI_KEY=your_key node db/seed-2025.js
 *
 * Hard budget cap: --max-calls N  (default 700, stops early if reached)
 *   node db/seed-2025.js --max-calls 400
 */

const path     = require("path");
const fs       = require("fs");
const Database = require("better-sqlite3");

// ── Config ────────────────────────────────────────────────────────────────────

const ROOT          = path.join(__dirname, "..");
const DB_PATH       = path.join(ROOT, "data", "nfl.db");
const PROGRESS_FILE = path.join(__dirname, "seed-2025-progress.json");
const API_CALLS_FILE = path.join(ROOT, "data", "api_calls.json");

// Load .env if present
try {
    fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n").forEach(line => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
} catch {}

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";
const SEASON        = 2025;
const DELAY_MS      = 300; // ms between calls — polite to the API

// Parse --max-calls from argv
const maxCallsArg = process.argv.indexOf("--max-calls");
const MAX_CALLS   = maxCallsArg !== -1 ? parseInt(process.argv[maxCallsArg + 1], 10) : 700;

// Offense + defense positions we track
const SKILL_POSITIONS = new Set([
    "QB", "RB", "WR", "TE", "FB",
    "DE", "DT", "NT", "LB", "ILB", "OLB", "MLB",
    "CB", "S", "FS", "SS", "DB", "EDG",
]);

// Tank01 uses "WAS"; ESPN/DB may show "WSH" — map on insert
const TANK01_TO_DB_ABBR = { WAS: "WSH" };
function normalizeAbbr(abbr) { return TANK01_TO_DB_ABBR[abbr] ?? abbr; }

// ── Guards ────────────────────────────────────────────────────────────────────

if (!RAPIDAPI_KEY) {
    console.error("ERROR: Set RAPIDAPI_KEY env var before running.\n  RAPIDAPI_KEY=your_key node db/seed-2025.js");
    process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: Database not found at ${DB_PATH}\n  Run: node db/init-db.js`);
    process.exit(1);
}

// ── Budget tracking (shared with server.js) ───────────────────────────────────

function readBudget() {
    try { return JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8")); } catch { return { date: "", count: 0 }; }
}
function writeBudget(b) { fs.writeFileSync(API_CALLS_FILE, JSON.stringify(b)); }

let budget    = readBudget();
let callsMade = 0; // calls made in this script run

function trackCall() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (budget.date !== today) budget = { date: today, count: 0 };
    budget.count++;
    callsMade++;
    writeBudget(budget);
    if (callsMade % 10 === 0) console.log(`  [budget] ${budget.count} total calls today, ${callsMade} this run`);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tank01Get(endpoint, params = {}) {
    if (callsMade >= MAX_CALLS) throw new Error(`MAX_CALLS limit (${MAX_CALLS}) reached — stopping to protect budget.`);
    const url = new URL(`https://${RAPIDAPI_HOST}${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    console.log(`  -> GET ${endpoint}  ${JSON.stringify(params)}`);
    trackCall();
    const res = await fetch(url.toString(), {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
    const json = await res.json();
    if (json.message && !json.body && !json.statusCode)
        throw new Error(`Tank01 rejected: ${json.message}`);
    if (json.statusCode && json.statusCode !== 200)
        throw new Error(`Tank01 error ${json.statusCode}: ${JSON.stringify(json.body)}`);
    await sleep(DELAY_MS);
    return json.body ?? json;
}

// ── Field extractors ──────────────────────────────────────────────────────────

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

function simplifyPos(raw) {
    const p = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    if (p.startsWith("QB")) return "QB";
    if (p.startsWith("RB") || p === "HB") return "RB";
    if (p.startsWith("WR")) return "WR";
    if (p.startsWith("TE")) return "TE";
    if (p.startsWith("FB")) return "FB";
    return p;
}

// ── Progress file ─────────────────────────────────────────────────────────────

function loadProgress() {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch { return null; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ── DB setup ──────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const stmts = {
    upsertPlayer: db.prepare(`
        INSERT INTO players (espn_id, name, position, height, weight, college, draft_year, draft_round, draft_pick)
        VALUES (@espn_id, @name, @position, @height, @weight, @college, @draft_year, @draft_round, @draft_pick)
        ON CONFLICT(espn_id) DO UPDATE SET
            name        = excluded.name,
            position    = excluded.position,
            draft_year  = COALESCE(excluded.draft_year,  players.draft_year),
            draft_round = COALESCE(excluded.draft_round, players.draft_round),
            draft_pick  = COALESCE(excluded.draft_pick,  players.draft_pick)
    `),

    insertStint: db.prepare(`
        INSERT OR IGNORE INTO player_team_stints (espn_id, team_abbr, season, week_start)
        VALUES (@espn_id, @team_abbr, @season, 1)
    `),

    insertGameLog: db.prepare(`
        INSERT OR REPLACE INTO game_logs
            (espn_id, game_id, season, week, game_date, team_abbr, opp_abbr, home_away,
             passing_att, passing_cmp, passing_yds, passing_tds, interceptions,
             rushing_att, rushing_yds, rushing_tds,
             targets, receptions, receiving_yds, receiving_tds,
             fumbles_lost, two_pt_conv,
             fantasy_pts_std, fantasy_pts_ppr, snap_count, snap_pct,
             sacks, solo_tackles, assisted_tackles, tackles_for_loss,
             passes_defended, def_interceptions, forced_fumbles, def_tds, sack_yards)
        VALUES
            (@espn_id, @game_id, @season, @week, @game_date, @team_abbr, @opp_abbr, @home_away,
             @passing_att, @passing_cmp, @passing_yds, @passing_tds, @interceptions,
             @rushing_att, @rushing_yds, @rushing_tds,
             @targets, @receptions, @receiving_yds, @receiving_tds,
             @fumbles_lost, @two_pt_conv,
             @fantasy_pts_std, @fantasy_pts_ppr, @snap_count, @snap_pct,
             @sacks, @solo_tackles, @assisted_tackles, @tackles_for_loss,
             @passes_defended, @def_interceptions, @forced_fumbles, @def_tds, @sack_yards)
    `),

    upsertTotals: db.prepare(`
        INSERT OR REPLACE INTO season_player_totals_2025
            (espn_id, team_abbr, games_played,
             passing_att, passing_cmp, passing_yds, passing_tds, interceptions,
             rushing_att, rushing_yds, rushing_tds,
             targets, receptions, receiving_yds, receiving_tds,
             fumbles_lost, fantasy_pts_std, fantasy_pts_ppr,
             sacks, solo_tackles, assisted_tackles, tackles_for_loss,
             passes_defended, def_interceptions, forced_fumbles, def_tds)
        VALUES
            (@espn_id, @team_abbr, @games_played,
             @passing_att, @passing_cmp, @passing_yds, @passing_tds, @interceptions,
             @rushing_att, @rushing_yds, @rushing_tds,
             @targets, @receptions, @receiving_yds, @receiving_tds,
             @fumbles_lost, @fantasy_pts_std, @fantasy_pts_ppr,
             @sacks, @solo_tackles, @assisted_tackles, @tackles_for_loss,
             @passes_defended, @def_interceptions, @forced_fumbles, @def_tds)
    `),
};

// ── Main ──────────────────────────────────────────────────────────────────────

const ALL_TEAM_ABBRS = [
    "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
    "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
    "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
];

(async () => {
    console.log(`\n=== NFL 2025 Season DB Seeder ===`);
    console.log(`Database  : ${DB_PATH}`);
    console.log(`Max calls : ${MAX_CALLS}`);
    console.log(`Budget    : ${budget.count} calls used today\n`);

    let progress = loadProgress();

    // ── Phase 1: Rosters ─────────────────────────────────────────────────────

    if (!progress?.rostersComplete) {
        console.log("Phase 1: Fetching 2025 rosters (32 calls)...");
        const roster = [];

        for (const abbr of ALL_TEAM_ABBRS) {
            if (callsMade >= MAX_CALLS) { console.log("Budget cap reached during Phase 1. Re-run to continue."); break; }
            try {
                const body = await tank01Get("/getNFLTeamRoster", { teamAbv: abbr, getStats: "true", season: String(SEASON) });
                const players = body?.roster ?? (Array.isArray(body) ? body : []);

                // Log the raw structure once so we can verify field names
                if (abbr === ALL_TEAM_ABBRS[0] && players.length) {
                    console.log(`  [debug] Sample player fields: ${Object.keys(players[0]).join(", ")}`);
                }

                for (const p of players) {
                    const pos = simplifyPos(p.pos ?? p.position ?? "");
                    if (!SKILL_POSITIONS.has(pos)) continue;
                    const tankId = p.playerID ?? p.id;
                    if (!tankId) continue;
                    roster.push({
                        tankId,
                        espnId:     p.espnID ?? p.espnId ?? "",
                        name:       p.longName ?? p.fullName ?? p.name ?? "",
                        pos,
                        team:       normalizeAbbr(abbr),
                        height:     p.height ?? null,
                        weight:     p.weight ? parseInt(p.weight, 10) : null,
                        college:    p.college ?? null,
                        draftYear:  p.draftYear  ? parseInt(p.draftYear, 10)  : null,
                        draftRound: p.draftRound ? parseInt(p.draftRound, 10) : null,
                        draftPick:  p.draftPick  ? parseInt(p.draftPick, 10)  : null,
                    });
                }
                console.log(`  ${abbr}: ${players.length} total players on roster`);
            } catch (err) {
                console.warn(`  WARN: ${abbr} roster failed — ${err.message}`);
            }
        }

        // Deduplicate by tankId (a player on two rosters in preseason may appear twice)
        const seen = new Set();
        const deduped = roster.filter(p => { if (seen.has(p.tankId)) return false; seen.add(p.tankId); return true; });

        progress = { rostersComplete: callsMade < MAX_CALLS, roster: deduped, processed: [] };
        saveProgress(progress);
        console.log(`Phase 1 done: ${deduped.length} unique skill-position players\n`);
    } else {
        console.log(`Phase 1: skipped (${progress.roster.length} players already loaded from progress file)\n`);
    }

    if (!progress.rostersComplete) {
        console.log("Rosters not fully fetched yet (budget hit). Re-run to continue Phase 1.");
        db.close();
        return;
    }

    // ── Phase 1b: Write players + stints into DB ──────────────────────────────

    const writeRoster = db.transaction((roster) => {
        for (const p of roster) {
            if (!p.espnId) continue; // skip players without ESPN ID (can't be primary key)
            stmts.upsertPlayer.run({
                espn_id:     p.espnId,
                name:        p.name,
                position:    p.pos,
                height:      p.height      ?? null,
                weight:      p.weight      ?? null,
                college:     p.college     ?? null,
                draft_year:  p.draftYear   ?? null,
                draft_round: p.draftRound  ?? null,
                draft_pick:  p.draftPick   ?? null,
            });
            stmts.insertStint.run({ espn_id: p.espnId, team_abbr: p.team, season: SEASON });
        }
    });
    writeRoster(progress.roster);
    console.log(`Players + stints written to DB for ${progress.roster.filter(p => p.espnId).length} players`);

    // ── Phase 2: Game logs ────────────────────────────────────────────────────

    const processedSet = new Set(progress.processed);
    const toProcess    = progress.roster.filter(p => p.espnId && !processedSet.has(p.tankId));

    console.log(`\nPhase 2: ${toProcess.length} players remaining (${processedSet.size} already done)\n`);

    for (const player of toProcess) {
        if (callsMade >= MAX_CALLS) {
            console.log(`\nBudget cap (${MAX_CALLS} calls) reached. Progress saved — re-run to continue.`);
            break;
        }

        try {
            const body = await tank01Get("/getNFLGamesForPlayer", { playerID: player.tankId, season: String(SEASON) });

            // Tank01 returns body as an object keyed by gameID, e.g.:
            // { "20260104_ARI@LAR": { Passing: {...}, Rushing: {...}, teamAbv: "ARI", ... } }
            if (!body || typeof body !== "object" || Array.isArray(body)) {
                console.log(`  ${player.name}: unexpected response shape`);
                progress.processed.push(player.tankId);
                saveProgress(progress);
                continue;
            }
            const gameEntries = Object.entries(body).filter(([k]) => /^\d{8}_/.test(k));
            if (gameEntries.length === 0) {
                console.log(`  ${player.name} (${player.pos}/${player.team}): no games`);
                progress.processed.push(player.tankId);
                saveProgress(progress);
                continue;
            }

            // 2025 regular season started Sep 4, 2025 (Thursday opener)
            const SEASON_START = new Date("2025-09-04");

            const writeGames = db.transaction((entries) => {
                let tot = {
                    gp:0, pAtt:0, pCmp:0, pYds:0, pTds:0, pInt:0,
                    rAtt:0, rYds:0, rTds:0,
                    tgts:0, rec:0, rcYds:0, rcTds:0,
                    fum:0, fptStd:0, fptPpr:0,
                    sacks:0, soloTackles:0, assistedTackles:0, tacklesForLoss:0,
                    passesDefended:0, defInt:0, forcedFumbles:0, defTds:0, sackYards:0,
                };

                for (const [gameId, g] of entries) {
                    if (!g || typeof g !== "object") continue;

                    // Parse date and week from gameId ("20260104_ARI@LAR")
                    const gameDate = gameId.slice(0, 8);
                    const gd = new Date(`${gameDate.slice(0,4)}-${gameDate.slice(4,6)}-${gameDate.slice(6,8)}`);
                    const diffDays = Math.round((gd - SEASON_START) / 86_400_000);
                    const week = diffDays < 0 ? 0 : Math.floor(diffDays / 7) + 1; // 0 = preseason

                    // Parse home/away from gameId ("20260104_ARI@LAR" → away=ARI, home=LAR)
                    const matchPart = gameId.slice(9); // "ARI@LAR"
                    const atIdx = matchPart.indexOf("@");
                    const awayRaw = atIdx > -1 ? matchPart.slice(0, atIdx) : "";
                    const homeRaw = atIdx > -1 ? matchPart.slice(atIdx + 1) : "";
                    const teamAbv  = normalizeAbbr(g.teamAbv || player.team);
                    const homeAway = teamAbv === normalizeAbbr(homeRaw) ? "home" : "away";
                    const oppAbv   = teamAbv === normalizeAbbr(homeRaw)
                        ? normalizeAbbr(awayRaw)
                        : normalizeAbbr(homeRaw);

                    // Stats are nested under Passing / Rushing / Receiving sub-objects
                    const P = g.Passing   || {};
                    const R = g.Rushing   || {};
                    const C = g.Receiving || {};
                    const D = g.Defense   || {};
                    const S = g.snapCounts || {};

                    const n = (v) => parseFloat(v) || 0;

                    const row = {
                        espn_id:         player.espnId,
                        game_id:         gameId,
                        season:          SEASON,
                        week,
                        game_date:       gameDate,
                        team_abbr:       teamAbv,
                        opp_abbr:        oppAbv,
                        home_away:       homeAway,
                        passing_att:     n(P.passAttempts),
                        passing_cmp:     n(P.passCompletions),
                        passing_yds:     n(P.passYds),
                        passing_tds:     n(P.passTD),
                        interceptions:   n(P.int),
                        rushing_att:     n(R.carries),
                        rushing_yds:     n(R.rushYds),
                        rushing_tds:     n(R.rushTD),
                        targets:         n(C.targets ?? C.tgts),
                        receptions:      n(C.receptions ?? C.rec),
                        receiving_yds:   n(C.recYds),
                        receiving_tds:   n(C.recTD),
                        fumbles_lost:     n(D.fumblesLost),
                        sacks:            n(D.sacks        ?? D.Sacks),
                        solo_tackles:     n(D.soloTackles  ?? D.solo ?? D.solotackles),
                        assisted_tackles: n(D.assistedTackles ?? D.ast ?? D.assist),
                        tackles_for_loss: n(D.tfl          ?? D.tacklesForLoss),
                        passes_defended:  n(D.passDeflections ?? D.defPD ?? D.passDef),
                        def_interceptions: n(D.int         ?? D.defensiveInterceptions),
                        forced_fumbles:   n(D.fumblesForced ?? D.forcedFumbles),
                        def_tds:          n(D.DefTD        ?? D.defTD ?? D.defensiveTD),
                        sack_yards:       n(D.sackYards    ?? D.sackYds),
                        two_pt_conv:      0,
                        fantasy_pts_std: n(g.fantasyPoints ?? g.fantasyPts),
                        fantasy_pts_ppr: n(g.fantasyPointsPPR ?? g.fantasyPtsPPR),
                        snap_count:      n(S.offSnap) || null,
                        snap_pct:        n(S.offSnapPct) || null,
                    };

                    stmts.insertGameLog.run(row);

                    if (week > 0) { // don't count preseason in totals
                        tot.gp++;
                        tot.pAtt  += row.passing_att;  tot.pCmp += row.passing_cmp;
                        tot.pYds  += row.passing_yds;  tot.pTds += row.passing_tds;
                        tot.pInt  += row.interceptions;
                        tot.rAtt  += row.rushing_att;  tot.rYds += row.rushing_yds;
                        tot.rTds  += row.rushing_tds;
                        tot.tgts  += row.targets;       tot.rec  += row.receptions;
                        tot.rcYds += row.receiving_yds; tot.rcTds += row.receiving_tds;
                        tot.fum             += row.fumbles_lost;
                        tot.fptStd          += row.fantasy_pts_std;
                        tot.fptPpr          += row.fantasy_pts_ppr;
                        tot.sacks           += row.sacks;
                        tot.soloTackles     += row.solo_tackles;
                        tot.assistedTackles += row.assisted_tackles;
                        tot.tacklesForLoss  += row.tackles_for_loss;
                        tot.passesDefended  += row.passes_defended;
                        tot.defInt          += row.def_interceptions;
                        tot.forcedFumbles   += row.forced_fumbles;
                        tot.defTds          += row.def_tds;
                        tot.sackYards       += row.sack_yards;
                    }
                }

                if (tot.gp > 0) {
                    stmts.upsertTotals.run({
                        espn_id:          player.espnId,
                        team_abbr:        player.team,
                        games_played:     tot.gp,
                        passing_att:      tot.pAtt,  passing_cmp: tot.pCmp,
                        passing_yds:      tot.pYds,  passing_tds: tot.pTds,
                        interceptions:    tot.pInt,
                        rushing_att:      tot.rAtt,  rushing_yds: tot.rYds,  rushing_tds: tot.rTds,
                        targets:          tot.tgts,  receptions:  tot.rec,
                        receiving_yds:    tot.rcYds, receiving_tds: tot.rcTds,
                        fumbles_lost:     tot.fum,
                        fantasy_pts_std:  tot.fptStd,
                        fantasy_pts_ppr:  tot.fptPpr,
                        sacks:            tot.sacks,
                        solo_tackles:     tot.soloTackles,
                        assisted_tackles: tot.assistedTackles,
                        tackles_for_loss: tot.tacklesForLoss,
                        passes_defended:  tot.passesDefended,
                        def_interceptions: tot.defInt,
                        forced_fumbles:   tot.forcedFumbles,
                        def_tds:          tot.defTds,
                    });
                }
            });

            writeGames(gameEntries);

            console.log(`  ${player.name} (${player.pos}/${player.team}): ${gameEntries.length} games written`);
        } catch (err) {
            if (err.message.includes("MAX_CALLS")) throw err;
            console.warn(`  WARN: ${player.name} — ${err.message}`);
        }

        progress.processed.push(player.tankId);
        saveProgress(progress);
        processedSet.add(player.tankId);
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    const remaining = progress.roster.filter(p => p.espnId && !processedSet.has(p.tankId));

    const totals = db.prepare("SELECT COUNT(*) as c FROM game_logs WHERE season = ?").get(SEASON);
    const players = db.prepare("SELECT COUNT(*) as c FROM players").get();

    console.log(`\n=== Done ===`);
    console.log(`Calls this run : ${callsMade}`);
    console.log(`Budget used    : ${budget.count} / 1000 today`);
    console.log(`Players in DB  : ${players.c}`);
    console.log(`Game logs (2025): ${totals.c}`);
    if (remaining.length > 0) {
        console.log(`\n${remaining.length} players still pending — re-run to continue.`);
    } else {
        console.log(`\nAll 2025 players processed! Safe to delete db/seed-2025-progress.json`);
    }

    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
})().catch(err => {
    console.error(`\nFATAL: ${err.message}`);
    db.close();
    process.exit(1);
});
