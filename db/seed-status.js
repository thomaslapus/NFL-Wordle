#!/usr/bin/env node
"use strict";
/**
 * Prints a comprehensive status of what's been seeded and what's still pending.
 * Optionally writes a JSON report: node db/seed-status.js --json
 */

const fs       = require("fs");
const path     = require("path");
const Database = require("better-sqlite3");

const DB_PATH        = path.join(__dirname, "..", "data", "nfl.db");
const PROGRESS_FILE  = path.join(__dirname, "seed-2025-progress.json");
const API_CALLS_FILE = path.join(__dirname, "..", "data", "api_calls.json");
const WRITE_JSON     = process.argv.includes("--json");
const OUT_FILE       = path.join(__dirname, "seed-status-report.json");

const db = new Database(DB_PATH, { readonly: true });

// ── Budget ───────────────────────────────────────────────────────────────────
let budget = { date: "unknown", count: 0 };
try { budget = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8")); } catch {}

// ── Progress file ─────────────────────────────────────────────────────────────
let progress = null;
try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch {}

const processedSet  = new Set(progress?.processed ?? []);
const rosterInFile  = progress?.roster ?? [];
const rostersComplete = progress?.rostersComplete ?? false;

// ── DB queries ───────────────────────────────────────────────────────────────
const SKILL_POS = ["QB", "RB", "WR", "TE", "FB", "K"];
const DEF_POS   = ["DE", "DT", "NT", "LB", "ILB", "OLB", "MLB", "CB", "S", "FS", "SS", "DB", "EDG"];

function placeholders(arr) { return arr.map(() => "?").join(","); }

const totalPlayers = db.prepare("SELECT COUNT(*) AS c FROM players").get().c;

const byPosition = db.prepare(
    "SELECT position, COUNT(*) AS c FROM players GROUP BY position ORDER BY c DESC"
).all();

const skillPlayers = db.prepare(
    `SELECT COUNT(*) AS c FROM players WHERE position IN (${placeholders(SKILL_POS)})`
).get(...SKILL_POS).c;

const defPlayers = db.prepare(
    `SELECT COUNT(*) AS c FROM players WHERE position IN (${placeholders(DEF_POS)})`
).get(...DEF_POS).c;

const gameLogs2025 = db.prepare("SELECT COUNT(*) AS c FROM game_logs WHERE season=2025").get().c;

const playersWithLogs = db.prepare(
    "SELECT COUNT(DISTINCT espn_id) AS c FROM game_logs WHERE season=2025"
).get().c;

const totalsRows = db.prepare("SELECT COUNT(*) AS c FROM season_player_totals_2025").get().c;

const defStats = db.prepare(
    "SELECT COUNT(*) AS c FROM season_player_totals_2025 WHERE sacks>0 OR solo_tackles>0 OR passes_defended>0 OR def_interceptions>0"
).get().c;

const withDraftYear = db.prepare("SELECT COUNT(*) AS c FROM players WHERE draft_year IS NOT NULL").get().c;
const withDraftRound = db.prepare("SELECT COUNT(*) AS c FROM players WHERE draft_round IS NOT NULL").get().c;

// Players in DB with game logs — by position group
const skillWithLogs = db.prepare(`
    SELECT COUNT(DISTINCT g.espn_id) AS c
    FROM game_logs g
    JOIN players p ON p.espn_id = g.espn_id
    WHERE g.season=2025 AND p.position IN (${placeholders(SKILL_POS)})
`).get(...SKILL_POS).c;

const defWithLogs = db.prepare(`
    SELECT COUNT(DISTINCT g.espn_id) AS c
    FROM game_logs g
    JOIN players p ON p.espn_id = g.espn_id
    WHERE g.season=2025 AND p.position IN (${placeholders(DEF_POS)})
`).get(...DEF_POS).c;

// Top 5 players by position with no game logs (skill)
const skillNoLogs = db.prepare(`
    SELECT p.espn_id, p.name, p.position
    FROM players p
    WHERE p.position IN (${placeholders(SKILL_POS)})
      AND p.espn_id NOT IN (
          SELECT DISTINCT espn_id FROM game_logs WHERE season=2025
      )
    ORDER BY p.position, p.name
    LIMIT 20
`).all(...SKILL_POS);

// Roster in progress file but not yet processed
const pendingInFile = rosterInFile.filter(p => !processedSet.has(p.playerID ?? p.tankId));

// ── Print report ─────────────────────────────────────────────────────────────
const LINE = "─".repeat(56);

console.log(`\n${"═".repeat(56)}`);
console.log(`  NFL 2025 Seed Status Report`);
console.log(`${"═".repeat(56)}`);

console.log(`\n📅 API Budget`);
console.log(`  Date      : ${budget.date}`);
console.log(`  Used today: ${budget.count} / 1000`);
console.log(`  Remaining : ${Math.max(0, 1000 - budget.count)}`);
console.log(`  Resets at : 22:54 UTC daily`);

console.log(`\n${LINE}`);
console.log(`📋 Progress File`);
console.log(`  Rosters fetched : ${rostersComplete ? "✓ complete" : "✗ pending (run seed to re-fetch)"}`);
console.log(`  Roster entries  : ${rosterInFile.length}`);
console.log(`  Processed       : ${processedSet.size}`);
console.log(`  Pending in file : ${pendingInFile.length}`);

console.log(`\n${LINE}`);
console.log(`👤 Players in DB`);
console.log(`  Total           : ${totalPlayers}`);
console.log(`  Skill positions : ${skillPlayers}`);
console.log(`  Defensive pos   : ${defPlayers}  ← ${defPlayers === 0 ? "⚠ none yet (run prepare-defensive-seed.js first)" : "✓"}`);
console.log(`\n  By position:`);
byPosition.forEach(r => {
    const group = DEF_POS.includes(r.position) ? " [DEF]" : SKILL_POS.includes(r.position) ? " [SKL]" : "";
    console.log(`    ${(r.position || "(null)").padEnd(6)}  ${String(r.c).padStart(3)}${group}`);
});

console.log(`\n${LINE}`);
console.log(`📊 Game Logs (2025 season)`);
console.log(`  Total log rows  : ${gameLogs2025}`);
console.log(`  Players w/ logs : ${playersWithLogs}`);
console.log(`    Skill         : ${skillWithLogs} / ${skillPlayers}`);
console.log(`    Defensive     : ${defWithLogs} / ${defPlayers}`);

console.log(`\n${LINE}`);
console.log(`📈 Season Totals`);
console.log(`  Rows in totals  : ${totalsRows}`);
console.log(`  With def stats  : ${defStats}  ← ${defStats === 0 ? "⚠ none yet" : "✓"}`);
console.log(`  With draft year : ${withDraftYear}  ← ${withDraftYear === 0 ? "⚠ none yet" : "✓"}`);
console.log(`  With draft round: ${withDraftRound}`);

if (skillNoLogs.length) {
    console.log(`\n${LINE}`);
    console.log(`⚠  Skill players in DB with no 2025 game logs:`);
    skillNoLogs.forEach(p => console.log(`    [${p.position}] ${p.name} (${p.espn_id})`));
    if (skillNoLogs.length === 20) console.log(`    … (showing first 20)`);
}

console.log(`\n${LINE}`);
console.log(`📝 What's Done vs Pending`);
console.log(`  ✓ Skill player game logs   : ${skillWithLogs}/${skillPlayers} players`);
console.log(`  ✓ Defensive columns exist  : yes (migration run)`);
console.log(`  ✓ Draft columns exist      : yes (migration run)`);
console.log(`  ${defPlayers > 0 ? "✓" : "✗"} Defensive players seeded  : ${defPlayers > 0 ? defPlayers : "0 — pending"}`);
console.log(`  ${defWithLogs > 0 ? "✓" : "✗"} Defensive game logs       : ${defWithLogs > 0 ? defWithLogs + " players" : "pending"}`);
console.log(`  ${withDraftYear > 0 ? "✓" : "✗"} Draft info populated      : ${withDraftYear > 0 ? withDraftYear + " players" : "pending (requires roster re-fetch)"}`);

console.log(`\n  Next steps:`);
if (!rostersComplete || defPlayers === 0) {
    console.log(`    1. node db/prepare-defensive-seed.js --reset-budget  (if budget resets today)`);
    console.log(`       OR: node db/prepare-defensive-seed.js             (keeps existing budget counter)`);
    console.log(`    2. node db/seed-2025.js                              (re-seeds rosters + defensive players)`);
    console.log(`    3. node db/seed-status.js                            (verify results)`);
} else {
    console.log(`    ✓ All steps complete — defensive players are in DB!`);
}

console.log(`\n${"═".repeat(56)}\n`);

// ── Optional JSON output ──────────────────────────────────────────────────────
if (WRITE_JSON) {
    const report = {
        generated: new Date().toISOString(),
        budget: { date: budget.date, used: budget.count, remaining: Math.max(0, 1000 - budget.count) },
        progress: { rostersComplete, rosterCount: rosterInFile.length, processedCount: processedSet.size, pendingInFile: pendingInFile.length },
        players: { total: totalPlayers, skill: skillPlayers, defensive: defPlayers, byPosition },
        gameLogs: { total: gameLogs2025, uniquePlayers: playersWithLogs, skillWithLogs, defWithLogs },
        totals: { rows: totalsRows, withDefStats: defStats, withDraftYear, withDraftRound },
        skillPlayersWithNoLogs: skillNoLogs,
        pendingInProgressFile: pendingInFile.map(p => ({ name: p.name, pos: p.pos, team: p.team })),
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
    console.log(`Report written to ${OUT_FILE}\n`);
}

db.close();
