#!/usr/bin/env node
"use strict";

const path   = require("path");
const fs     = require("fs");
const Database = require("better-sqlite3");

const ROOT    = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "nfl.db");
const SCHEMA  = path.join(__dirname, "schema.sql");

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(filename) {
    const p = path.join(ROOT, "data", filename);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Tank01 schedule is keyed by YYYYMMDD; we need to figure out week numbers.
// We'll compute week from the game date relative to the season opener.
// 2026 season opener week 1: first game date in the schedule.
function weekFromDate(dateStr, firstGameDate) {
    const d1 = new Date(`${firstGameDate.slice(0,4)}-${firstGameDate.slice(4,6)}-${firstGameDate.slice(6,8)}`);
    const d2 = new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    // Each NFL week starts on Thursday (or Wednesday for some). 7-day buckets from opener.
    return Math.floor(diffDays / 7) + 1;
}

// ── Open DB ───────────────────────────────────────────────────────────────────

console.log(`Opening database at ${DB_PATH}`);
const db = new Database(DB_PATH);

// Apply schema
const schema = fs.readFileSync(SCHEMA, "utf8");
db.exec(schema);
console.log("Schema applied.");

// ── Seed: teams ───────────────────────────────────────────────────────────────

const teamData = readJson("team_stats.json") || readJson("team_stats_2025.json");
if (!teamData) {
    console.error("ERROR: No team stats JSON found in data/. Aborting.");
    process.exit(1);
}

const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (abbr, espn_id, name, conference, division, logo_url)
    VALUES (@abbr, @espn_id, @name, @conference, @division, @logo_url)
`);

const insertTeams = db.transaction((teams) => {
    for (const t of teams) {
        insertTeam.run({
            abbr:       t.abbr,
            espn_id:    parseInt(t.id, 10),
            name:       t.name,
            conference: t.conference,
            division:   t.division,
            logo_url:   t.logo || null,
        });
    }
});

insertTeams(teamData);
console.log(`Seeded ${teamData.length} teams.`);

// ── Seed: team_season_stats_2025 ──────────────────────────────────────────────

const stats2025 = readJson("team_stats_2025.json");
if (stats2025) {
    const insertStat = db.prepare(`
        INSERT OR REPLACE INTO team_season_stats_2025 (abbr, won, lost, ppg, papg, ypg, yapg)
        VALUES (@abbr, @won, @lost, @ppg, @papg, @ypg, @yapg)
    `);

    const insertStats = db.transaction((rows) => {
        for (const t of rows) {
            insertStat.run({
                abbr:   t.abbr,
                won:    t.won   ?? 0,
                lost:   t.lost  ?? 0,
                ppg:    t.ppg   ?? 0,
                papg:   t.papg  ?? 0,
                ypg:    t.ypg   ?? 0,
                yapg:   t.yapg  ?? 0,
            });
        }
    });

    insertStats(stats2025);
    console.log(`Seeded 2025 season stats for ${stats2025.length} teams.`);
} else {
    console.log("team_stats_2025.json not found — skipping 2025 team stats.");
}

// ── Seed: team_season_stats_2026 ──────────────────────────────────────────────

const stats2026 = readJson("team_stats.json");
if (stats2026) {
    const insertStat = db.prepare(`
        INSERT OR REPLACE INTO team_season_stats_2026 (abbr, won, lost, ppg, papg, ypg, yapg)
        VALUES (@abbr, @won, @lost, @ppg, @papg, @ypg, @yapg)
    `);

    const insertStats = db.transaction((rows) => {
        for (const t of rows) {
            insertStat.run({
                abbr:   t.abbr,
                won:    t.won   ?? 0,
                lost:   t.lost  ?? 0,
                ppg:    t.ppg   ?? 0,
                papg:   t.papg  ?? 0,
                ypg:    t.ypg   ?? 0,
                yapg:   t.yapg  ?? 0,
            });
        }
    });

    insertStats(stats2026);
    console.log(`Seeded 2026 (current) season stats for ${stats2026.length} teams.`);
}

// ── Seed: schedules ───────────────────────────────────────────────────────────

const schedule = readJson("schedule_2026.json");
if (schedule) {
    const dates = Object.keys(schedule).sort();
    // First regular-season game date (skip preseason: dates before Sep = preseason)
    const regularDates = dates.filter(d => parseInt(d.slice(4,6), 10) >= 9);
    const firstRegular = regularDates[0];

    const insertGame = db.prepare(`
        INSERT OR IGNORE INTO schedules
            (game_id, season, week, game_date, home_team, away_team, kickoff, channel, status, home_score, away_score)
        VALUES
            (@game_id, @season, @week, @game_date, @home_team, @away_team, @kickoff, @channel, @status, @home_score, @away_score)
    `);

    const insertGames = db.transaction((allDates) => {
        let count = 0;
        for (const dateStr of allDates) {
            const games = schedule[dateStr];
            const week  = weekFromDate(dateStr, firstRegular);
            for (const g of games) {
                insertGame.run({
                    game_id:    g.gameID,
                    season:     2026,
                    week:       week,
                    game_date:  dateStr,
                    home_team:  g.homeTeam,
                    away_team:  g.awayTeam,
                    kickoff:    g.kickoff   || null,
                    channel:    g.channel   || null,
                    status:     g.status    || "upcoming",
                    home_score: g.homeScore ?? null,
                    away_score: g.awayScore ?? null,
                });
                count++;
            }
        }
        return count;
    });

    const gameCount = insertGames(dates);
    console.log(`Seeded ${gameCount} schedule entries (all of 2026 including preseason).`);
} else {
    console.log("schedule_2026.json not found — skipping schedule seed.");
}

// ── Done ─────────────────────────────────────────────────────────────────────

db.close();
console.log("\nDatabase initialized successfully.");
console.log("Tables ready:");
console.log("  teams, team_season_stats_2025, team_season_stats_2026, players, player_team_stints,");
console.log("  game_logs, season_player_totals, schedules, injuries");
console.log("\nNext steps:");
console.log("  - Players/game_logs: populate via /api/admin/cache-season-logs on a non-game day");
console.log("  - Injuries: populate via server.js injury refresh endpoint");
