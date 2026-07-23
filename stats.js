"use strict";

// ── Utilities ─────────────────────────────────────────────────────────────────
// ESPN CDN team logos — reliable fallback if API-Sports logo URLs have issues
const ESPN_LOGO = abbr =>
    `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbr || "").toLowerCase()}.png`;

// Interpolate green → red based on rank fraction (0 = best, 1 = worst)
function rankColor(t) {
    return `rgb(${Math.round(76+179*t)},${Math.round(175-68*t)},${Math.round(109-2*t)})`;
}

// Parse filter expressions like ">25", "<350", "KC", "Chiefs"
function matchesFilter(value, expr) {
    if (!expr.trim()) return true;
    const m = expr.trim().match(/^([><]?)(-?\d*\.?\d+)$/);
    if (m) {
        const num = parseFloat(value);
        const threshold = parseFloat(m[2]);
        if (m[1] === ">") return num > threshold;
        if (m[1] === "<") return num < threshold;
        return num === threshold;
    }
    return String(value).toLowerCase().includes(expr.toLowerCase());
}

// ── Module state ──────────────────────────────────────────────────────────────
let teamStats   = [];
let playerStats = [];

// ── Tab switching ─────────────────────────────────────────────────────────────
function initTabs() {
    document.querySelectorAll(".page-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".page-tab").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".page-panel").forEach(p => p.classList.add("hidden"));
            btn.classList.add("active");
            document.getElementById(btn.dataset.panel).classList.remove("hidden");
        });
    });

    document.querySelectorAll(".sub-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            const panel = btn.closest(".page-panel");
            panel.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
            panel.querySelectorAll(".sub-panel").forEach(p => p.classList.add("hidden"));
            btn.classList.add("active");
            document.getElementById(btn.dataset.panel).classList.remove("hidden");
        });
    });
}

// ── Data fetch ────────────────────────────────────────────────────────────────
// Returns true if server is still loading (user should refresh in ~60s)
async function loadData() {
    const [tRes, pRes] = await Promise.allSettled([
        fetch("/api/team-stats"),
        fetch("/api/player-stats"),
    ]);

    let stillLoading = false;

    if (tRes.status === "fulfilled") {
        if (tRes.value.ok) {
            teamStats = await tRes.value.json();
        } else {
            try {
                const j = await tRes.value.json();
                if (j.status === "loading") stillLoading = true;
                console.warn("team-stats:", j.message);
            } catch { /* ignore */ }
        }
    }

    if (pRes.status === "fulfilled") {
        if (pRes.value.ok) {
            playerStats = await pRes.value.json();
        } else {
            try {
                const j = await pRes.value.json();
                if (j.status === "loading") stillLoading = true;
                console.warn("player-stats:", j.message);
            } catch { /* ignore */ }
        }
    }

    return stillLoading;
}

// ── Player comparison ─────────────────────────────────────────────────────────
// Stat column definitions per position — shows position-appropriate numbers
const POS_STATS = {
    QB: [
        { key: "passYds",  label: "Pass Yards",  fmt: v => Number(v).toLocaleString() },
        { key: "passTDs",  label: "Pass TDs",    fmt: v => v },
        { key: "compPct",  label: "Comp %",      fmt: v => v + "%" },
        { key: "rushYds",  label: "Rush Yards",  fmt: v => Number(v).toLocaleString() },
        { key: "games",    label: "Games",       fmt: v => v },
    ],
    RB: [
        { key: "rushYds",  label: "Rush Yards",  fmt: v => Number(v).toLocaleString() },
        { key: "rushTDs",  label: "Rush TDs",    fmt: v => v },
        { key: "ypc",      label: "Yds / Carry", fmt: v => v },
        { key: "cpg",      label: "Carries / G", fmt: v => v },
        { key: "games",    label: "Games",       fmt: v => v },
    ],
    WR: [
        { key: "recYds",   label: "Rec Yards",   fmt: v => Number(v).toLocaleString() },
        { key: "recTDs",   label: "Rec TDs",     fmt: v => v },
        { key: "recRec",   label: "Receptions",  fmt: v => v },
        { key: "recYpg",   label: "Rec Yds / G", fmt: v => v },
        { key: "games",    label: "Games",       fmt: v => v },
    ],
    TE: [
        { key: "recYds",   label: "Rec Yards",   fmt: v => Number(v).toLocaleString() },
        { key: "recTDs",   label: "Rec TDs",     fmt: v => v },
        { key: "recRec",   label: "Receptions",  fmt: v => v },
        { key: "recYpg",   label: "Rec Yds / G", fmt: v => v },
        { key: "games",    label: "Games",       fmt: v => v },
    ],
};
const DEFAULT_STATS = [
    { key: "totalYds", label: "Total Yards", fmt: v => Number(v).toLocaleString() },
    { key: "totalTDs", label: "TDs",         fmt: v => v },
    { key: "games",    label: "Games",       fmt: v => v },
];

