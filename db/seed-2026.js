#!/usr/bin/env node
"use strict";
/**
 * Seeds player game logs for the 2026 season (starts with Week 1).
 *
 * Phase 1: Fetches 32 team rosters to build the player list (32 calls).
 * Phase 2: Fetches per-player game logs via getNFLGamesForPlayer for
 *           skill + defensive positions. Each player = 1 call.
 *
 * Progress is saved to db/seed-2026-progress.json so runs can be resumed.
 * Uses the same resumable pattern as seed-2025.js.
 *
 * Usage:
 *   node db/seed-2026.js
 *   RAPIDAPI_KEY=... node db/seed-2026.js
 */

const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const Database = require("better-sqlite3");

const SEASON         = 2026;
const DB_PATH        = path.join(__dirname, "..", "data", "nfl.db");
const PROGRESS_FILE  = path.join(__dirname, "seed-2026-progress.json");
const API_CALLS_FILE = path.join(__dirname, "..", "data", "api_calls.json");

// Load .env if present
try {
    fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n").forEach(line => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
} catch {}

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

if (!RAPIDAPI_KEY) { console.error("❌ RAPIDAPI_KEY not set"); process.exit(1); }

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const SKILL_POSITIONS = new Set(["QB","RB","WR","TE","FB","K",
    "DE","DT","NT","LB","ILB","OLB","MLB","CB","S","FS","SS","DB","EDG"]);

const ALL_TEAM_ABBRS = [
    "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
    "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
    "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"
];

// ── Budget ────────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10).replace(/-/g, ""); }
let budget = { date: todayStr(), count: 0 };
try { budget = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8")); } catch {}
if (budget.date !== todayStr()) { budget = { date: todayStr(), count: 0 }; }
function saveBudget() { fs.writeFileSync(API_CALLS_FILE, JSON.stringify(budget, null, 2)); }

const DAILY_LIMIT = 800;
const MAX_WEEK    = 6;
function remaining() { return DAILY_LIMIT - budget.count; }

// ── Progress ──────────────────────────────────────────────────────────────────
let progress = { rostersComplete: false, roster: [], processed: [] };
try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch {}
const processedSet = new Set(progress.processed || []);

function saveProgress() { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2)); }

// ── API ───────────────────────────────────────────────────────────────────────
const DELAY_MS = 400;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tank01Get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url   = `https://${RAPIDAPI_HOST}${endpoint}${query ? "?" + query : ""}`;
    budget.count++;
    saveBudget();
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: "GET",
            headers: { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": RAPIDAPI_HOST },
        }, res => {
            let data = "";
            res.on("data", c => data += c);
            res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
        });
        req.on("error", reject);
        req.end();
    });
}

function simplifyPos(pos = "") {
    const p = pos.toUpperCase().trim();
    if (["ILB","OLB","MLB"].includes(p)) return "LB";
    if (["FS","SS"].includes(p)) return "S";
    return p;
}

// ── DB statements ─────────────────────────────────────────────────────────────
const upsertPlayer = db.prepare(`
    INSERT INTO players (espn_id, name, position, draft_year, draft_round, draft_pick)
    VALUES (@espn_id, @name, @position, @draft_year, @draft_round, @draft_pick)
    ON CONFLICT(espn_id) DO UPDATE SET
        name       = excluded.name,
        position   = excluded.position,
        draft_year  = COALESCE(excluded.draft_year,  draft_year),
        draft_round = COALESCE(excluded.draft_round, draft_round),
        draft_pick  = COALESCE(excluded.draft_pick,  draft_pick)
`);

const insertLog = db.prepare(`
    INSERT OR REPLACE INTO game_logs (
        espn_id, game_id, season, week, game_date, team_abbr, opp_abbr, home_away,
        passing_att, passing_cmp, passing_yds, passing_tds, interceptions, fumbles_lost,
        rushing_att, rushing_yds, rushing_tds,
        targets, receptions, receiving_yds, receiving_tds,
        two_pt_conv, fantasy_pts_std, fantasy_pts_ppr,
        snap_count, snap_pct,
        sacks, solo_tackles, assisted_tackles, tackles_for_loss,
        passes_defended, def_interceptions, forced_fumbles, def_tds, sack_yards
    ) VALUES (
        @espn_id, @game_id, @season, @week, @game_date, @team_abbr, @opp_abbr, @home_away,
        @passing_att, @passing_cmp, @passing_yds, @passing_tds, @interceptions, @fumbles_lost,
        @rushing_att, @rushing_yds, @rushing_tds,
        @targets, @receptions, @receiving_yds, @receiving_tds,
        @two_pt_conv, @fantasy_pts_std, @fantasy_pts_ppr,
        @snap_count, @snap_pct,
        @sacks, @solo_tackles, @assisted_tackles, @tackles_for_loss,
        @passes_defended, @def_interceptions, @forced_fumbles, @def_tds, @sack_yards
    )
`);

