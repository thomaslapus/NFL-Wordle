#!/usr/bin/env node
"use strict";
/**
 * Fetches 2025 team season stats from getNFLTeamSchedule (32 calls).
 * Derives wins, losses, PPG, PAPG from completed game results.
 * Writes into team_season_stats_2025.
 *
 * Usage: node db/seed-2025-team-stats.js
 * Cost:  32 API calls (one per team)
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

const KEY  = process.env.RAPIDAPI_KEY;
const HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

if (!KEY) { console.error("❌ RAPIDAPI_KEY not set"); process.exit(1); }

const DB_PATH        = path.join(__dirname, "..", "data", "nfl.db");
const API_CALLS_FILE = path.join(__dirname, "..", "data", "api_calls.json");

function billingDayStr() {
    const now = new Date();
    const h = now.getUTCHours(), m = now.getUTCMinutes();
    const base = new Date(now);
    if (h < 22 || (h === 22 && m < 54)) base.setUTCDate(base.getUTCDate() - 1);
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth()+1).padStart(2,"0")}-${String(base.getUTCDate()).padStart(2,"0")}`;
}

let budget = { date: "", count: 0 };
try { budget = JSON.parse(fs.readFileSync(API_CALLS_FILE, "utf8")); } catch {}
const today = billingDayStr();
if (budget.date !== today) budget = { date: today, count: 0 };
function saveBudget() { fs.writeFileSync(API_CALLS_FILE, JSON.stringify(budget), "utf8"); }
function charge() {
    budget.count++;
    saveBudget();
    if (budget.count >= 900) { console.error(`Budget hard-stop at ${budget.count}/1000`); process.exit(1); }
}

function tank01Get(endpoint, params = {}) {
    const qs  = new URLSearchParams(params).toString();
    const url = `https://${HOST}${endpoint}${qs ? "?" + qs : ""}`;
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { "x-rapidapi-key": KEY, "x-rapidapi-host": HOST } }, res => {
            let raw = "";
            res.on("data", c => raw += c);
            res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error(`JSON parse: ${raw.slice(0,200)}`)); } });
        });
        req.on("error", reject);
        req.setTimeout(20_000, () => { req.destroy(); reject(new Error("timeout")); });
    });
}

function n(v) { return parseFloat(v) || 0; }
function pickScore(obj, ...keys) {
    for (const k of keys) {
        const v = parseFloat(obj?.[k]);
        if (!isNaN(v)) return v;
    }
    return null;
}

const ALL_TEAMS = [
    "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE",
    "DAL","DEN","DET","GB","HOU","IND","JAX","KC",
    "LAC","LAR","LV","MIA","MIN","NE","NO","NYG",
    "NYJ","PHI","PIT","SEA","SF","TB","TEN","WSH",
];

async function main() {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    const upsert = db.prepare(`
        INSERT INTO team_season_stats_2025 (abbr, won, lost, tied, ppg, papg, ypg, yapg)
        VALUES (@abbr, @won, @lost, @tied, @ppg, @papg, @ypg, @yapg)
        ON CONFLICT(abbr) DO UPDATE SET
            won=excluded.won, lost=excluded.lost, tied=excluded.tied,
            ppg=excluded.ppg, papg=excluded.papg, ypg=excluded.ypg, yapg=excluded.yapg
    `);

    console.log(`\n🏈 Fetching 2025 team season records via getNFLTeamSchedule (32 calls)`);
    console.log(`   Budget before: ${budget.count}/1000\n`);

    // Clear existing data first
    db.prepare("DELETE FROM team_season_stats_2025").run();

    let debugPrinted = false;
    const results = [];

    for (let i = 0; i < ALL_TEAMS.length; i++) {
        const abbr = ALL_TEAMS[i];
        process.stdout.write(`  [${i+1}/32] ${abbr}... `);

        try {
            charge();
            const body = await tank01Get("/getNFLTeamSchedule", { teamAbv: abbr, season: "2025" });

            // Unwrap: Tank01 wraps in {statusCode, body:{...}}
            const bodyInner = body?.body ?? body;

            // Debug first response
            if (!debugPrinted) {
                const teamVal = bodyInner?.[abbr];
                if (teamVal && typeof teamVal === "object") {
                    const schedArr = teamVal?.schedule ?? (Array.isArray(teamVal) ? teamVal : null);
                    if (Array.isArray(schedArr) && schedArr.length) {
                        console.log(`\n  DEBUG schedule[0] keys: ${Object.keys(schedArr[0]).join(", ")}`);
                        console.log(`  DEBUG schedule[0] sample: ${JSON.stringify(schedArr[0]).slice(0, 300)}`);
                    }
                }
                debugPrinted = true;
            }

            // Unwrap schedule array
            const sched =
                bodyInner?.[abbr]?.schedule ??
                (Array.isArray(bodyInner?.[abbr]) ? bodyInner[abbr] : null) ??
                bodyInner?.teamSchedule ??
                bodyInner?.schedule ??
                bodyInner?.games ??
                (Array.isArray(bodyInner) ? bodyInner : null);

            if (!Array.isArray(sched)) {
                console.log(`⚠ no schedule array`);
                continue;
            }

            let won = 0, lost = 0, tied = 0, pf = 0, pa = 0, games = 0;

            for (const g of sched) {
                const statusRaw = (g.gameStatus ?? g.status ?? g.gameState ?? "").toLowerCase();
                const isFinal = statusRaw.includes("final") || statusRaw.includes("complet") || statusRaw.includes("over");
                if (!isFinal) continue;

                // Regular season only — exclude preseason and playoffs
                const week = parseInt(g.week ?? g.gameWeek ?? g.weekNumber ?? 0);
                const seasonType = (g.seasonType ?? g.gameType ?? g.type ?? "").toLowerCase();
                // Normalize date to 8-digit YYYYMMDD integer for comparison
                const gameDate = String(g.gameDate ?? g.date ?? g.gameDateFull ?? "").replace(/\D/g, "").slice(0, 8);
                const dateInt  = gameDate.length === 8 ? parseInt(gameDate) : 0;

                // Preseason: explicit seasonType OR date before Sep 1 2025
                const isPreseason = seasonType.includes("pre") || (dateInt > 0 && dateInt < 20250901);
                // Playoffs: explicit seasonType OR week > 18
                const isPlayoff = seasonType.includes("post") || seasonType.includes("playoff") || week > 18;
                if (isPreseason || isPlayoff) continue;

                // Determine if team was home or away
                const homeAbr = (g.home ?? g.homeTeam ?? g.homeTeamAbv ?? "").toUpperCase();
                const awayAbr = (g.away ?? g.awayTeam ?? g.awayTeamAbv ?? "").toUpperCase();
                const isHome  = homeAbr === abbr;

                const homeScore = pickScore(g, "homeScore", "homePts", "home_score", "homeTeamScore");
                const awayScore = pickScore(g, "awayScore", "awayPts", "away_score", "awayTeamScore");

                if (homeScore === null || awayScore === null) continue;

                const myScore  = isHome ? homeScore : awayScore;
                const oppScore = isHome ? awayScore : homeScore;

                pf += myScore;
                pa += oppScore;
                games++;

                if (myScore > oppScore) won++;
                else if (myScore < oppScore) lost++;
                else tied++;
            }

            const row = {
                abbr,
                won, lost, tied,
                ppg:  games > 0 ? +(pf / games).toFixed(1) : 0,
                papg: games > 0 ? +(pa / games).toFixed(1) : 0,
                ypg:  0,
                yapg: 0,
            };

            upsert.run(row);
            results.push(row);
            console.log(`${won}-${lost}${tied ? `-${tied}` : ""} (${games} games, ${row.ppg} ppg)`);
        } catch (err) {
            console.log(`FAILED: ${err.message}`);
        }

        if (i < ALL_TEAMS.length - 1) await new Promise(r => setTimeout(r, 250));
    }

    console.log(`\n✅ Done — ${results.length} teams written to team_season_stats_2025`);
    console.log(`   Budget after: ${budget.count}/1000`);

    // Sanity check
    const sample = db.prepare("SELECT abbr, won, lost, ppg FROM team_season_stats_2025 ORDER BY won DESC LIMIT 5").all();
    console.log("\n   Top 5 by wins:", JSON.stringify(sample));

    db.close();
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
