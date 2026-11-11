#!/usr/bin/env node
/**
 * db/refresh-2026-stats.js
 *
 * Fetches current 2026 season player and team stats from Tank01 and:
 *   - Writes data/player_stats.json
 *   - Writes data/team_stats.json
 *   - Updates team_season_stats_2026 table in data/nfl.db
 *
 * Usage:
 *   RAPIDAPI_KEY=<key> node db/refresh-2026-stats.js
 *
 * Cost: 1 call (getNFLTeams) + 32 calls (getNFLTeamRoster × 32 teams) = 33 calls
 */

"use strict";

const fs      = require("fs");
const path    = require("path");
const https   = require("https");
const Database = require("better-sqlite3");

const ROOT     = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH  = path.join(DATA_DIR, "nfl.db");

// Load .env if present
try {
    fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n").forEach(line => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
} catch {}

const KEY = process.env.RAPIDAPI_KEY;

if (!KEY) {
    console.error("ERROR: RAPIDAPI_KEY env var not set.");
    process.exit(1);
}

// ── API call budget ────────────────────────────────────────────────────────────
function billingDayStr() {
    const now = new Date();
    const h = now.getUTCHours(), m = now.getUTCMinutes();
    const base = new Date(now);
    if (h < 22 || (h === 22 && m < 54)) base.setUTCDate(base.getUTCDate() - 1);
    const y  = base.getUTCFullYear();
    const mo = String(base.getUTCMonth() + 1).padStart(2, "0");
    const d  = String(base.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
}

const budgetFile = path.join(DATA_DIR, "api_calls.json");
let budget = { date: "", count: 0 };
try { budget = JSON.parse(fs.readFileSync(budgetFile, "utf8")); } catch {}
const today = billingDayStr();
if (budget.date !== today) budget = { date: today, count: 0 };

function saveBudget() {
    fs.writeFileSync(budgetFile, JSON.stringify(budget), "utf8");
}

function charge() {
    budget.count++;
    saveBudget();
    if (budget.count >= 900) {
        console.error(`WARNING: API hard-stop threshold reached (${budget.count}/1000). Stopping.`);
        process.exit(1);
    }
}

// ── Tank01 HTTP helper ─────────────────────────────────────────────────────────
function tank01Get(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com${endpoint}${qs ? "?" + qs : ""}`;
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                "x-rapidapi-key":  KEY,
                "x-rapidapi-host": "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com",
            },
        }, res => {
            let raw = "";
            res.on("data", c => raw += c);
            res.on("end", () => {
                try { resolve(JSON.parse(raw)); }
                catch { reject(new Error(`JSON parse error: ${raw.slice(0, 200)}`)); }
            });
        });
        req.on("error", reject);
        req.setTimeout(20_000, () => { req.destroy(); reject(new Error("timeout")); });
    });
}

// ── Field picker ──────────────────────────────────────────────────────────────
function pick(obj, ...keys) {
    for (const k of keys) {
        const v = parseFloat(obj?.[k]);
        if (!isNaN(v) && v !== 0) return v;
    }
    return 0;
}

function simplifyPos(pos = "") {
    if (["DE","DT","NT"].includes(pos)) return "DL";
    if (["CB","S","FS","SS"].includes(pos)) return "DB";
    if (["OT","OG","C","G","T"].includes(pos)) return "OL";
    if (["ILB","OLB","MLB"].includes(pos)) return "LB";
    return pos;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const KEEP = new Set(["QB","RB","WR","TE","K","FB"]);
    const db   = new Database(DB_PATH);

    // ── Step 1: Team stats ─────────────────────────────────────────────────────
    console.log(`[1/2] Fetching 2026 team stats (1 API call)...`);
    console.log(`      Budget before: ${budget.count}/1000`);
    charge();

    const teamsBody = await tank01Get("/getNFLTeams", {
        teamStats: "true",
        topPerformers: "true",
        season: "2026",
    });

    // API wraps response in {statusCode, body:[...]} or returns {nflTeams:[...]} or a bare array
    const rawTeams = teamsBody?.nflTeams
        ?? (Array.isArray(teamsBody?.body) ? teamsBody.body : null)
        ?? (Array.isArray(teamsBody) ? teamsBody : []);
    if (!rawTeams.length) {
        console.error("ERROR: getNFLTeams returned no teams. Response:", JSON.stringify(teamsBody).slice(0, 400));
        process.exit(1);
    }
    console.log(`      Got ${rawTeams.length} teams. Keys: ${Object.keys(rawTeams[0]).join(", ")}`);
    if (rawTeams[0]?.teamStats) {
        console.log(`      teamStats keys: ${Object.keys(rawTeams[0].teamStats).join(", ")}`);
    }
    // Print first team in full for field inspection
    console.log(`      First team raw: ${JSON.stringify(rawTeams[0]).slice(0, 500)}`);

    const teamStats = rawTeams.map(t => {
        const wins  = parseInt(t.wins ?? t.win ?? t.teamWins ?? 0) || 0;
        const loss  = parseInt(t.loss ?? t.teamLoss ?? t.losses ?? 0) || 0;
        const tie   = parseInt(t.tie  ?? t.ties ?? 0) || 0;
        const games = wins + loss + tie || 1;
        const pf    = parseFloat(t.pf)  || 0;
        const pa    = parseFloat(t.pa)  || 0;

        let logo = "";
        if (Array.isArray(t.logos) && t.logos.length) {
            const l = t.logos[0];
            logo = typeof l === "string" ? l : (l?.src ?? l?.href ?? l?.url ?? "");
        }
        logo = logo || t.espnLogo1 || t.espnLogo ||
               `https://a.espncdn.com/i/teamlogos/nfl/500/${(t.teamAbv||"").toLowerCase()}.png`;

        let ypg = 0, yapg = 0;
        const ts = t.teamStats;
        if (ts) {
            ypg  = pick(ts, "Offense.totalYards", "offense.totalYards", "totalYards", "offYards", "offTotalYds");
            yapg = pick(ts, "Defense.totalYards", "defense.totalYards", "defenseTotalYards", "defYards");
            if (ypg  > 3_000) ypg  = +(ypg  / games).toFixed(1);
            if (yapg > 3_000) yapg = +(yapg / games).toFixed(1);
        }

        const abbr = (t.teamAbv ?? "").toUpperCase();
        return {
            id:         t.teamID ?? t.teamAbv,
            name:       `${t.teamCity ?? ""} ${t.teamName ?? ""}`.trim(),
            abbr,
            logo,
            conference: t.conference ?? t.conferenceAbv ?? "",
            division:   t.division   ?? "",
            won: wins, lost: loss, tied: tie,
            ppg:  games > 0 ? +(pf / games).toFixed(1) : 0,
            papg: games > 0 ? +(pa / games).toFixed(1) : 0,
            ypg, yapg,
        };
    }).sort((a, b) => a.name.localeCompare(b.name));

    fs.writeFileSync(path.join(DATA_DIR, "team_stats.json"), JSON.stringify(teamStats), "utf8");
    console.log(`      Saved ${teamStats.length} teams to data/team_stats.json`);
    console.log(`      Sample: ${teamStats.find(t=>t.abbr==="KC")?.abbr} won=${teamStats.find(t=>t.abbr==="KC")?.won} ppg=${teamStats.find(t=>t.abbr==="KC")?.ppg}`);

    // Update team_season_stats_2026 in DB
    const upsertTeam = db.prepare(`
        INSERT INTO team_season_stats_2026 (abbr, won, lost, tied, ppg, papg, ypg, yapg)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(abbr) DO UPDATE SET
            won=excluded.won, lost=excluded.lost, tied=excluded.tied,
            ppg=excluded.ppg, papg=excluded.papg, ypg=excluded.ypg, yapg=excluded.yapg
    `);
    const updateTeams = db.transaction(teams => {
        for (const t of teams) {
            upsertTeam.run(t.abbr, t.won, t.lost, t.tied || 0, t.ppg, t.papg, t.ypg || 0, t.yapg || 0);
        }
    });
    updateTeams(teamStats);
    console.log(`      Updated ${teamStats.length} rows in team_season_stats_2026`);

    // ── Step 2a: Collect skill player list from rosters (32 calls) ───────────
    console.log(`\n[2/2] Fetching 2026 player stats via per-player game logs...`);
    console.log(`      Step 2a: collecting rosters (${teamStats.length} calls)...`);
    const skillPlayers = [];
    let rNum = 0;

    for (const team of teamStats) {
        rNum++;
        process.stdout.write(`      [${rNum}/${teamStats.length}] ${team.abbr}... `);
        try {
            charge();
            const body      = await tank01Get("/getNFLTeamRoster", { teamAbv: team.abbr });
            const bodyInner = body?.body ?? body;
            const roster    = bodyInner?.roster ?? (Array.isArray(bodyInner) ? bodyInner : []);

            let added = 0;
            for (const p of roster) {
                const pos    = simplifyPos(p.pos ?? p.position ?? "");
                const tankId = p.playerID ?? p.id ?? "";
                if (!KEEP.has(pos) || !tankId) continue;
                skillPlayers.push({
                    playerID: tankId,
                    espnId:   p.espnID ?? p.espnId ?? "",
                    name:     p.longName ?? p.fullName ?? p.name ?? "",
                    pos, team: team.abbr, teamName: team.name, teamLogo: team.logo,
                });
                added++;
            }
            console.log(`${roster.length} on roster, ${added} skill`);
        } catch (err) {
            console.log(`FAILED: ${err.message}`);
        }
        if (rNum < teamStats.length) await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n      Step 2b: fetching game logs for ${skillPlayers.length} skill players...`);

    // ── Step 2b: Per-player game log calls ────────────────────────────────────
    const upsertTotals = db.prepare(`
        INSERT INTO season_player_totals_2026
            (espn_id, team_abbr, games_played,
             passing_att, passing_cmp, passing_yds, passing_tds, interceptions,
             rushing_att, rushing_yds, rushing_tds,
             targets, receptions, receiving_yds, receiving_tds,
             fumbles_lost, two_pt_conv, fantasy_pts_std, fantasy_pts_ppr,
             sacks, solo_tackles, assisted_tackles, tackles_for_loss,
             passes_defended, def_interceptions, forced_fumbles, def_tds, sack_yards)
        VALUES
            (@espn_id, @team_abbr, @games_played,
             @passing_att, @passing_cmp, @passing_yds, @passing_tds, @interceptions,
             @rushing_att, @rushing_yds, @rushing_tds,
             @targets, @receptions, @receiving_yds, @receiving_tds,
             @fumbles_lost, 0, @fantasy_pts_std, @fantasy_pts_ppr,
             0,0,0,0,0,0,0,0,0)
        ON CONFLICT(espn_id) DO UPDATE SET
            team_abbr      = excluded.team_abbr,
            games_played   = excluded.games_played,
            passing_att    = excluded.passing_att,  passing_cmp  = excluded.passing_cmp,
            passing_yds    = excluded.passing_yds,  passing_tds  = excluded.passing_tds,
            interceptions  = excluded.interceptions,
            rushing_att    = excluded.rushing_att,  rushing_yds  = excluded.rushing_yds,
            rushing_tds    = excluded.rushing_tds,
            targets        = excluded.targets,      receptions   = excluded.receptions,
            receiving_yds  = excluded.receiving_yds,receiving_tds= excluded.receiving_tds,
            fumbles_lost   = excluded.fumbles_lost,
            fantasy_pts_std= excluded.fantasy_pts_std,
            fantasy_pts_ppr= excluded.fantasy_pts_ppr
    `);

    function nn(v) { return parseFloat(v) || 0; }

    const playerStats = [];
    let pNum = 0;

    for (const player of skillPlayers) {
        pNum++;
        if (budget.count >= 900) {
            console.log(`\n⚠ Budget at ${budget.count}/1000 — stopping early.`);
            break;
        }
        try {
            charge();
            const body  = await tank01Get("/getNFLGamesForPlayer", { playerID: player.playerID, season: "2026" });
            const games = Array.isArray(body) ? body
                : (body?.playerGameStats ?? body?.games ?? body?.gameLog ?? body?.stats ?? []);

            if (!Array.isArray(games) || !games.length) continue;

            let passYds=0, passTDs=0, passAtt=0, passComp=0, passINT=0;
            let rushYds=0, rushTDs=0, rushAtt=0;
            let recYds=0, recTDs=0, recRec=0, targets=0;
            let fumbleLost=0, fantStd=0, fantPPR=0, gamesPlayed=0;

            for (const g of games) {
                const O = g.Offense ?? g.offense ?? g;
                passYds   += nn(O.passYds   ?? O.passYards);
                passTDs   += nn(O.passTD    ?? O.passTDs);
                passAtt   += nn(O.passAtt   ?? O.attempts);
                passComp  += nn(O.passComp  ?? O.completions);
                passINT   += nn(O.int       ?? O.passInt ?? O.interceptions);
                rushYds   += nn(O.rushYds   ?? O.rushYards);
                rushTDs   += nn(O.rushTD    ?? O.rushTDs);
                rushAtt   += nn(O.rushAtt   ?? O.carries);
                recYds    += nn(O.recYds    ?? O.recYards);
                recTDs    += nn(O.recTD     ?? O.recTDs);
                recRec    += nn(O.receptions ?? O.rec ?? O.catches);
                targets   += nn(O.targets   ?? O.tgts);
                fumbleLost+= nn(O.fumblesLost ?? O.fumbleLost ?? g.fumblesLost);
                fantStd   += nn(g.fantasyPoints ?? g.fantasy_pts_std);
                fantPPR   += nn(g.fantasyPointsPPR ?? g.fantasy_pts_ppr);
                gamesPlayed++;
            }

            const totalYds = passYds + rushYds + recYds;
            const totalTDs = passTDs + rushTDs + recTDs;
            if (totalYds === 0 && totalTDs === 0 && fantStd === 0) continue;

            const gDiv = Math.max(1, gamesPlayed);

            playerStats.push({
                id:       player.playerID,
                espnId:   player.espnId,
                name:     player.name,
                pos:      player.pos,
                team:     player.team,
                teamName: player.teamName,
                teamLogo: player.teamLogo,
                games:    gamesPlayed,
                passYds, passTDs, passAtt, passComp, passCmp: passComp, passINT,
                compPct:  passAtt > 0 ? +(passComp / passAtt * 100).toFixed(1) : 0,
                fumbleLost,
                rushYds, rushTDs, rushAtt,
                ypc:     rushAtt > 0 ? +(rushYds / rushAtt).toFixed(1) : 0,
                cpg:     +(rushAtt / gDiv).toFixed(1),
                rushYpg: +(rushYds  / gDiv).toFixed(1),
                recYds, recTDs, recRec, targets,
                recYpg:  +(recYds / gDiv).toFixed(1),
                recPg:   +(recRec  / gDiv).toFixed(1),
                totalYds, totalTDs,
                ypg:     +(totalYds / gDiv).toFixed(1),
                fantasyPtsStd: fantStd,
                fantasyPtsPpr: fantPPR,
            });

            if (player.espnId) {
                try {
                    upsertTotals.run({
                        espn_id: player.espnId, team_abbr: player.team, games_played: gamesPlayed,
                        passing_att: passAtt, passing_cmp: passComp,
                        passing_yds: passYds, passing_tds: passTDs,
                        interceptions: passINT,
                        rushing_att: rushAtt, rushing_yds: rushYds, rushing_tds: rushTDs,
                        targets, receptions: recRec,
                        receiving_yds: recYds, receiving_tds: recTDs,
                        fumbles_lost: fumbleLost,
                        fantasy_pts_std: fantStd, fantasy_pts_ppr: fantPPR,
                    });
                } catch { /* espnId missing or table schema mismatch — non-fatal */ }
            }
        } catch (err) {
            process.stdout.write(`\n      [${pNum}] ${player.name}: ${err.message}\n`);
        }

        if (pNum % 10 === 0) process.stdout.write(`      ...${pNum}/${skillPlayers.length} done\n`);
        if (pNum < skillPlayers.length) await new Promise(r => setTimeout(r, 250));
    }

    fs.writeFileSync(path.join(DATA_DIR, "player_stats.json"), JSON.stringify(playerStats), "utf8");
    console.log(`\n✅ Done!`);
    console.log(`   Saved ${playerStats.length} players to data/player_stats.json`);
    console.log(`   Total API calls used today: ${budget.count}/1000`);
    console.log(`\n   Restart the server (or hit POST /api/admin/refresh-2026) to load into memory.`);

    db.close();
}

main().catch(err => {
    console.error("Fatal:", err.message);
    process.exit(1);
});