const upsertTotals = db.prepare(`
    INSERT INTO season_player_totals_2026 (
        espn_id, team_abbr, games_played,
        passing_att, passing_cmp, passing_yds, passing_tds, interceptions,
        rushing_att, rushing_yds, rushing_tds,
        targets, receptions, receiving_yds, receiving_tds,
        fumbles_lost, two_pt_conv, fantasy_pts_std, fantasy_pts_ppr,
        sacks, solo_tackles, assisted_tackles, tackles_for_loss,
        passes_defended, def_interceptions, forced_fumbles, def_tds, sack_yards
    ) VALUES (
        @espn_id, @team_abbr, @games_played,
        @passing_att, @passing_cmp, @passing_yds, @passing_tds, @interceptions,
        @rushing_att, @rushing_yds, @rushing_tds,
        @targets, @receptions, @receiving_yds, @receiving_tds,
        @fumbles_lost, @two_pt_conv, @fantasy_pts_std, @fantasy_pts_ppr,
        @sacks, @solo_tackles, @assisted_tackles, @tackles_for_loss,
        @passes_defended, @def_interceptions, @forced_fumbles, @def_tds, @sack_yards
    )
    ON CONFLICT(espn_id, team_abbr) DO UPDATE SET
        games_played   = excluded.games_played,
        passing_att    = excluded.passing_att,
        passing_cmp    = excluded.passing_cmp,
        passing_yds    = excluded.passing_yds,
        passing_tds    = excluded.passing_tds,
        interceptions  = excluded.interceptions,
        rushing_att    = excluded.rushing_att,
        rushing_yds    = excluded.rushing_yds,
        rushing_tds    = excluded.rushing_tds,
        targets        = excluded.targets,
        receptions     = excluded.receptions,
        receiving_yds  = excluded.receiving_yds,
        receiving_tds  = excluded.receiving_tds,
        fumbles_lost   = excluded.fumbles_lost,
        two_pt_conv    = excluded.two_pt_conv,
        fantasy_pts_std = excluded.fantasy_pts_std,
        fantasy_pts_ppr = excluded.fantasy_pts_ppr,
        sacks           = excluded.sacks,
        solo_tackles    = excluded.solo_tackles,
        assisted_tackles= excluded.assisted_tackles,
        tackles_for_loss= excluded.tackles_for_loss,
        passes_defended = excluded.passes_defended,
        def_interceptions = excluded.def_interceptions,
        forced_fumbles  = excluded.forced_fumbles,
        def_tds         = excluded.def_tds,
        sack_yards      = excluded.sack_yards
`);

// ── Parsers ───────────────────────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

// Week 1 of 2026 regular season — first game was Sep 9 2026
const SEASON_START_DATE = 20260909;

