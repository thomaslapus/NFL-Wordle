#!/usr/bin/env node
"use strict";
/**
 * Fetches weeks 7–9 game logs for players missing that data.
 * Date cutoff: 20261111 (through Week 9, Nov 11 2026).
 * Also rebuilds season_player_totals_2026 and team_season_stats_2026.
 * Hard stop: 900 API calls.
 *
 * Priority:
 *   1. Players with wk1-6 data but NO wk7+ data (~770 players)
 *   2. Players with wk7 but missing wk8/wk9 (~424 players)
 *
 * Usage: node db/update-wk7-wk9.js
 */

const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const Database = require("better-sqlite3");

const DB_PATH        = path.join(__dirname, "..", "data", "nfl.db");
const PROGRESS_FILE  = path.join(__dirname, "seed-2026-progress.json");
const API_CALLS_FILE = path.join(__dirname, "..", "data", "api_calls.json");
const SEASON         = 2026;
const HARD_STOP      = 900;
const MAX_DATE       = 20261111; // through Week 9, Nov 11
const MAX_WEEK       = 9;

// Load .env
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

// ── Budget ────────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10).replace(/-/g, ""); }
let budget = { date: todayStr(), count: 0 };
try {
    const raw = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8"));
    budget = raw.date === todayStr() ? raw : { date: todayStr(), count: 0 };
} catch {}
function saveBudget() { fs.writeFileSync(API_CALLS_FILE, JSON.stringify(budget, null, 2)); }
function remaining() { return HARD_STOP - budget.count; }

// ── API ───────────────────────────────────────────────────────────────────────
const DELAY_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// ── Week helpers ──────────────────────────────────────────────────────────────
const SEASON_START_MS = new Date("2026-09-09").getTime();
const MS_PER_WEEK     = 7 * 86400 * 1000;

function gameWeek(gameId) {
    const dateStr = gameId.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
    return Math.max(1, Math.floor((new Date(dateStr).getTime() - SEASON_START_MS) / MS_PER_WEEK) + 1);
}

// ── DB statements ─────────────────────────────────────────────────────────────
const n = v => parseFloat(v) || 0;

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
        games_played      = excluded.games_played,
        passing_att       = excluded.passing_att,
        passing_cmp       = excluded.passing_cmp,
        passing_yds       = excluded.passing_yds,
        passing_tds       = excluded.passing_tds,
        interceptions     = excluded.interceptions,
        rushing_att       = excluded.rushing_att,
        rushing_yds       = excluded.rushing_yds,
        rushing_tds       = excluded.rushing_tds,
        targets           = excluded.targets,
        receptions        = excluded.receptions,
        receiving_yds     = excluded.receiving_yds,
        receiving_tds     = excluded.receiving_tds,
        fumbles_lost      = excluded.fumbles_lost,
        two_pt_conv       = excluded.two_pt_conv,
        fantasy_pts_std   = excluded.fantasy_pts_std,
        fantasy_pts_ppr   = excluded.fantasy_pts_ppr,
        sacks             = excluded.sacks,
        solo_tackles      = excluded.solo_tackles,
        assisted_tackles  = excluded.assisted_tackles,
        tackles_for_loss  = excluded.tackles_for_loss,
        passes_defended   = excluded.passes_defended,
        def_interceptions = excluded.def_interceptions,
        forced_fumbles    = excluded.forced_fumbles,
        def_tds           = excluded.def_tds,
        sack_yards        = excluded.sack_yards
