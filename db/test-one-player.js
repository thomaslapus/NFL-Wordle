#!/usr/bin/env node
"use strict";
// Tests the full write pipeline for one player. Costs 1 API call.
// Usage: RAPIDAPI_KEY=your_key node db/test-one-player.js

const path     = require("path");
const fs       = require("fs");
const Database = require("better-sqlite3");

const ROOT    = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "nfl.db");
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";
const SEASON  = 2025;
const TANK01_TO_DB_ABBR = { WAS: "WSH" };
const normalizeAbbr = a => TANK01_TO_DB_ABBR[a] ?? a;
const n = v => parseFloat(v) || 0;

if (!RAPIDAPI_KEY) { console.error("Set RAPIDAPI_KEY"); process.exit(1); }

// Use Jacoby Brissett — confirmed working from diagnostic
const player = { tankId: "2578570", espnId: "2578570", name: "Jacoby Brissett", pos: "QB", team: "ARI" };

(async () => {
    // ── 1. Check player is in DB ──────────────────────────────────────────────
    const db = new Database(DB_PATH);
    db.pragma("foreign_keys = ON");

    const existing = db.prepare("SELECT * FROM players WHERE espn_id = ?").get(player.espnId);
    console.log("Player in DB:", existing ? `YES (${existing.name})` : "NO — will insert");

    if (!existing) {
        db.prepare("INSERT OR IGNORE INTO players (espn_id, name, position) VALUES (?, ?, ?)")
          .run(player.espnId, player.name, player.pos);
        console.log("Inserted player.");
    }

    // ── 2. Fetch game logs ────────────────────────────────────────────────────
    console.log("\nFetching game logs...");
    const url = `https://${RAPIDAPI_HOST}/getNFLGamesForPlayer?playerID=${player.tankId}&season=${SEASON}`;
    const res = await fetch(url, {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST },
    });
    const json = await res.json();
    const body = json.body ?? json;

    console.log("body type:", typeof body, Array.isArray(body) ? "(array)" : "");
    if (typeof body === "object" && !Array.isArray(body)) {
        console.log("body keys:", Object.keys(body).slice(0, 5).join(", "), "...");
    }

    const gameEntries = Object.entries(body).filter(([k]) => /^\d{8}_/.test(k));
    console.log("game entries found:", gameEntries.length);
    if (!gameEntries.length) { console.error("No games — check body above."); db.close(); return; }

    // ── 3. Try inserting ONE game log, step by step ───────────────────────────
    const [gameId, g] = gameEntries[0];
    console.log("\n--- First game ---");
    console.log("gameId:", gameId);
    console.log("g.teamAbv:", g.teamAbv, "g.team:", g.team);
    console.log("Passing keys:", Object.keys(g.Passing || {}));
    console.log("Rushing keys:", Object.keys(g.Rushing || {}));
    console.log("Receiving keys:", Object.keys(g.Receiving || {}));
    console.log("snapCounts keys:", Object.keys(g.snapCounts || {}));

    const gameDate = gameId.slice(0, 8);
    const matchPart = gameId.slice(9);
    const atIdx = matchPart.indexOf("@");
    const awayRaw = matchPart.slice(0, atIdx);
    const homeRaw = matchPart.slice(atIdx + 1);
    const teamAbv  = normalizeAbbr(g.teamAbv || player.team);
    const homeAway = teamAbv === normalizeAbbr(homeRaw) ? "home" : "away";
    const oppAbv   = teamAbv === normalizeAbbr(homeRaw) ? normalizeAbbr(awayRaw) : normalizeAbbr(homeRaw);

    const SEASON_START = new Date("2025-09-04");
    const gd = new Date(`${gameDate.slice(0,4)}-${gameDate.slice(4,6)}-${gameDate.slice(6,8)}`);
    const week = Math.max(0, Math.floor(Math.round((gd - SEASON_START) / 86_400_000) / 7) + 1);

    const P = g.Passing || {};
    const R = g.Rushing || {};
    const C = g.Receiving || {};
    const D = g.Defense || {};
    const S = g.snapCounts || {};

    const row = {
        espn_id: player.espnId, game_id: gameId, season: SEASON,
        week, game_date: gameDate, team_abbr: teamAbv, opp_abbr: oppAbv, home_away: homeAway,
        passing_att: n(P.passAttempts), passing_cmp: n(P.passCompletions),
        passing_yds: n(P.passYds), passing_tds: n(P.passTD), interceptions: n(P.int),
        rushing_att: n(R.carries), rushing_yds: n(R.rushYds), rushing_tds: n(R.rushTD),
        targets: n(C.targets ?? C.tgts), receptions: n(C.receptions ?? C.rec),
        receiving_yds: n(C.recYds), receiving_tds: n(C.recTD),
        fumbles_lost: n(D.fumblesLost), two_pt_conv: 0,
        fantasy_pts_std: n(g.fantasyPoints ?? g.fantasyPts),
        fantasy_pts_ppr: n(g.fantasyPointsPPR ?? g.fantasyPtsPPR),
        snap_count: n(S.offSnap) || null, snap_pct: n(S.offSnapPct) || null,
    };

    console.log("\nRow to insert:", JSON.stringify(row, null, 2));

    // ── 4. Insert and verify ──────────────────────────────────────────────────
    console.log("\nAttempting INSERT...");
    try {
        db.prepare(`
            INSERT OR REPLACE INTO game_logs
                (espn_id, game_id, season, week, game_date, team_abbr, opp_abbr, home_away,
                 passing_att, passing_cmp, passing_yds, passing_tds, interceptions,
                 rushing_att, rushing_yds, rushing_tds,
                 targets, receptions, receiving_yds, receiving_tds,
                 fumbles_lost, two_pt_conv, fantasy_pts_std, fantasy_pts_ppr, snap_count, snap_pct)
            VALUES
                (@espn_id, @game_id, @season, @week, @game_date, @team_abbr, @opp_abbr, @home_away,
                 @passing_att, @passing_cmp, @passing_yds, @passing_tds, @interceptions,
                 @rushing_att, @rushing_yds, @rushing_tds,
                 @targets, @receptions, @receiving_yds, @receiving_tds,
                 @fumbles_lost, @two_pt_conv, @fantasy_pts_std, @fantasy_pts_ppr, @snap_count, @snap_pct)
        `).run(row);
        console.log("INSERT succeeded!");
    } catch (err) {
        console.error("INSERT FAILED:", err.message);
    }

    const count = db.prepare("SELECT COUNT(*) as c FROM game_logs").get().c;
    console.log("game_logs count after insert:", count);

    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
})().catch(console.error);
