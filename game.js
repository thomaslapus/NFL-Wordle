"use strict";

const ESPN_LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbr||"nfl").toLowerCase()}.png`;

function n(v) { const x = parseFloat(v); return isFinite(x) ? x : 0; }
function fmt(v, dec = 0) {
    const x = parseFloat(v);
    return isFinite(x) ? (dec ? x.toFixed(dec) : Math.round(x).toString()) : "—";
}

function getGameId() {
    // Accept /game/GAMEID or /game.html?id=GAMEID
    const path = window.location.pathname;
    const m = path.match(/\/game\/(.+)/);
    if (m) return m[1];
    return new URLSearchParams(window.location.search).get("id") || "";
}

function formatDate(gameId) {
    // gameId: 20261025_KC@SEA
    const d = gameId.slice(0, 8);
    if (!d || d.length < 8) return "";
    return new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
}

function renderHeader(gameId, away, home, awayScore, homeScore) {
    const awayWin = n(awayScore) > n(homeScore);
    const homeWin = n(homeScore) > n(awayScore);
    const dateStr = formatDate(gameId);

    document.title = `${away} vs ${home} — I Suck at Fantasy`;

    return `
    <div class="game-score-header">
        <div class="game-team away ${awayWin ? "winner" : homeWin ? "loser" : ""}">
            <img class="game-team-logo" src="${ESPN_LOGO(away)}" alt="${away}">
            <div class="game-team-name">${away}</div>
            <div class="game-team-score">${awayScore ?? "—"}</div>
        </div>
        <div class="game-middle">
            <span class="game-status-badge">Final</span>
            <span class="game-at">@</span>
            <span class="game-date-line">${dateStr}</span>
        </div>
        <div class="game-team home ${homeWin ? "winner" : awayWin ? "loser" : ""}">
            <img class="game-team-logo" src="${ESPN_LOGO(home)}" alt="${home}">
            <div class="game-team-name">${home}</div>
            <div class="game-team-score">${homeScore ?? "—"}</div>
        </div>
    </div>`;
}

function groupPlayers(players, teamAbbr) {
    const team = players.filter(p => p.team === teamAbbr);
    const passers   = team.filter(p => p.Passing && n(p.Passing.passAttempts) > 0);
    const rushers   = team.filter(p => p.Rushing && n(p.Rushing.carries) > 0);
    const receivers = team.filter(p => p.Receiving && n(p.Receiving.receptions) > 0);
    const defenders = team.filter(p => p.Defense && (n(p.Defense.soloTackles) + n(p.Defense.sacks) > 0));
    return { passers, rushers, receivers, defenders };
}

function passingRow(p) {
    const P = p.Passing;
    return `<tr>
        <td class="player-name-cell">${p.name}</td>
        <td>${fmt(P.passCompletions)}/${fmt(P.passAttempts)}</td>
        <td>${fmt(P.passYds)}</td>
        <td>${fmt(P.passTD)}</td>
        <td>${fmt(P.int)}</td>
        <td>${fmt(P.qbr || P.passer_rating, 1)}</td>
    </tr>`;
}

function rushingRow(p) {
    const R = p.Rushing;
    const ypc = n(R.carries) ? (n(R.rushYds) / n(R.carries)).toFixed(1) : "—";
    return `<tr>
        <td class="player-name-cell">${p.name}</td>
        <td>${fmt(R.carries)}</td>
        <td>${fmt(R.rushYds)}</td>
        <td>${ypc}</td>
        <td>${fmt(R.rushTD)}</td>
    </tr>`;
}

function receivingRow(p) {
    const Re = p.Receiving;
    return `<tr>
        <td class="player-name-cell">${p.name}</td>
        <td>${fmt(Re.targets)}</td>
        <td>${fmt(Re.receptions)}</td>
        <td>${fmt(Re.recYds)}</td>
        <td>${fmt(Re.recYds && Re.receptions ? (n(Re.recYds)/n(Re.receptions)).toFixed(1) : "—")}</td>
        <td>${fmt(Re.recTD)}</td>
    </tr>`;
}

function defenseRow(p) {
    const D = p.Defense;
    return `<tr>
        <td class="player-name-cell">${p.name}</td>
        <td>${fmt(D.totalTackles)}</td>
        <td>${fmt(D.soloTackles)}</td>
        <td>${fmt(D.sacks, 1)}</td>
        <td>${fmt(D.tfl, 1)}</td>
        <td>${fmt(D.passDeflections)}</td>
        <td>${fmt(D.defensiveInterceptions)}</td>
    </tr>`;
}

function teamBoxscore(players, abbr) {
    const { passers, rushers, receivers, defenders } = groupPlayers(players, abbr);
    let html = `<div class="boxscore-section">`;

    if (passers.length) {
        html += `<div class="boxscore-group-header">Passing</div>
        <table class="boxscore-table">
            <thead><tr><th>Player</th><th>CMP/ATT</th><th>YDS</th><th>TD</th><th>INT</th><th>RTG</th></tr></thead>
            <tbody>${passers.sort((a,b)=>n(b.Passing.passAttempts)-n(a.Passing.passAttempts)).map(passingRow).join("")}</tbody>
        </table>`;
    }

    if (rushers.length) {
        html += `<div class="boxscore-group-header">Rushing</div>
        <table class="boxscore-table">
            <thead><tr><th>Player</th><th>CAR</th><th>YDS</th><th>YPC</th><th>TD</th></tr></thead>
            <tbody>${rushers.sort((a,b)=>n(b.Rushing.rushYds)-n(a.Rushing.rushYds)).map(rushingRow).join("")}</tbody>
        </table>`;
    }

    if (receivers.length) {
        html += `<div class="boxscore-group-header">Receiving</div>
        <table class="boxscore-table">
            <thead><tr><th>Player</th><th>TGT</th><th>REC</th><th>YDS</th><th>YPR</th><th>TD</th></tr></thead>
            <tbody>${receivers.sort((a,b)=>n(b.Receiving.recYds)-n(a.Receiving.recYds)).map(receivingRow).join("")}</tbody>
        </table>`;
    }

    if (defenders.length) {
        html += `<div class="boxscore-group-header">Defense</div>
        <table class="boxscore-table">
            <thead><tr><th>Player</th><th>TOT</th><th>SOLO</th><th>SACKS</th><th>TFL</th><th>PD</th><th>INT</th></tr></thead>
            <tbody>${defenders.sort((a,b)=>(n(b.Defense.totalTackles)+n(b.Defense.sacks)*2)-(n(a.Defense.totalTackles)+n(a.Defense.sacks)*2)).map(defenseRow).join("")}</tbody>
        </table>`;
    }

    if (!passers.length && !rushers.length && !receivers.length && !defenders.length) {
        html += `<div class="error-state">No detailed player stats available for this game.</div>`;
    }

    return html + `</div>`;
}

function renderBoxscore(gameId, away, home, awayScore, homeScore, players) {
    const wrap = document.getElementById("boxscore-wrap");

    wrap.innerHTML = `
    <div class="boxscore-tabs">
        <button class="boxscore-tab active" data-team="${away}">
            <img class="boxscore-tab-logo" src="${ESPN_LOGO(away)}" alt="${away}">
            ${away} <span style="color:var(--text-dim);font-weight:400">&nbsp;${awayScore}</span>
        </button>
        <button class="boxscore-tab" data-team="${home}">
            <img class="boxscore-tab-logo" src="${ESPN_LOGO(home)}" alt="${home}">
            ${home} <span style="color:var(--text-dim);font-weight:400">&nbsp;${homeScore}</span>
        </button>
    </div>
    <div id="team-box-content">${teamBoxscore(players, away)}</div>`;

    wrap.querySelectorAll(".boxscore-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            wrap.querySelectorAll(".boxscore-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById("team-box-content").innerHTML = teamBoxscore(players, tab.dataset.team);
        });
    });
}

async function init() {
    const gameId = getGameId();
    const headerEl = document.getElementById("game-header");
    const wrap     = document.getElementById("boxscore-wrap");

    if (!gameId) {
        headerEl.innerHTML = `<div class="game-notice">No game ID specified. <a href="/games.html">View schedule</a></div>`;
        wrap.innerHTML = "";
        return;
    }

    // Pull from DB first (team_game_logs), then try boxscore API
    const [bsRes] = await Promise.allSettled([
        fetch(`/api/game-boxscore?gameID=${gameId}`)
    ]);

    if (bsRes.status === "fulfilled" && bsRes.value.ok) {
        const data = await bsRes.value.json();
        const { away, home, awayScore, homeScore, playerStats = [] } = data;
        headerEl.innerHTML = renderHeader(gameId, away || "Away", home || "Home", awayScore, homeScore);
        renderBoxscore(gameId, away, home, awayScore, homeScore, playerStats);
        return;
    }

    // No live API available — show score from DB schedules if possible
    headerEl.innerHTML = `<div class="game-notice">
        Detailed box score data requires live API access.
        <br><br>
        Game: <strong>${gameId}</strong>
        <br><br>
        <a href="/games.html">← Back to schedule</a>
    </div>`;
    wrap.innerHTML = "";
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
