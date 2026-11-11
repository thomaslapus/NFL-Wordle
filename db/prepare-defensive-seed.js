#!/usr/bin/env node
"use strict";
/**
 * Prepares the seed progress file for a defensive-player re-seed.
 *
 * What it does:
 *   1. Resets rostersComplete → false so the next seed run re-fetches all 32
 *      team rosters (which now include defensive positions).
 *   2. Keeps the existing processed[] array so the 482 already-seeded skill
 *      players are skipped and don't waste API calls.
 *   3. Clears the in-memory roster[] so it gets rebuilt from the fresh API data.
 *   4. Optionally resets the daily API budget counter (pass --reset-budget).
 *
 * After running this script, run:
 *   node db/seed-2025.js
 *
 * The seeder will:
 *   • Phase 1: re-fetch all 32 rosters (32 calls) — now includes DE, LB, CB, etc.
 *   • Phase 2: skip the 482 already-processed TankIDs, fetch only new defensive players
 */

const fs   = require("fs");
const path = require("path");

const PROGRESS_FILE  = path.join(__dirname, "seed-2025-progress.json");
const API_CALLS_FILE = path.join(__dirname, "..", "data", "api_calls.json");
const resetBudget    = process.argv.includes("--reset-budget");

// ── Load current progress ────────────────────────────────────────────────────
let progress = null;
try {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
} catch {
    console.log("No existing progress file — will be created fresh on next seed run.");
}

const prevProcessed = progress?.processed ?? [];
console.log(`\nCurrent progress file state:`);
console.log(`  rostersComplete : ${progress?.rostersComplete ?? "(none)"}`);
console.log(`  roster entries  : ${progress?.roster?.length ?? 0}`);
console.log(`  processed count : ${prevProcessed.length}`);

// ── Write new progress ───────────────────────────────────────────────────────
const newProgress = {
    rostersComplete: false,   // force Phase 1 roster re-fetch
    roster: [],               // cleared — rebuilt from fresh API data
    processed: prevProcessed, // kept — avoids re-fetching existing players
};

fs.writeFileSync(PROGRESS_FILE, JSON.stringify(newProgress, null, 2));
console.log(`\n✓ Progress file reset:`);
console.log(`  rostersComplete → false (rosters will be re-fetched)`);
console.log(`  roster          → [] (will be rebuilt with defensive positions)`);
console.log(`  processed       → ${prevProcessed.length} entries kept (skill players skipped)`);

// ── Optionally reset budget ──────────────────────────────────────────────────
if (resetBudget) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const budget = { date: today, count: 0 };
    fs.writeFileSync(API_CALLS_FILE, JSON.stringify(budget, null, 2));
    console.log(`\n✓ API budget reset to 0 for ${today}`);
} else {
    try {
        const b = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8"));
        console.log(`\nAPI budget: ${b.count} calls used (${b.date}) — pass --reset-budget to zero it`);
    } catch { /* ignore */ }
}

console.log(`\nReady. Run: node db/seed-2025.js`);
console.log(`The seeder will fetch 32 rosters then skip ${prevProcessed.length} already-processed players.\n`);
