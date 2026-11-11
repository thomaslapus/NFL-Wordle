"use strict";

const ESPN_LOGO     = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbr||"nfl").toLowerCase()}.png`;
const ESPN_HEADSHOT = id   => id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : "";

function n(v) { const x = parseFloat(v); return isFinite(x) ? x : 0; }

let playerA = null, playerB = null;
let logsA = [], logsB = [];
let season = 2026;
let activeMetric = "fantasy_pts_ppr";

// ── Search ────────────────────────────────────────────────────────────────────
let searchTimers = { a: null, b: null };

function setupSearch(side) {
    const input    = document.getElementById(`search-${side}`);
    const dropdown = document.getElementById(`dropdown-${side}`);

    input.addEventListener("input", () => {
        clearTimeout(searchTimers[side]);
        const q = input.value.trim();
        if (q.length < 2) { dropdown.classList.add("hidden"); return; }
        searchTimers[side] = setTimeout(() => runSearch(q, side, dropdown), 220);
    });

    input.addEventListener("blur", () => {
        setTimeout(() => dropdown.classList.add("hidden"), 200);
    });
}

async function runSearch(q, side, dropdown) {
    try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const players = data.filter(r => r.type === "player");
        if (!players.length) { dropdown.innerHTML = `<div class="dropdown-item"><span class="dropdown-item-meta">No results</span></div>`; }
        else {
            dropdown.innerHTML = players.map(p => `
                <div class="dropdown-item" data-espnid="${p.espnId}" data-name="${p.name}" data-pos="${p.pos}" data-team="${p.team}">
                    <img class="dropdown-logo" src="${ESPN_LOGO(p.team)}" alt="${p.team}" loading="lazy">
                    <div>
                        <div class="dropdown-item-name">${p.name}</div>
                        <div class="dropdown-item-meta">${p.pos} · ${p.team}</div>
                    </div>
                </div>`).join("");
        }
        dropdown.classList.remove("hidden");

        dropdown.querySelectorAll(".dropdown-item").forEach(el => {
            el.addEventListener("mousedown", () => selectPlayer(side, el));
        });
    } catch {}
}

async function selectPlayer(side, el) {
    const player = { espnId: el.dataset.espnid, name: el.dataset.name, pos: el.dataset.pos, team: el.dataset.team };
    if (side === "a") { playerA = player; }
    else              { playerB = player; }

    const input = document.getElementById(`search-${side}`);
    const slot  = document.getElementById(`slot-${side}`);
    const dropdown = document.getElementById(`dropdown-${side}`);

    dropdown.classList.add("hidden");
    slot.innerHTML = `
        <div class="selected-player">
            <img class="selected-headshot" src="${ESPN_HEADSHOT(player.espnId)}" alt="${player.name}"
                 onerror="this.style.display='none'">
            <div>
                <div class="selected-name">${player.name}</div>
                <div class="selected-meta">${player.pos} · ${player.team}</div>
            </div>
            <button class="clear-btn" data-side="${side}" title="Remove">✕</button>
        </div>`;

    slot.querySelector(".clear-btn").addEventListener("click", () => clearPlayer(side));

    await loadLogs(side, player.espnId);
    renderComparison();
}

function clearPlayer(side) {
    if (side === "a") { playerA = null; logsA = []; }
    else              { playerB = null; logsB = []; }
    const slot = document.getElementById(`slot-${side}`);
    slot.innerHTML = `
        <input class="player-search-input" id="search-${side}" type="text"
               placeholder="Search player ${side.toUpperCase()}…" autocomplete="off" spellcheck="false">
        <div class="search-dropdown hidden" id="dropdown-${side}"></div>`;
    setupSearch(side);
    renderComparison();
}

async function loadLogs(side, espnId) {
    try {
        const res  = await fetch(`/api/player-game-logs?espnId=${espnId}&season=${season}`);
        const data = await res.json();
        if (side === "a") logsA = data;
        else              logsB = data;
    } catch {
        if (side === "a") logsA = [];
        else logsB = [];
    }
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function sumLogs(logs) {
    return logs.reduce((acc, r) => ({
        gp:        acc.gp + 1,
        pass_yds:  acc.pass_yds  + n(r.passing_yds),
        pass_tds:  acc.pass_tds  + n(r.passing_tds),
        rush_yds:  acc.rush_yds  + n(r.rushing_yds),
        rush_tds:  acc.rush_tds  + n(r.rushing_tds),
        rec_yds:   acc.rec_yds   + n(r.receiving_yds),
        rec_tds:   acc.rec_tds   + n(r.receiving_tds),
        fpts:      acc.fpts      + n(r.fantasy_pts_ppr),
    }), { gp:0, pass_yds:0, pass_tds:0, rush_yds:0, rush_tds:0, rec_yds:0, rec_tds:0, fpts:0 });
}

function renderComparison() {
    const wrap = document.getElementById("compare-content");
    if (!playerA && !playerB) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚔️</div><p>Select two players above to start comparing</p></div>`;
        return;
    }
    if (!playerA || !playerB) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Select a second player to compare</p></div>`;
        return;
    }

    const posA = playerA.pos, posB = playerB.pos;
    const totA = sumLogs(logsA), totB = sumLogs(logsB);
    const isQB = posA === "QB" || posB === "QB";

    // Choose which stats to show based on positions
    let statRows = [];
    if (isQB || (posA === "QB" && posB === "QB")) {
        statRows = [
            { key:"pass_yds", label:"Pass Yds",   va: totA.pass_yds, vb: totB.pass_yds, hi:"max" },
            { key:"pass_tds", label:"Pass TDs",   va: totA.pass_tds, vb: totB.pass_tds, hi:"max" },
            { key:"rush_yds", label:"Rush Yds",   va: totA.rush_yds, vb: totB.rush_yds, hi:"max" },
        ];
    }
    if (posA === "RB" || posB === "RB") {
        statRows = [
            { key:"rush_yds", label:"Rush Yds",   va: totA.rush_yds, vb: totB.rush_yds, hi:"max" },
            { key:"rush_tds", label:"Rush TDs",   va: totA.rush_tds, vb: totB.rush_tds, hi:"max" },
            { key:"rec_yds",  label:"Rec Yds",    va: totA.rec_yds,  vb: totB.rec_yds,  hi:"max" },
        ];
    }
    if (posA === "WR" || posB === "WR" || posA === "TE" || posB === "TE") {
        statRows = [
            { key:"rec_yds",  label:"Rec Yds",    va: totA.rec_yds,  vb: totB.rec_yds,  hi:"max" },
            { key:"rec_tds",  label:"Rec TDs",    va: totA.rec_tds,  vb: totB.rec_tds,  hi:"max" },
            { key:"rush_yds", label:"Rush Yds",   va: totA.rush_yds, vb: totB.rush_yds, hi:"max" },
        ];
    }
    statRows.unshift({ key:"gp",   label:"Games",      va: totA.gp,   vb: totB.gp,   hi:"none" });
    statRows.push(   { key:"fpts", label:"Fant Pts",   va: +totA.fpts.toFixed(1), vb: +totB.fpts.toFixed(1), hi:"max" });

    const statHtml = statRows.map(r => {
        const aWin = r.hi === "max" ? r.va > r.vb : false;
        const bWin = r.hi === "max" ? r.vb > r.va : false;
        const fmt = v => Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
        return `<div class="stat-compare-row">
            <div class="stat-val-a${aWin ? " winner" : ""}">${fmt(r.va)}</div>
            <div class="stat-name">${r.label}</div>
            <div class="stat-val-b${bWin ? " winner" : ""}">${fmt(r.vb)}</div>
        </div>`;
    }).join("");

    // Determine which metric tabs are relevant
    const metricMap = {
        fantasy_pts_ppr: "Fantasy Pts",
        passing_yds: "Pass Yds",
        rushing_yds: "Rush Yds",
        receiving_yds: "Rec Yds",
    };
    const relevantMetrics = ["fantasy_pts_ppr"];
    if (totA.pass_yds + totB.pass_yds > 0) relevantMetrics.push("passing_yds");
    if (totA.rush_yds + totB.rush_yds > 0) relevantMetrics.push("rushing_yds");
    if (totA.rec_yds  + totB.rec_yds  > 0) relevantMetrics.push("receiving_yds");

    const tabHtml = relevantMetrics.map(k =>
        `<button class="metric-tab${activeMetric === k ? " active" : ""}" data-metric="${k}">${metricMap[k]}</button>`
    ).join("");

    wrap.innerHTML = `
        <div class="compare-section">
            <div class="compare-section-title">Season Totals — 2026</div>
            ${statHtml}
        </div>
        <div class="weekly-section">
            <div class="weekly-header">
                <span class="weekly-title">Week by Week</span>
                <div class="weekly-metric-tabs">${tabHtml}</div>
            </div>
            <svg class="sparkline-chart" id="sparkline-svg" viewBox="0 0 760 120" preserveAspectRatio="xMidYMid meet"></svg>
            <div class="chart-legend">
                <span><span class="legend-dot" style="background:var(--accent-2)"></span>${playerA.name}</span>
                <span><span class="legend-dot" style="background:var(--gold)"></span>${playerB.name}</span>
            </div>
        </div>`;

    drawSparkline(activeMetric);

    wrap.querySelectorAll(".metric-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            activeMetric = tab.dataset.metric;
            wrap.querySelectorAll(".metric-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            drawSparkline(activeMetric);
        });
    });
}

function drawSparkline(metric) {
    const svg = document.getElementById("sparkline-svg");
    if (!svg) return;

    const metricMap = {
        fantasy_pts_ppr: "fantasy_pts_ppr",
        passing_yds:     "passing_yds",
        rushing_yds:     "rushing_yds",
        receiving_yds:   "receiving_yds",
    };
    const col = metricMap[metric] || "fantasy_pts_ppr";

    const allWeeks = new Set([...logsA.map(r=>r.week), ...logsB.map(r=>r.week)]);
    const weeks = [...allWeeks].sort((a,b)=>a-b);
    if (!weeks.length) { svg.innerHTML = `<text x="380" y="60" text-anchor="middle" fill="var(--text-dim)" font-size="12">No game data</text>`; return; }

    const getVal = (logs, wk) => { const r = logs.find(l => l.week === wk); return r ? n(r[col]) : null; };

    const W = 760, H = 120, padL = 32, padR = 12, padT = 12, padB = 28;
    const maxVal = Math.max(...weeks.flatMap(w => [getVal(logsA, w) ?? 0, getVal(logsB, w) ?? 0]), 1);
    const xStep  = (W - padL - padR) / Math.max(weeks.length - 1, 1);

    const toX = i  => padL + i * xStep;
    const toY = v  => padT + ((H - padT - padB) * (1 - v / maxVal));

    const polyline = (logs, color) => {
        const pts = weeks.map((w, i) => {
            const v = getVal(logs, w);
            return v !== null ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null;
        }).filter(Boolean);
        return pts.length >= 2
            ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
            : "";
    };

    const dots = (logs, color) => weeks.map((w, i) => {
        const v = getVal(logs, w);
        if (v === null) return "";
        const x = toX(i).toFixed(1), y = toY(v).toFixed(1);
        return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="1.5">
            <title>Week ${w}: ${v}</title></circle>`;
    }).join("");

    const labels = weeks.map((w, i) => {
        const x = toX(i).toFixed(1);
        return `<text x="${x}" y="${H - 4}" text-anchor="middle" fill="var(--text-dim)" font-size="10">W${w}</text>`;
    }).join("");

    // Grid lines
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => {
        const val = (maxVal * t).toFixed(0);
        const y   = toY(maxVal * t).toFixed(1);
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3"/>
                <text x="${padL - 4}" y="${+y + 4}" text-anchor="end" fill="var(--text-dim)" font-size="9">${val}</text>`;
    }).join("");

    svg.innerHTML = ticks + labels
        + polyline(logsA, "var(--accent-2)") + polyline(logsB, "var(--gold)")
        + dots(logsA, "var(--accent-2)") + dots(logsB, "var(--gold)");
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
    setupSearch("a");
    setupSearch("b");

    document.getElementById("season-sel").addEventListener("change", async e => {
        season = parseInt(e.target.value);
        if (playerA) await loadLogs("a", playerA.espnId);
        if (playerB) await loadLogs("b", playerB.espnId);
        renderComparison();
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
