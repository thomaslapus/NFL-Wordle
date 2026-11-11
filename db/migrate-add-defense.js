#!/usr/bin/env node
"use strict";
/**
 * DB migration: adds defensive stat columns + draft info to players.
 * Safe to re-run — duplicate column errors are silently skipped.
 * Usage: node db/migrate-add-defense.js
 */
const path     = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "nfl.db");
const db = new Database(DB_PATH);

const migrations = [
    // game_logs — defensive stats (all default 0 so existing rows are unaffected)
    "ALTER TABLE game_logs ADD COLUMN sacks              REAL    DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN solo_tackles       INTEGER DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN assisted_tackles   INTEGER DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN tackles_for_loss   REAL    DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN passes_defended    INTEGER DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN def_interceptions  INTEGER DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN forced_fumbles     INTEGER DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN def_tds            INTEGER DEFAULT 0",
    "ALTER TABLE game_logs ADD COLUMN sack_yards         REAL    DEFAULT 0",
    // season_player_totals_2025 — defensive totals
    "ALTER TABLE season_player_totals_2025 ADD COLUMN sacks             REAL    DEFAULT 0",
    "ALTER TABLE season_player_totals_2025 ADD COLUMN solo_tackles      INTEGER DEFAULT 0",
    "ALTER TABLE season_player_totals_2025 ADD COLUMN assisted_tackles  INTEGER DEFAULT 0",
    "ALTER TABLE season_player_totals_2025 ADD COLUMN tackles_for_loss  REAL    DEFAULT 0",
    "ALTER TABLE season_player_totals_2025 ADD COLUMN passes_defended   INTEGER DEFAULT 0",
    "ALTER TABLE season_player_totals_2025 ADD COLUMN def_interceptions INTEGER DEFAULT 0",
    "ALTER TABLE season_player_totals_2025 ADD COLUMN forced_fumbles    INTEGER DEFAULT 0",
    "ALTER TABLE season_player_totals_2025 ADD COLUMN def_tds           INTEGER DEFAULT 0",
    // players — draft info (for Rookie tab)
    "ALTER TABLE players ADD COLUMN draft_year  INTEGER",
    "ALTER TABLE players ADD COLUMN draft_round INTEGER",
    "ALTER TABLE players ADD COLUMN draft_pick  INTEGER",  // overall pick number
];

let applied = 0, skipped = 0;
for (const sql of migrations) {
    try {
        db.exec(sql);
        applied++;
        console.log("  ✓", sql.replace("ALTER TABLE ", "").slice(0, 70));
    } catch (err) {
        if (err.message.includes("duplicate column name")) {
            skipped++;
        } else {
            console.warn("  WARN:", err.message, "—", sql.slice(0, 60));
        }
    }
}

console.log(`\nDone. Applied: ${applied}  Skipped (already exists): ${skipped}`);
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
