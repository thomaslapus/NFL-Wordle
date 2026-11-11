#!/usr/bin/env node
"use strict";
/**
 * Fetches week 6 game logs for players who have 2026 data in weeks 1-5
 * but are missing week 6. Re-upserts full season totals after each fetch.
 *
 * Hard stop: 800 API calls.
 * Usage: node db/update-week6.js
 */

const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const Database = require("better-sqlite3");

const DB_PATH        = path.join(__dirname, "..", "data", "nfl.db");
const PROGRESS_FILE  = path.join(__dirname, "seed-2026-progress.json");
const API_CALLS_FILE = path.join(__dirname, "..", "data", "api_calls.json");
const SEASON         = 2026;
const HARD_STOP      = 800;

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
try { budget = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8")); } catch {}
if (budget.date !== todayStr()) budget = { date: todayStr(), count: 0 };
function saveBudget() { fs.writeFileSync(API_CALLS_FILE, JSON.stringify(budget, null, 2)); }
function remaining() { return HARD_STOP - budget.count; }

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

// ── Week filter ───────────────────────────────────────────────────────────────
const SEASON_START_MS = new Date("2026-09-09").getTime();
const MS_PER_WEEK     = 7 * 86400 * 1000;
const MAX_WEEK        = 6;

function gameWeek(gameId) {
    const dateStr = gameId.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
    return Math.max(1, Math.floor((new Date(dateStr).getTime() - SEASON_START_MS) / MS_PER_WEEK) + 1);
}

// ── DB statements ─────────────────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

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
        assisted_tackles: n(n(D.totalTackles) - n(D.soloTackles)),
        tackles_for_loss: n(D.tfl),
        passes_defended:  n(D.passDeflections),
        def_interceptions: n(D.defensiveInterceptions),
        forced_fumbles:   n(D.forcedFumbles),
        def_tds:          n(D.defTD),
        sack_yards:       n(D.sackYards ?? D.sackYds),
    };
}

// ── Build target list ─────────────────────────────────────────────────────────
// Players with 2026 logs in weeks 1-5 but no week 6 log
const missingEspnIds = new Set(
    db.prepare(`
        SELECT DISTINCT espn_id FROM game_logs
        WHERE season = 2026 AND week < 6
          AND NOT EXISTS (
            SELECT 1 FROM game_logs g2
            WHERE g2.espn_id = game_logs.espn_id AND g2.season = 2026 AND g2.week = 6
          )
    `).all().map(r => r.espn_id)
);

// Load roster cache to get Tank01 playerIDs
const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
const roster   = progress.roster ?? [];

// Map espnId → roster entry
const rosterByEspnId = new Map();
for (const p of roster) {
    if (p.espnId) rosterByEspnId.set(p.espnId, p);
}

const targets = [...missingEspnIds]
    .map(id => rosterByEspnId.get(id))
    .filter(Boolean);

console.log(`\n🏈 Week 6 update — ${targets.length} players to re-fetch`);
console.log(`   Budget: ${budget.count}/${HARD_STOP} used (${remaining()} remaining)\n`);

// ── Fetch loop ────────────────────────────────────────────────────────────────
(async () => {
    let updated = 0, noWeek6 = 0, errors = 0;

    for (const player of targets) {
        if (remaining() < 2) {
            console.log(`\n⚠ Hard stop reached (${budget.count}/${HARD_STOP}) — ${targets.length - updated - noWeek6 - errors} players remain.`);
            break;
        }

        try {
            const raw       = await tank01Get("/getNFLGamesForPlayer", { playerID: player.playerID, season: String(SEASON) });
            const bodyInner = raw?.body ?? raw;

            const gameEntries = Object.entries(
                (bodyInner && typeof bodyInner === "object" && !Array.isArray(bodyInner)) ? bodyInner : {}
            ).filter(([gid, gdata]) => {
                const dateNum = parseInt(gid.slice(0, 8)) || 0;
                if (dateNum < 20260909 || !gdata || typeof gdata !== "object") return false;
                return gameWeek(gid) <= MAX_WEEK;
            });

            if (!gameEntries.length) { noWeek6++; }
            else {
                // Re-aggregate all weeks 1-6 for accurate season totals
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
            console.warn(`  ⚠ ${player.name}: ${err.message}`);
            errors++;
        }

        if ((updated + noWeek6 + errors) % 50 === 0) {
            process.stdout.write(".");
        }
        await sleep(DELAY_MS);
    }

    console.log(`\n✓ Done.`);
    console.log(`  Updated: ${updated} | No week 6 game: ${noWeek6} | Errors: ${errors}`);
    console.log(`  API calls used today: ${budget.count}/${HARD_STOP}\n`);
    db.close();
})();
