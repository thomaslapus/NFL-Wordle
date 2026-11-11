#!/usr/bin/env node
"use strict";
/**
 * Creates the team_game_logs table.
 *
 * team_game_logs tracks one row per team per game — so each game has 2 rows
 * (home team + away team). It stores final scores and team offensive/defensive
 * box-score stats pulled from getNFLBoxScore.
 *
 * Run once:
 *   node db/migrate-team-game-logs.js
 */

const path     = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "nfl.db");
const db      = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS team_game_logs (
    game_id        TEXT    NOT NULL,   -- e.g. "20260907_BUF@MIA" — matches schedules.game_id
    season         INTEGER NOT NULL,
    week           INTEGER NOT NULL,
    game_date      TEXT    NOT NULL,
    team_abbr      TEXT    NOT NULL,   -- this team
    opp_abbr       TEXT    NOT NULL,   -- opponent
    home_away      TEXT    NOT NULL,   -- 'home' or 'away'

    -- Scores
    team_score     INTEGER,
    opp_score      INTEGER,

    -- Outcome derived from scores (computed on insert; NULL until final)
    result         TEXT,               -- 'W', 'L', or 'T'

    -- Offensive team stats
    off_pass_yards INTEGER,
    off_rush_yards INTEGER,
    off_total_yards INTEGER,
    off_pass_tds   INTEGER,
    off_rush_tds   INTEGER,
    off_turnovers  INTEGER,
    off_first_downs INTEGER,
    off_third_conv  INTEGER,           -- 3rd down conversions
    off_third_att   INTEGER,           -- 3rd down attempts
    off_sacks_allowed INTEGER,
    off_penalties   INTEGER,
    off_penalty_yards INTEGER,
    off_time_of_possession TEXT,       -- "MM:SS"

    -- Defensive team stats (from opponent's offense)
    def_pass_yards INTEGER,
    def_rush_yards INTEGER,
    def_total_yards INTEGER,
    def_sacks       INTEGER,
    def_interceptions INTEGER,
    def_fumbles_rec  INTEGER,
    def_tds          INTEGER,

    -- Kicking
    fg_made        INTEGER,
    fg_att         INTEGER,

    PRIMARY KEY (game_id, team_abbr)
);

CREATE INDEX IF NOT EXISTS idx_tgl_season ON team_game_logs(season);
CREATE INDEX IF NOT EXISTS idx_tgl_team   ON team_game_logs(team_abbr, season);
`);

console.log("✓ team_game_logs table created (or already existed)");

// Verify
const cols = db.prepare("PRAGMA table_info(team_game_logs)").all();
console.log(`  Columns: ${cols.map(c => c.name).join(", ")}`);

db.close();
