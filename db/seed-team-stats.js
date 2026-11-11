#!/usr/bin/env node
"use strict";
/**
 * Seeds team_season_stats_2025 and team_season_stats_2026 from Tank01.
 *
 * Uses getNFLTeams (1 call per season) to get wins/losses and stats.
 * Also seeds/updates the teams table with logo, conference, division.
 *
 * Usage:
 *   node db/seed-team-stats.js            -- seeds both 2025 and 2026
 *   node db/seed-team-stats.js --2025     -- seeds 2025 only
 *   node db/seed-team-stats.js --2026     -- seeds 2026 only
 *
 * Budget cost: 1-2 API calls (1 per season)
 */

const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const Database = require("better-sqlite3");

// Load .env if present
try {
    fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n").forEach(line => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
} catch {}

const DB_PATH        = path.join(__dirname, "..", "data", "nfl.db");
const API_CALLS_FILE = path.join(__dirname, "..", "data", "api_calls.json");

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

if (!RAPIDAPI_KEY) { console.error("❌ RAPIDAPI_KEY not set"); process.exit(1); }

const do2025 = process.argv.includes("--2025") || !process.argv.includes("--2026");
const do2026 = process.argv.includes("--2026") || !process.argv.includes("--2025");
const seasons = [];
if (do2025) seasons.push(2025);
if (do2026) seasons.push(2026);

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ── Budget tracking ──────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10).replace(/-/g, ""); }
let budget = { date: todayStr(), count: 0 };
try { budget = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8")); } catch {}
if (budget.date !== todayStr()) { budget = { date: todayStr(), count: 0 }; }

function saveBudget() { fs.writeFileSync(API_CALLS_FILE, JSON.stringify(budget, null, 2)); }

// ── Tank01 request ────────────────────────────────────────────────────────────
async function tank01Get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url   = `https://${RAPIDAPI_HOST}${endpoint}${query ? "?" + query : ""}`;
    budget.count++;
    saveBudget();
    console.log(`  → API call #${budget.count}: ${endpoint} ${JSON.stringify(params)}`);
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: "GET",
            headers: {
                "x-rapidapi-key":  RAPIDAPI_KEY,
                "x-rapidapi-host": RAPIDAPI_HOST,
            },
        }, res => {
            let data = "";
            res.on("data", c => data += c);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(data); }
            });
        });
        req.on("error", reject);
        req.end();
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

function pickNested(obj, ...paths) {
    for (const p of paths) {
        const parts = p.split(".");
        let cur = obj;
        for (const part of parts) { if (cur == null) break; cur = cur[part]; }
        if (cur != null && cur !== "") return +cur || 0;
    }
    return 0;
}

// ── DB prepared statements ────────────────────────────────────────────────────
const upsertTeam = db.prepare(`
    INSERT INTO teams (abbr, name, conference, division, logo_url)
    VALUES (@abbr, @name, @conference, @division, @logo_url)
    ON CONFLICT(abbr) DO UPDATE SET
        name        = excluded.name,
        conference  = excluded.conference,
        division    = excluded.division,
        logo_url    = COALESCE(excluded.logo_url, logo_url)
`);

function makeUpsert(table) {
    return db.prepare(`
        INSERT INTO ${table} (abbr, won, lost, tied, ppg, papg, ypg, yapg)
        VALUES (@abbr, @won, @lost, @tied, @ppg, @papg, @ypg, @yapg)
        ON CONFLICT(abbr) DO UPDATE SET
            won  = excluded.won,
            lost = excluded.lost,
            tied = excluded.tied,
            ppg  = excluded.ppg,
            papg = excluded.papg,
            ypg  = excluded.ypg,
            yapg = excluded.yapg
    `);
}

const upsertTeam2025 = makeUpsert("team_season_stats_2025");
const upsertTeam2026 = makeUpsert("team_season_stats_2026");

// ── Main ──────────────────────────────────────────────────────────────────────
async function seedSeason(season) {
    console.log(`\n📊 Seeding team stats for ${season}...`);
    const body  = await tank01Get("/getNFLTeams", { teamStats: "true", season: String(season) });
    // API wraps response: {statusCode, body:[...]} or {nflTeams:[...]} or bare array
    const teams = body?.nflTeams
        ?? (Array.isArray(body?.body) ? body.body : null)
        ?? (Array.isArray(body) ? body : []);

    if (!teams.length) {
        console.warn(`  ⚠ No teams returned for ${season}. Raw: ${JSON.stringify(body).slice(0, 300)}`);
        return 0;
    }

    console.log(`  Got ${teams.length} teams. Sample keys: ${Object.keys(teams[0]).join(", ")}`);
    console.log(`  First team raw: ${JSON.stringify(teams[0]).slice(0, 400)}`);
    if (teams[0].teamStats) {
        console.log(`  teamStats keys: ${Object.keys(teams[0].teamStats).join(", ")}`);
    }

    let count = 0;
    const upsertBoth = db.transaction(list => {
        for (const t of list) {
            const abbr = (t.teamAbv || "").toUpperCase();
            if (!abbr) continue;

            // Logo
            let logo = "";
            if (Array.isArray(t.logos) && t.logos.length) {
                const l = t.logos[0];
                logo = typeof l === "string" ? l : (l?.src ?? l?.href ?? l?.url ?? "");
            }
            logo = logo || t.espnLogo1 || t.espnLogo ||
                `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

            upsertTeam.run({
                abbr,
                name:       `${t.teamCity ?? ""} ${t.teamName ?? ""}`.trim(),
                conference: t.conference ?? t.conferenceAbv ?? "",
                division:   t.division ?? "",
                logo_url:   logo,
            });

            const wins  = n(t.wins)  || n(t.win);
            const loss  = n(t.loss)  || n(t.losses);
            const tie   = n(t.tie)   || n(t.ties);
            const games = wins + loss + tie || 1;
            const pf    = n(t.pf)    || n(t.pointsFor);
            const pa    = n(t.pa)    || n(t.pointsAgainst);

            const ts  = t.teamStats || {};
            let ypg  = pickNested(ts, "Offense.totalYards","offense.totalYards","totalYards","offYards","offTotalYds");
            let yapg = pickNested(ts, "Defense.totalYards","defense.totalYards","defenseTotalYards","defYards","defTotalYds");
            if (ypg  > 3000) ypg  = +(ypg  / games).toFixed(1);
            if (yapg > 3000) yapg = +(yapg / games).toFixed(1);

            const row = {
                abbr,
                won:  wins,
                lost: loss,
                tied: tie,
                ppg:  games > 0 ? +(pf / games).toFixed(1) : 0,
                papg: games > 0 ? +(pa / games).toFixed(1) : 0,
                ypg,
                yapg,
            };
            if (season === 2025) upsertTeam2025.run(row);
            else if (season === 2026) upsertTeam2026.run(row);
            count++;
        }
    });

    upsertBoth(teams);
    console.log(`  ✓ ${count} teams upserted for ${season}`);
    return count;
}

(async () => {
    try {
        for (const season of seasons) {
            await seedSeason(season);
        }
        console.log(`\n✓ Done. Budget used today: ${budget.count}/1000\n`);
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        db.close();
    }
})();
