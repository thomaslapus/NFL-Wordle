#!/usr/bin/env node
"use strict";
/**
 * Seeds team_game_logs from the schedules table + Tank01 getNFLBoxScore.
 *
 * For each completed game in the schedules table, fetches the box score
 * (or uses cached boxscore_stats_{gameID}.json) and inserts 2 rows into
 * team_game_logs — one for each team.
 *
 * Usage:
 *   node db/seed-team-game-logs.js             -- all final games
 *   node db/seed-team-game-logs.js --season 2025 -- specific season
 *   node db/seed-team-game-logs.js --dry-run   -- print games without inserting
 *
 * Budget cost: 1 call per game not yet disk-cached (max ~300 for a full season).
 */

const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const Database = require("better-sqlite3");

const DB_PATH        = path.join(__dirname, "..", "data", "nfl.db");
const DATA_DIR       = path.join(__dirname, "..", "data");
const API_CALLS_FILE = path.join(DATA_DIR, "api_calls.json");

// Load .env if present
try {
    fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n").forEach(line => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
} catch {}

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

const DRY_RUN = process.argv.includes("--dry-run");
const SEASON  = parseInt(process.argv[process.argv.indexOf("--season") + 1]) || 0;

// ── Budget ────────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10).replace(/-/g, ""); }
let budget = { date: todayStr(), count: 0 };
try { budget = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8")); } catch {}
if (budget.date !== todayStr()) { budget = { date: todayStr(), count: 0 }; }
function saveBudget() { if (!DRY_RUN) fs.writeFileSync(API_CALLS_FILE, JSON.stringify(budget, null, 2)); }
function remaining() { return 1000 - budget.count; }

// ── Tank01 ────────────────────────────────────────────────────────────────────
const DELAY_MS = 500;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tank01Get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url   = `https://${RAPIDAPI_HOST}${endpoint}${query ? "?" + query : ""}`;
    budget.count++;
    saveBudget();
    console.log(`  → API call #${budget.count}: ${endpoint} ${JSON.stringify(params)}`);
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

// ── DB ────────────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const insertRow = db.prepare(`
    INSERT OR REPLACE INTO team_game_logs (
        game_id, season, week, game_date, team_abbr, opp_abbr, home_away,
        team_score, opp_score, result,
        off_pass_yards, off_rush_yards, off_total_yards,
        off_pass_tds, off_rush_tds, off_turnovers,
        off_first_downs, off_third_conv, off_third_att,
        off_sacks_allowed, off_penalties, off_penalty_yards, off_time_of_possession,
        def_pass_yards, def_rush_yards, def_total_yards,
        def_sacks, def_interceptions, def_fumbles_rec, def_tds,
        fg_made, fg_att
    ) VALUES (
        @game_id, @season, @week, @game_date, @team_abbr, @opp_abbr, @home_away,
        @team_score, @opp_score, @result,
        @off_pass_yards, @off_rush_yards, @off_total_yards,
        @off_pass_tds, @off_rush_tds, @off_turnovers,
        @off_first_downs, @off_third_conv, @off_third_att,
        @off_sacks_allowed, @off_penalties, @off_penalty_yards, @off_time_of_possession,
        @def_pass_yards, @def_rush_yards, @def_total_yards,
        @def_sacks, @def_interceptions, @def_fumbles_rec, @def_tds,
        @fg_made, @fg_att
    )
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

function pickTeamStat(ts, ...keys) {
    for (const k of keys) {
        if (ts?.[k] != null) return n(ts[k]);
    }
    return null;
}

function parseTeamStats(rawTs) {
    if (!rawTs || typeof rawTs !== "object") return {};
    return {
        pass_yards:  pickTeamStat(rawTs, "passingYards","passYards","passYds","passingYds"),
        rush_yards:  pickTeamStat(rawTs, "rushingYards","rushYards","rushYds"),
        total_yards: pickTeamStat(rawTs, "totalYards","totYds"),
        pass_tds:    pickTeamStat(rawTs, "passTDs","passTouchdowns","passTD"),
        rush_tds:    pickTeamStat(rawTs, "rushTDs","rushTouchdowns","rushTD"),
        turnovers:   pickTeamStat(rawTs, "turnovers","to","TO"),
        first_downs: pickTeamStat(rawTs, "firstDowns","1stDowns"),
        third_conv:  pickTeamStat(rawTs, "thirdDownConversions","thirdDownConv","3rdDownConv"),
        third_att:   pickTeamStat(rawTs, "thirdDownAttempts","thirdDownAtt","3rdDownAtt"),
        sacks_allowed: pickTeamStat(rawTs, "sacksAllowed","sacks","timeSacked"),
        penalties:   pickTeamStat(rawTs, "penalties"),
        penalty_yards: pickTeamStat(rawTs, "penaltyYards","penYards"),
        time_of_pos: rawTs.timeOfPossession ?? rawTs.TOP ?? null,
        def_sacks:   pickTeamStat(rawTs, "defenseSacks","defSacks"),
        def_ints:    pickTeamStat(rawTs, "defInterceptions","defInt","interceptions"),
        def_fum:     pickTeamStat(rawTs, "defenseFumblesRec","defFumbles","fumbleRecoveries"),
        def_tds:     pickTeamStat(rawTs, "defensiveTDs","defTDs","defTouchdowns"),
        fg_made:     pickTeamStat(rawTs, "fgMade","fieldGoalsMade","fieldGoals"),
        fg_att:      pickTeamStat(rawTs, "fgAttempts","fieldGoalAttempts"),
    };
}

function buildRow(gameId, season, week, date, teamAbbr, oppAbbr, homeAway, teamScore, oppScore, ts, defTs) {
    const result = teamScore == null || oppScore == null ? null
        : teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T";
    const off = parseTeamStats(ts);
    const def = parseTeamStats(defTs);

    return {
        game_id: gameId, season, week, game_date: date,
        team_abbr: teamAbbr, opp_abbr: oppAbbr, home_away: homeAway,
        team_score: teamScore, opp_score: oppScore, result,
        off_pass_yards: off.pass_yards, off_rush_yards: off.rush_yards, off_total_yards: off.total_yards,
        off_pass_tds: off.pass_tds, off_rush_tds: off.rush_tds, off_turnovers: off.turnovers,
        off_first_downs: off.first_downs, off_third_conv: off.third_conv, off_third_att: off.third_att,
        off_sacks_allowed: off.sacks_allowed, off_penalties: off.penalties, off_penalty_yards: off.penalty_yards,
        off_time_of_possession: off.time_of_pos,
        def_pass_yards: def.pass_yards, def_rush_yards: def.rush_yards, def_total_yards: def.total_yards,
        def_sacks: off.def_sacks ?? def.def_sacks, def_interceptions: off.def_ints ?? def.def_ints,
        def_fumbles_rec: off.def_fum ?? def.def_fum, def_tds: off.def_tds ?? def.def_tds,
        fg_made: off.fg_made, fg_att: off.fg_att,
    };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    const whereClause = SEASON
        ? "WHERE status = 'final' AND season = ?"
        : "WHERE status = 'final'";
    const games = SEASON
        ? db.prepare(`SELECT * FROM schedules ${whereClause} ORDER BY season, week, game_date`).all(SEASON)
        : db.prepare(`SELECT * FROM schedules ${whereClause} ORDER BY season, week, game_date`).all();

    console.log(`\n🏈 Found ${games.length} final games to process${SEASON ? ` (${SEASON} season)` : ""}`);
    if (DRY_RUN) console.log("  (dry-run mode — no DB writes)");
    if (!RAPIDAPI_KEY && games.length > 0) {
        console.log("  ⚠ RAPIDAPI_KEY not set — will only use disk-cached boxscores");
    }

    // Check how many already in team_game_logs
    const existing = db.prepare("SELECT COUNT(*) AS c FROM team_game_logs").get().c;
    console.log(`  Existing rows in team_game_logs: ${existing}`);

    let inserted = 0, cached = 0, apiCalled = 0, skipped = 0;

    for (const game of games) {
        const gameId = game.game_id;
        const season = game.season;
        const week   = game.week;
        const date   = game.game_date;

        // Check disk cache for boxscore_stats
        const cacheFile = path.join(DATA_DIR, `boxscore_stats_${gameId}.json`);
        let bsData = null;
        try { bsData = JSON.parse(fs.readFileSync(cacheFile, "utf8")); cached++; }
        catch { cached--; }

        if (!bsData) {
            // Try plain boxscore cache
            const bsFile = path.join(DATA_DIR, `boxscore_${gameId}.json`);
            try { bsData = JSON.parse(fs.readFileSync(bsFile, "utf8")); }
            catch {}
        }

        if (!bsData && RAPIDAPI_KEY && remaining() > 2) {
            try {
                const raw = await tank01Get("/getNFLBoxScore", { gameID: gameId, playByPlay: "false" });
                const info = raw?.gameInfo ?? raw?.game ?? raw ?? {};
                bsData = {
                    away: (info.awayTeam ?? info.away ?? game.away_team ?? "").toUpperCase(),
                    home: (info.homeTeam ?? info.home ?? game.home_team ?? "").toUpperCase(),
                    awayScore: parseFloat(info.awayScore ?? info.awayPts ?? game.away_score) || null,
                    homeScore: parseFloat(info.homeScore ?? info.homePts ?? game.home_score) || null,
                    teamStats: raw?.teamStats ?? raw?.TeamStats ?? {},
                };
                // Write disk cache
                if (!DRY_RUN) fs.writeFileSync(cacheFile, JSON.stringify(bsData));
                apiCalled++;
                await sleep(DELAY_MS);
            } catch (err) {
                console.warn(`  ⚠ BoxScore ${gameId}: ${err.message}`);
                skipped++;
                continue;
            }
        }

        if (!bsData) {
            // Insert with just scores from schedules table if we have them
            if (game.home_score == null && game.away_score == null) { skipped++; continue; }
            bsData = {
                away: game.away_team, home: game.home_team,
                awayScore: game.away_score, homeScore: game.home_score,
                teamStats: {},
            };
        }

        const awayAbbr = (bsData.away ?? game.away_team ?? "").toUpperCase();
        const homeAbbr = (bsData.home ?? game.home_team ?? "").toUpperCase();
        const awayScore = bsData.awayScore ?? game.away_score;
        const homeScore = bsData.homeScore ?? game.home_score;

        const ts = bsData.teamStats ?? {};
        const awayTs = ts[awayAbbr] ?? ts[awayAbbr?.toLowerCase()] ?? {};
        const homeTs = ts[homeAbbr] ?? ts[homeAbbr?.toLowerCase()] ?? {};

        const awayRow = buildRow(gameId, season, week, date, awayAbbr, homeAbbr, "away", awayScore, homeScore, awayTs, homeTs);
        const homeRow = buildRow(gameId, season, week, date, homeAbbr, awayAbbr, "home", homeScore, awayScore, homeTs, awayTs);

        if (DRY_RUN) {
            console.log(`  [dry] ${gameId} — ${awayAbbr}@${homeAbbr}: ${awayScore}-${homeScore}`);
        } else {
            db.transaction(() => { insertRow.run(awayRow); insertRow.run(homeRow); })();
        }
        inserted += 2;
    }

    console.log(`\n✓ Done: ${inserted} rows inserted, ${apiCalled} API calls, ${skipped} skipped`);
    console.log(`  Budget used today: ${budget.count}/1000\n`);
    db.close();
})();