`);

function parseGameRow(g, gameId, espnId, teamAbbr) {
    const date  = gameId.slice(0, 8);
    const week  = gameWeek(gameId);
    const atPart = (gameId.split("_")[1] ?? "");
    const [awayId, homeId] = atPart.split("@");
    const ha  = (g.teamAbv ?? teamAbbr).toUpperCase() === (homeId ?? "").toUpperCase() ? "home" : "away";
    const opp = ha === "home" ? (awayId ?? "") : (homeId ?? "");
    const P  = g.Passing   ?? {};
    const Ru = g.Rushing   ?? {};
    const Re = g.Receiving ?? {};
    const D  = g.Defense   ?? {};
    const SC = g.snapCounts ?? {};
    return {
        espn_id: espnId, game_id: gameId, season: SEASON, week, game_date: date,
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
        assisted_tackles: Math.max(0, n(D.totalTackles) - n(D.soloTackles)),
        tackles_for_loss: n(D.tfl),
        passes_defended:  n(D.passDeflections),
        def_interceptions: n(D.defensiveInterceptions),
        forced_fumbles:   n(D.forcedFumbles),
        def_tds:          n(D.defTD),
        sack_yards:       n(D.sackYards ?? D.sackYds),
    };
}

// ── Build target list ─────────────────────────────────────────────────────────
// Priority 1: players with 2026 data but NO week 7+ at all
const missingWk7 = new Set(
    db.prepare(`
        SELECT DISTINCT espn_id FROM game_logs WHERE season=2026
        AND espn_id NOT IN (
            SELECT DISTINCT espn_id FROM game_logs WHERE season=2026 AND week >= 7
        )
    `).all().map(r => r.espn_id)
);

// Priority 2: players with week 7 but missing week 8 or 9
const hasWk7NoLater = new Set(
    db.prepare(`
        SELECT DISTINCT espn_id FROM game_logs WHERE season=2026 AND week=7
        AND espn_id NOT IN (
            SELECT DISTINCT espn_id FROM game_logs WHERE season=2026 AND week >= 8
        )
    `).all().map(r => r.espn_id)
);

const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
const roster   = progress.roster ?? [];
const rosterByEspnId = new Map(roster.filter(p => p.espnId).map(p => [p.espnId, p]));

// Build ordered target list: priority 1 first, then priority 2
const targets = [
    ...[...missingWk7].map(id => rosterByEspnId.get(id)).filter(Boolean),
    ...[...hasWk7NoLater].map(id => rosterByEspnId.get(id)).filter(Boolean),
];

console.log(`\n🏈 Weeks 7–9 update (cutoff: ${MAX_DATE})`);
console.log(`   Priority 1 (missing wk7+): ${missingWk7.size} players`);
console.log(`   Priority 2 (have wk7, need wk8-9): ${hasWk7NoLater.size} players`);
console.log(`   Total targets: ${targets.length}`);
console.log(`   Budget: ${budget.count}/${HARD_STOP} used today (${remaining()} remaining)\n`);

// ── Fetch loop ────────────────────────────────────────────────────────────────
(async () => {
    let updated = 0, noNewGames = 0, errors = 0;

    for (const player of targets) {
        if (remaining() < 2) {
            const left = targets.length - updated - noNewGames - errors;
            console.log(`\n⚠  Hard stop (${budget.count}/${HARD_STOP}) — ${left} players remain.`);
            break;
        }

        try {
            const raw = await tank01Get("/getNFLGamesForPlayer", {
                playerID: player.playerID,
                season:   String(SEASON),
            });
            const body = raw?.body ?? raw;

            const gameEntries = Object.entries(
                (body && typeof body === "object" && !Array.isArray(body)) ? body : {}
            ).filter(([gid, gdata]) => {
                const dateNum = parseInt(gid.slice(0, 8)) || 0;
                if (dateNum < 20260909 || dateNum > MAX_DATE) return false;
                if (!gdata || typeof gdata !== "object") return false;
                return gameWeek(gid) <= MAX_WEEK;
            });

            if (!gameEntries.length) {
                noNewGames++;
            } else {
                const tot = {
                    espn_id: player.espnId, team_abbr: player.team, games_played: 0,
                    passing_att:0, passing_cmp:0, passing_yds:0, passing_tds:0, interceptions:0,
                    rushing_att:0, rushing_yds:0, rushing_tds:0,
                    targets:0, receptions:0, receiving_yds:0, receiving_tds:0,
                    fumbles_lost:0, two_pt_conv:0, fantasy_pts_std:0, fantasy_pts_ppr:0,
                    sacks:0, solo_tackles:0, assisted_tackles:0, tackles_for_loss:0,
                    passes_defended:0, def_interceptions:0, forced_fumbles:0, def_tds:0, sack_yards:0,
                };
                db.transaction(entries => {
                    for (const [gid, gdata] of entries) {
                        const row = parseGameRow(gdata, gid, player.espnId, player.team);
                        insertLog.run(row);
                        tot.games_played++;
                        for (const k of Object.keys(tot)) {
                            if (k in row && typeof tot[k] === "number") tot[k] += row[k] || 0;
                        }
                    }
                })(gameEntries);
                if (player.espnId) upsertTotals.run(tot);
                updated++;
            }
        } catch (err) {
            console.warn(`  ⚠ ${player.name ?? player.playerID}: ${err.message}`);
            errors++;
        }

        const done = updated + noNewGames + errors;
        if (done % 50 === 0) process.stdout.write(`  [${done}/${targets.length}] ${updated} updated, ${budget.count} calls used\n`);
        await sleep(DELAY_MS);
    }

    console.log(`\n✓ Done.`);
    console.log(`  Updated: ${updated} | No new games: ${noNewGames} | Errors: ${errors}`);
    console.log(`  API calls used today: ${budget.count}/${HARD_STOP}\n`);

    // ── Rebuild team_season_stats_2026 from schedules scores ─────────────────
    console.log("Rebuilding team_season_stats_2026 from schedule scores…");
    const upsertTeamStat = db.prepare(`
        INSERT OR REPLACE INTO team_season_stats_2026 (abbr, won, lost, tied, ppg, papg)
        VALUES (@abbr, @won, @lost, @tied, @ppg, @papg)
    `);
    const schedGames = db.prepare(`
        SELECT home_team, away_team, home_score, away_score
        FROM schedules
        WHERE season=2026 AND week>=1 AND week<=9
          AND home_score IS NOT NULL AND away_score IS NOT NULL
          AND CAST(home_team AS TEXT) != '' AND CAST(away_team AS TEXT) != ''
    `).all();

    if (schedGames.length > 0) {
        const stats = {};
        for (const g of schedGames) {
            for (const [abbr, ts, os] of [[g.home_team, +g.home_score, +g.away_score], [g.away_team, +g.away_score, +g.home_score]]) {
                if (!abbr) continue;
                if (!stats[abbr]) stats[abbr] = { won:0, lost:0, tied:0, pfSum:0, paSum:0, gp:0 };
                const s = stats[abbr];
                s.gp++;
                s.pfSum += ts; s.paSum += os;
                if (ts > os) s.won++; else if (ts < os) s.lost++; else s.tied++;
            }
        }
        db.transaction(entries => {
            for (const [abbr, s] of Object.entries(entries)) {
                upsertTeamStat.run({
                    abbr, won: s.won, lost: s.lost, tied: s.tied,
                    ppg:  +(s.pfSum / s.gp).toFixed(2),
                    papg: +(s.paSum / s.gp).toFixed(2),
                });
            }
        })(stats);
        console.log(`  Updated team stats for ${Object.keys(stats).length} teams from ${schedGames.length} schedule rows`);
    } else {
        console.log("  No scored schedule rows found — team stats unchanged");
    }

    // ── Final coverage check ──────────────────────────────────────────────────
    const wkCheck = db.prepare('SELECT week, COUNT(DISTINCT espn_id) as p FROM game_logs WHERE season=2026 AND week>0 GROUP BY week ORDER BY week').all();
    console.log("\nWeek coverage after update:");
    wkCheck.forEach(r => console.log(`  Week ${r.week}: ${r.p} players`));
    db.close();
})();