function initCompare() {
    document.getElementById("pos-select").addEventListener("change", buildPlayerSelects);
    buildPlayerSelects();
}

function buildPlayerSelects() {
    const pos      = document.getElementById("pos-select").value;
    const wrap     = document.getElementById("player-selects");
    const tableWrap = document.getElementById("compare-table-wrap");

    // Sort by best stat for each position
    const sortKey = { QB: "passYds", RB: "rushYds", WR: "recYds", TE: "recYds" }[pos] || "totalYds";
    const filtered = playerStats
        .filter(p => p.pos === pos)
        .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

    wrap.innerHTML = "";

    if (!filtered.length) {
        wrap.innerHTML = `<p class="loading-note">No ${pos} stats available</p>`;
        if (tableWrap) tableWrap.innerHTML = "";
        return;
    }

    for (let i = 0; i < 5; i++) {
        const group = document.createElement("div");
        group.className = "control-group";

        const label = document.createElement("label");
        label.className = "control-label";
        label.textContent = `Player ${i + 1}`;

        const sel = document.createElement("select");
        sel.className = "stats-select player-select";
        sel.innerHTML = '<option value="">— none —</option>';
        filtered.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = `${p.name} (${p.team})`;
            sel.appendChild(opt);
        });

        if (filtered[i]) sel.value = filtered[i].id;
        sel.addEventListener("change", renderCompareTable);
        group.appendChild(label);
        group.appendChild(sel);
        wrap.appendChild(group);
    }

    renderCompareTable();
}