function parseGameRow(g, gameId, espnId, teamAbbr, season) {
    // gameId format: "20261004_LAC@SEA"
    const date = gameId.slice(0, 8);
    // Derive week from date (week 1 = Sep 4, each week +7 days)
    const dateNum = parseInt(date) || 0;
    const msPerWeek = 7 * 86400 * 1000;
    const startMs = new Date(String(SEASON_START_DATE).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")).getTime();
    const gameMs  = new Date(date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")).getTime();
    const week    = Math.max(1, Math.floor((gameMs - startMs) / msPerWeek) + 1);

    // Parse home/away from gameId: "YYYYMMDD_AWAY@HOME"
    const atPart  = gameId.split("_")[1] ?? "";
    const [awayId, homeId] = atPart.split("@");
    const ha      = (g.teamAbv ?? teamAbbr).toUpperCase() === (homeId ?? "").toUpperCase() ? "home" : "away";
    const opp     = ha === "home" ? (awayId ?? "") : (homeId ?? "");

    const P = g.Passing   ?? {};
    const Ru = g.Rushing  ?? {};
    const Re = g.Receiving ?? {};
    const D  = g.Defense  ?? {};
    const SC = g.snapCounts ?? {};

    // Parse sacked string like "4-35" → yards lost
    const sackedStr = String(P.sacked ?? "0-0");
    const sackedYds = n(sackedStr.split("-")[1] ?? 0);

    return {
        espn_id: espnId, game_id: gameId, season, week, game_date: date,
        team_abbr: teamAbbr, opp_abbr: opp.toUpperCase(), home_away: ha,
        passing_att:  n(P.passAttempts),
        passing_cmp:  n(P.passCompletions),
        passing_yds:  n(P.passYds),
        passing_tds:  n(P.passTD),
        interceptions:n(P.int),
        fumbles_lost: n(D.fumblesLost),
        rushing_att:  n(Ru.carries),
        rushing_yds:  n(Ru.rushYds),
        rushing_tds:  n(Ru.rushTD),
        targets:      n(Re.targets),
        receptions:   n(Re.receptions),
        receiving_yds:n(Re.recYds),
        receiving_tds:n(Re.recTD),
        two_pt_conv:  0,
        fantasy_pts_std: n(g.fantasyPoints ?? g.fantasy_pts_std),
        fantasy_pts_ppr: n(g.fantasyPointsPPR ?? g.fantasy_pts_ppr),
        snap_count:   n(SC.offenseSnaps ?? SC.defenseSnaps ?? SC.snapCount),
        snap_pct:     n(SC.offenseSnapPercentage ?? SC.defenseSnapPercentage),
        sacks:        n(D.sacks),
        solo_tackles: n(D.soloTackles),
        assisted_tackles: n(n(D.totalTackles) - n(D.soloTackles)),
        tackles_for_loss: n(D.tfl),
        passes_defended:  n(D.passDeflections),
        def_interceptions: n(D.defensiveInterceptions),
        forced_fumbles:   n(D.forcedFumbles),
        def_tds:          n(D.defTD),
        sack_yards:       n(D.sackYards ?? D.sackYds),
    };
}

// ── Phase 1: Fetch rosters ────────────────────────────────────────────────────
async function phase1() {
    console.log(`\n── Phase 1: Fetching ${SEASON} rosters (${ALL_TEAM_ABBRS.length} calls) ──`);
    const roster = [];
    for (const abbr of ALL_TEAM_ABBRS) {
        if (remaining() < 5) { console.log("⚠ Budget low — stopping phase 1"); break; }
        try {
            const raw = await tank01Get("/getNFLTeamRoster", { teamAbv: abbr, getStats: "true", season: String(SEASON) });
            const inner = raw?.body ?? raw;
            const players = inner?.roster ?? (Array.isArray(inner) ? inner : []);
            for (const p of players) {
                const pos = simplifyPos(p.pos ?? p.position ?? "");
                if (!SKILL_POSITIONS.has(pos)) continue;
                const tankId = p.playerID ?? p.id ?? "";
                if (!tankId) continue;
                const draftYear = p.draftInfo?.year ? parseInt(p.draftInfo.year) : (parseInt(p.exp ?? 0) > 0 ? SEASON - parseInt(p.exp ?? 1) : null);
                const draftRound = parseInt(p.draftInfo?.round ?? p.draftRound ?? p.draft_round ?? 0) || null;
                const draftPick  = parseInt(p.draftInfo?.pick  ?? p.draftPick  ?? p.draft_pick  ?? 0) || null;
                roster.push({
                    playerID: tankId,
                    espnId:   p.espnID ?? p.espnId ?? "",
                    name:     p.longName ?? p.fullName ?? p.name ?? "",
                    pos,
                    team:     abbr,
                    draftYear, draftRound, draftPick,
                });
            }
            process.stdout.write(".");
        } catch (err) {
            console.warn(`\n  ⚠ Roster ${abbr}: ${err.message}`);
        }
        await sleep(DELAY_MS);
    }
    console.log(`\n  ✓ ${roster.length} players found`);
    progress.rostersComplete = true;
    progress.roster = roster;
    saveProgress();
    return roster;
}

// ── Phase 2: Fetch game logs ──────────────────────────────────────────────────
async function phase2(roster) {
    console.log(`\n── Phase 2: Fetching ${SEASON} game logs ──`);
    const pending = roster.filter(p => !processedSet.has(p.playerID));
    console.log(`  ${pending.length} players pending (${processedSet.size} already processed)`);

    let done = 0, skipped = 0, noGames = 0;

    for (const player of pending) {
        if (remaining() < 3) {
            console.log(`\n⚠ Budget exhausted (${remaining()} remaining) — stopping. Resume tomorrow.`);
            break;
        }
        try {
            const raw   = await tank01Get("/getNFLGamesForPlayer", { playerID: player.playerID, season: String(SEASON) });
            // API returns {statusCode, body: {gameId: gameData, ...}}
            const bodyInner = raw?.body ?? raw;
            // Filter to regular season only (game date >= SEASON_START_DATE) and skip non-object entries
            const msPerWeekInner = 7 * 86400 * 1000;
            const startMsInner   = new Date("2026-09-09").getTime();
            const gameEntries = Object.entries(
                (bodyInner && typeof bodyInner === "object" && !Array.isArray(bodyInner)) ? bodyInner : {}
            ).filter(([gid, gdata]) => {
                const dateNum = parseInt(gid.slice(0, 8)) || 0;
                if (dateNum < SEASON_START_DATE || !gdata || typeof gdata !== "object") return false;
                const dateStr = gid.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
                const week    = Math.max(1, Math.floor((new Date(dateStr).getTime() - startMsInner) / msPerWeekInner) + 1);
                return week <= MAX_WEEK;
            });

            if (!gameEntries.length) { noGames++; }
            else {
                // Upsert player
                if (player.espnId) {
                    upsertPlayer.run({
                        espn_id: player.espnId, name: player.name,
                        position: player.pos,
                        draft_year: player.draftYear, draft_round: player.draftRound, draft_pick: player.draftPick,
                    });
                }

                // Insert game logs and accumulate totals
                const tot = {
                    espn_id: player.espnId, team_abbr: player.team, games_played: 0,
                    passing_att:0, passing_cmp:0, passing_yds:0, passing_tds:0, interceptions:0,
                    rushing_att:0, rushing_yds:0, rushing_tds:0,
                    targets:0, receptions:0, receiving_yds:0, receiving_tds:0,
                    fumbles_lost:0, two_pt_conv:0, fantasy_pts_std:0, fantasy_pts_ppr:0,
                    sacks:0, solo_tackles:0, assisted_tackles:0, tackles_for_loss:0,
                    passes_defended:0, def_interceptions:0, forced_fumbles:0, def_tds:0, sack_yards:0,
                };

                const insertLogs = db.transaction(entries => {
                    for (const [gid, gdata] of entries) {
                        const row = parseGameRow(gdata, gid, player.espnId, player.team, SEASON);
                        insertLog.run(row);
                        tot.games_played++;
                        for (const k of Object.keys(tot)) {
                            if (k in row && typeof tot[k] === "number") tot[k] += row[k] || 0;
                        }
                    }
                });
                insertLogs(gameEntries);

                if (tot.games_played > 0 && player.espnId) {
                    upsertTotals.run(tot);
                }
                done++;
            }
        } catch (err) {
            console.warn(`\n  ⚠ ${player.name}: ${err.message}`);
            skipped++;
        }

        processedSet.add(player.playerID);
        progress.processed = [...processedSet];
        if ((done + skipped + noGames) % 20 === 0) {
            saveProgress();
            process.stdout.write(".");
        }
        await sleep(DELAY_MS);
    }

    saveProgress();
    console.log(`\n  ✓ ${done} players seeded, ${noGames} no games yet, ${skipped} errors`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
(async () => {
    try {
        console.log(`\n🏈 Seeding 2026 season — Budget: ${budget.count}/1000 used (${remaining()} remaining)`);

        let roster = progress.roster ?? [];
        if (!progress.rostersComplete || roster.length === 0) {
            roster = await phase1();
        } else {
            console.log(`\nPhase 1 already complete — ${roster.length} players in cache`);
        }

        await phase2(roster);
        console.log(`\n✓ Done. Budget used today: ${budget.count}/1000\n`);
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        db.close();
    }
})();