function renderCompareTable() {
    const pos  = document.getElementById("pos-select").value;
    const sels = document.querySelectorAll(".player-select");
    const wrap = document.getElementById("compare-table-wrap");
    const defs = POS_STATS[pos] || DEFAULT_STATS;

    const rows = [];
    sels.forEach(sel => {
        if (!sel.value) return;
        const p = playerStats.find(p => String(p.id) === String(sel.value));
        if (p) rows.push(p);
    });

    if (!rows.length) { wrap.innerHTML = ""; return; }

    let html = `<div class="compare-table-wrap"><table class="compare-table">
        <thead><tr>
            <th>Player</th><th>Team</th>
            ${defs.map(d => `<th class="stat-col">${d.label}</th>`).join("")}
        </tr></thead><tbody>`;

    rows.forEach(row => {
        html += `<tr>
            <td class="player-name-cell">${row.name}</td>
            <td class="player-team-cell">
                <img src="${ESPN_LOGO(row.team)}"
                     style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:4px"
                     onerror="this.style.display='none'">
                ${row.team}
            </td>`;

        defs.forEach(def => {
            const vals   = rows.map(r => parseFloat(r[def.key]) || 0);
            const sorted = [...vals].sort((a, b) => b - a);
            const rank   = sorted.indexOf(parseFloat(row[def.key]) || 0);
            const t      = rows.length === 1 ? 0 : rank / (rows.length - 1);
            html += `<td class="stat-cell" style="background:${rankColor(t)};color:#fff">
                ${def.fmt(row[def.key] ?? 0)}
            </td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
}

// ── Scatter chart renderer ────────────────────────────────────────────────────
function renderScatter(container, { title, data, xKey, xLabel, yKey, yLabel, nameKey, logoFn }) {
    if (!data || !data.length) return;

    const xs = data.map(d => +d[xKey] || 0);
    const ys = data.map(d => +d[yKey] || 0);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;

    const wrap = document.createElement("div");
    wrap.className = "scatter-wrap";

    const h3 = document.createElement("h3");
    h3.className = "chart-title";
    h3.textContent = title;
    wrap.appendChild(h3);

    const inner = document.createElement("div");
    inner.className = "scatter-inner";

    const yLbl = document.createElement("div");
    yLbl.className = "chart-y-label";
    yLbl.textContent = yLabel;
    inner.appendChild(yLbl);

    const chartMain = document.createElement("div");
    chartMain.className = "chart-main";

    const area = document.createElement("div");
    area.className = "chart-area";

    [25, 50, 75].forEach(pct => {
        const h = document.createElement("div");
        h.className = "chart-grid-h";
        h.style.bottom = pct + "%";
        area.appendChild(h);

        const v = document.createElement("div");
        v.className = "chart-grid-v";
        v.style.left = pct + "%";
        area.appendChild(v);
    });

    data.forEach(d => {
        const xPct = 5 + ((+d[xKey] - xMin) / xRange) * 88;
        const yPct = 5 + ((+d[yKey] - yMin) / yRange) * 88;

        const pt = document.createElement("div");
        pt.className = "chart-point";
        pt.style.left   = xPct + "%";
        pt.style.bottom = yPct + "%";
        pt.title = `${d[nameKey]}\n${xLabel}: ${d[xKey]}\n${yLabel}: ${d[yKey]}`;

        const img = document.createElement("img");
        img.className = "point-logo";
        img.src = logoFn(d);
        img.alt = d[nameKey];
        img.onerror = () => { img.style.opacity = "0"; };

        const span = document.createElement("span");
        span.className = "point-name";
        span.textContent = String(d[nameKey]).split(" ").pop();

        pt.appendChild(img);
        pt.appendChild(span);
        area.appendChild(pt);
    });

    const xLbl = document.createElement("div");
    xLbl.className = "chart-x-label";
    xLbl.textContent = xLabel;

    chartMain.appendChild(area);
    chartMain.appendChild(xLbl);
    inner.appendChild(chartMain);
    wrap.appendChild(inner);
    container.appendChild(wrap);
}

// ── RB player charts ──────────────────────────────────────────────────────────
function buildRBCharts() {
    const container = document.getElementById("rb-charts");
    container.innerHTML = "";

    const rbs = playerStats
        .filter(p => p.pos === "RB" && p.rushAtt > 0)
        .sort((a, b) => b.rushYds - a.rushYds)
        .slice(0, 30);

    if (!rbs.length) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:20px">RB data not yet available.</p>';
        return;
    }

    const logoFn = d => d.teamLogo || ESPN_LOGO(d.team);

    renderScatter(container, {
        title:  "2025 RBs — Yards Per Carry vs. Carries Per Game",
        data:   rbs, xKey: "ypc",    xLabel: "Yards Per Carry",
        yKey:   "cpg",               yLabel: "Carries Per Game",
        nameKey: "name", logoFn,
    });

    renderScatter(container, {
        title:  "2025 RBs — Touchdowns vs. Rush Yards Per Game",
        data:   rbs, xKey: "rushTDs", xLabel: "Touchdowns",
        yKey:   "rushYpg",            yLabel: "Rush Yards Per Game",
        nameKey: "name", logoFn,
    });

    renderScatter(container, {
        title:  "2025 RBs — Games Played vs. Rush Yards Per Game",
        data:   rbs, xKey: "games",  xLabel: "Games Played",
        yKey:   "rushYpg",           yLabel: "Rush Yards Per Game",
        nameKey: "name", logoFn,
    });
}

// ── Team charts ───────────────────────────────────────────────────────────────
function buildTeamCharts() {
    const container = document.getElementById("team-charts");
    container.innerHTML = "";

    if (!teamStats.length) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:20px">Team data not yet available.</p>';
        return;
    }

    // Use API-Sports logo if available, fall back to ESPN CDN
    const logoFn = d => d.logo || ESPN_LOGO(d.abbr);

    renderScatter(container, {
        title:  "2025 — Points Scored vs. Points Allowed Per Game",
        data:   teamStats, xKey: "ppg", xLabel: "Points Scored Per Game",
        yKey:   "papg",                 yLabel: "Points Allowed Per Game",
        nameKey: "abbr", logoFn,
    });

    const withYards = teamStats.filter(t => t.ypg > 0 && t.yapg > 0);
    if (withYards.length) {
        renderScatter(container, {
            title:  "2025 — Yards Gained vs. Yards Allowed Per Game",
            data:   withYards, xKey: "ypg", xLabel: "Yards Gained Per Game",
            yKey:   "yapg",                  yLabel: "Yards Allowed Per Game",
            nameKey: "abbr", logoFn,
        });
    }

    const withOff = teamStats.filter(t => t.ypg > 0);
    if (withOff.length) {
        renderScatter(container, {
            title:  "2025 — Yards Per Game vs. Points Per Game",
            data:   withOff, xKey: "ypg", xLabel: "Yards Per Game",
            yKey:   "ppg",                yLabel: "Points Per Game",
            nameKey: "abbr", logoFn,
        });
    }
}

// ── Team rankings table ───────────────────────────────────────────────────────
let sortCol = "ppg", sortDir = "desc";
let filterVals = {};

function buildTeamTable() {
    const tbody = document.getElementById("team-tbody");

    if (!teamStats.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:20px">
            No team data available.
        </td></tr>`;
        return;
    }

    let data = [...teamStats].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol];
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? av - bv : bv - av;
    });

    data = data.filter(t =>
        Object.entries(filterVals).every(([col, expr]) => {
            const val = col === "name" ? t.name : t[col];
            return matchesFilter(val, expr);
        })
    );

    tbody.innerHTML = data.map(t => `
        <tr>
            <td>
                <div class="team-cell">
                    <img class="team-logo-sm"
                         src="${t.logo || ESPN_LOGO(t.abbr)}"
                         alt="${t.abbr}"
                         onerror="this.src='${ESPN_LOGO(t.abbr)}'">
                    <div>
                        <div class="team-name">${t.name}</div>
                        <div class="team-abbr">${t.won}–${t.lost}</div>
                    </div>
                </div>
            </td>
            <td>${(+t.ppg  || 0).toFixed(1)}</td>
            <td>${t.ypg  > 0 ? (+t.ypg ).toFixed(1) : "—"}</td>
            <td>${t.yapg > 0 ? (+t.yapg).toFixed(1) : "—"}</td>
            <td>${(+t.papg || 0).toFixed(1)}</td>
            <td>—</td>
        </tr>
    `).join("");

    document.querySelectorAll(".sortable").forEach(th => {
        th.classList.remove("asc", "desc");
        if (th.dataset.col === sortCol) th.classList.add(sortDir);
    });
}

function initTeamTable() {
    document.querySelectorAll(".sortable").forEach(th => {
        th.addEventListener("click", () => {
            if (th.dataset.col === sortCol) {
                sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
                sortCol = th.dataset.col;
                sortDir = "desc";
            }
            buildTeamTable();
        });
    });

    document.querySelectorAll(".filter-input").forEach(inp => {
        inp.addEventListener("input", () => {
            filterVals[inp.dataset.col] = inp.value;
            buildTeamTable();
        });
    });

    buildTeamTable();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    initTabs();

    // Show skeleton loading state
    const tbody = document.getElementById("team-tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:20px">Loading…</td></tr>`;
    const pSelects = document.getElementById("player-selects");
    if (pSelects) pSelects.innerHTML = `<p class="loading-note">Loading players…</p>`;

    const stillLoading = await loadData();

    if (stillLoading) {
        // Server is doing its first-ever API-Sports fetch — tell the user to wait
        const msg = `
            <p style="color:var(--text-dim);padding:0 0 8px">
                Stats are loading for the first time — the server is fetching 2025 season data
                from API-Sports (~60 seconds). This page will auto-refresh.
            </p>`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="6">${msg}</td></tr>`;
        if (pSelects) pSelects.innerHTML = `<p class="loading-note">Loading…</p>`;
        // Auto-reload once — data will be cached on the server by then
        setTimeout(() => window.location.reload(), 65_000);
        // Still init the table/charts with empty data so tabs work
    }

    initTeamTable();
    buildTeamCharts();
    initCompare();
    buildRBCharts();
}

init();
