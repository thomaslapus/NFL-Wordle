"use strict";

// ── Helpers ───────────────────────────────────────────────────────────────────
const ESPN_LOGO     = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbr||"").toLowerCase()}.png`;
const ESPN_HEADSHOT = id   => id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : "";

function num(v, dec = 0) {
    const n = parseFloat(v);
    if (!isFinite(n)) return "—";
    return dec > 0 ? n.toFixed(dec) : Math.round(n).toLocaleString();
}

function formatTick(v) {
    if (!isFinite(v)) return "";
    if (Math.abs(v) >= 10000) return Math.round(v / 1000) + "k";
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    if (Number.isInteger(v) || Math.abs(v) >= 10) return Math.round(v).toString();
    return v.toFixed(1);
}

function pRating(att, cmp, yds, tds, ints) {
    if (!att) return 0;
    const a = Math.min(Math.max((cmp / att - 0.3) * 5, 0), 2.375);
    const b = Math.min(Math.max((yds / att - 3) * 0.25, 0), 2.375);
    const c = Math.min(Math.max(tds / att * 20, 0), 2.375);
    const d = Math.min(Math.max(2.375 - ints / att * 25, 0), 2.375);
    return +((a + b + c + d) / 6 * 100).toFixed(1);
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLS = {
    QB: [
        { key:"games",      label:"G",        def:"desc", fmt:v=>v||"—" },
        { key:"compPct",    label:"Comp%",     def:"desc", fmt:v=>v?v+"%":"—" },
        { key:"passYds",    label:"Pass Yds",  def:"desc", fmt:v=>v?Number(v).toLocaleString():"—" },
        { key:"passTDs",    label:"Pass TDs",  def:"desc", fmt:v=>v||"—" },
        { key:"passRating", label:"Rating",    def:"desc", fmt:v=>v||"—" },
        { key:"rushYds",    label:"Rush Yds",  def:"desc", fmt:v=>v?Number(v).toLocaleString():"—" },
        { key:"totalTDs",   label:"Total TDs", def:"desc", fmt:v=>v||"—" },
    ],
    RB: [
        { key:"games",   label:"G",        def:"desc", fmt:v=>v||"—" },
        { key:"rushAtt", label:"Carries",   def:"desc", fmt:v=>v||"—" },
        { key:"rushYds", label:"Rush Yds",  def:"desc", fmt:v=>v?Number(v).toLocaleString():"—" },
        { key:"ypc",     label:"YPC",       def:"desc", fmt:v=>v||"—" },
        { key:"rushTDs", label:"Rush TDs",  def:"desc", fmt:v=>v||"—" },
        { key:"recRec",  label:"Rec",       def:"desc", fmt:v=>v||"—" },
        { key:"recYds",  label:"Rec Yds",   def:"desc", fmt:v=>v?Number(v).toLocaleString():"—" },
        { key:"recTDs",  label:"Rec TDs",   def:"desc", fmt:v=>v||"—" },
    ],
    WR: [
        { key:"games",   label:"G",        def:"desc", fmt:v=>v||"—" },
        { key:"recRec",  label:"Rec",       def:"desc", fmt:v=>v||"—" },
        { key:"recYds",  label:"Rec Yds",   def:"desc", fmt:v=>v?Number(v).toLocaleString():"—" },
        { key:"recPg",   label:"Rec/G",     def:"desc", fmt:v=>v||"—" },
        { key:"ypr",     label:"YPR",       def:"desc", fmt:v=>v||"—" },
        { key:"recTDs",  label:"Rec TDs",   def:"desc", fmt:v=>v||"—" },
    ],
    TE: [
        { key:"games",   label:"G",        def:"desc", fmt:v=>v||"—" },
        { key:"recRec",  label:"Rec",       def:"desc", fmt:v=>v||"—" },
        { key:"recYds",  label:"Rec Yds",   def:"desc", fmt:v=>v?Number(v).toLocaleString():"—" },
        { key:"recPg",   label:"Rec/G",     def:"desc", fmt:v=>v||"—" },
        { key:"ypr",     label:"YPR",       def:"desc", fmt:v=>v||"—" },
        { key:"recTDs",  label:"Rec TDs",   def:"desc", fmt:v=>v||"—" },
    ],
    DEF: [
        { key:"games",   label:"G",   def:"desc", fmt:v=>v||"—" },
        { key:"sacks",   label:"Sck", def:"desc", fmt:v=>v||"—" },
        { key:"tackles", label:"Tkl", def:"desc", fmt:v=>v||"—" },
        { key:"tfl",     label:"TFL", def:"desc", fmt:v=>v||"—" },
        { key:"pd",      label:"PD",  def:"desc", fmt:v=>v||"—" },
        { key:"defInt",  label:"INT", def:"desc", fmt:v=>v||"—" },
        { key:"defTDs",  label:"DTD", def:"desc", fmt:v=>v||"—" },
    ],
};

const TEAM_COLS = [
    { key:"won",  label:"W",       def:"desc", fmt:v=>v },
    { key:"lost", label:"L",       def:"asc",  fmt:v=>v },
    { key:"ppg",  label:"PPG",     def:"desc", fmt:v=>(+v||0).toFixed(1) },
    { key:"ypg",  label:"Off YPG", def:"desc", fmt:v=>v>0?(+v).toFixed(1):"—" },
    { key:"papg", label:"PA/G",    def:"asc",  fmt:v=>(+v||0).toFixed(1) },
    { key:"yapg", label:"Def YPG", def:"asc",  fmt:v=>v>0?(+v).toFixed(1):"—" },
];

// ── Module state ──────────────────────────────────────────────────────────────
let playerStats    = [];
let teamStats      = [];
let activeSeason   = "2026";
let activeView     = "QB";
let includePlayoffs = false;

const lbSort   = { col: "passYds", dir: "desc" };
const teamSort = { col: "ppg",     dir: "desc" };

// 2025 playoff game IDs (weeks 19-22)
const PLAYOFF_WEEKS_2025 = new Set([19, 20, 21, 22]);
const PLAYOFF_WEEKS_2026 = new Set([19, 20, 21, 22]);

let searchQuery    = "";
let compareSet     = new Set();
let trendData      = {};
let statsInjuryMap = {};

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData(season) {
    activeSeason = String(season);
    playerStats = [];
    teamStats   = [];

    if (activeSeason === "2025") {
        try {
            const playoffsParam = includePlayoffs ? "true" : "false";
            const [pRes, tRes] = await Promise.all([
                fetch(`/api/historical-player-stats?season=2025&playoffs=${playoffsParam}`, { cache: "no-store" }),
                fetch("/api/historical-team-stats?season=2025", { cache: "no-store" }),
            ]);
            if (pRes.ok) {
                const d = await pRes.json();
                const hasRealStats = Array.isArray(d) && d.some(p => (p.passYds||0)+(p.rushYds||0)+(p.recYds||0) > 0);
                if (hasRealStats) playerStats = d.map(enrichPlayer);
            }
            if (tRes.ok) {
                const d = await tRes.json();
                if (Array.isArray(d) && d.length) teamStats = d;
            }
        } catch (_) {}
        return;
    }

    try {
        const [tRes, pRes] = await Promise.all([
            fetch("/api/team-stats"),
            fetch("/api/player-stats"),
        ]);
        if (tRes.ok) { const d = await tRes.json(); if (Array.isArray(d) && d.length) teamStats = d; }
        if (pRes.ok) {
            const d = await pRes.json();
            // For the live season accept the roster even if stats are all-zero (early season / not yet seeded)
            if (Array.isArray(d) && d.length) playerStats = d.map(enrichPlayer);
        }
    } catch (_) {}
}

function enrichPlayer(p) {
    const g = Math.max(1, p.games || 1);
    const touches = (p.rushAtt || 0) + (p.targets || 0);
    const tackles = (p.soloTackles || 0) + (p.assistedTackles || 0);
    return {
        ...p,
        ypr:          p.recRec  > 0 ? +(p.recYds  / p.recRec).toFixed(1)  : 0,
        totalTDs:     (p.passTDs||0) + (p.rushTDs||0) + (p.recTDs||0),
        carPerGame:   +((p.rushAtt||0) / g).toFixed(1),
        tgtPerGame:   +((p.targets||0) / g).toFixed(1),
        touches,
        touchPerGame: +(touches / g).toFixed(1),
        passRating:   pRating(p.passAtt||0, p.passCmp||0, p.passYds||0, p.passTDs||0, p.passINT||0),
        tackles,
        tfl:          p.tacklesForLoss  || 0,
        pd:           p.passesDefended  || 0,
        defInt:       p.defInterceptions || 0,
        defTDs:       p.defTds || 0,
    };
}

// ── View tab setup ────────────────────────────────────────────────────────────
function initViewTabs() {
    document.querySelectorAll(".view-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".view-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeView = btn.dataset.view;
            updateDefaultSort();
            renderView();
        });
    });
}

function updateDefaultSort() {
    const defaults = { QB:"passYds", RB:"rushYds", WR:"recYds", TE:"recYds", DEF:"tackles", Teams:"ppg", Rookie:"passYds" };
    lbSort.col = defaults[activeView] || "passYds";
    lbSort.dir = "desc";
}

function renderView() {
    const playerPanel = document.getElementById("panel-players");
    const teamPanel   = document.getElementById("panel-teams");
    const isTeams = activeView === "Teams";
    playerPanel.classList.toggle("hidden", isTeams);
    teamPanel.classList.toggle("hidden", !isTeams);

    if (isTeams) {
        renderTeamTable();
        renderTeamCharts();
    } else {
        const title = document.getElementById("lb-title");
        const lbWrap = document.getElementById("leaderboard-wrap");
        const isChartOnly = activeView === "Rookie";

        if (title) title.textContent = activeView === "Rookie" ? "Rookie Performance" : `${activeView} Leaderboard`;
        if (lbWrap) lbWrap.style.display = isChartOnly ? "none" : "";

        if (!isChartOnly) renderLeaderboard();
        renderPlayerCharts();
    }
}

// ── Trend + injury helpers ────────────────────────────────────────────────────
async function loadTrends() {
    if (activeSeason !== "2026") { trendData = {}; return; }
    try {
        const r = await fetch("/api/season-trends?season=2026");
        if (r.ok) trendData = await r.json();
    } catch (_) {}
}

async function loadStatsInjuries() {
    try {
        const r = await fetch("/api/injuries");
        if (!r.ok) return;
        const data = await r.json();
        statsInjuryMap = {};
        for (const p of (data.players || [])) {
            const key = (p.name || "").toLowerCase().replace(/[^a-z]/g, "");
            if (key) statsInjuryMap[key] = p.status;
        }
    } catch (_) {}
}

function trendArrow(espnId) {
    if (activeSeason !== "2026") return "";
    const td = trendData[espnId];
    if (!td || td.seasonAvg <= 0) return "";
    const { seasonAvg, last3Avg } = td;
    if (last3Avg > seasonAvg * 1.1) return `<span class="trend-up" title="Hot last 3 games">▲</span>`;
    if (last3Avg < seasonAvg * 0.9) return `<span class="trend-down" title="Cold last 3 games">▼</span>`;
    return `<span class="trend-flat" title="Stable">—</span>`;
}

function statsInjuryBadge(name) {
    const key = (name || "").toLowerCase().replace(/[^a-z]/g, "");
    const s = statsInjuryMap[key] || "active";
    if (s === "active") return "";
    const map = { questionable: "Q", doubtful: "D", out: "O", ir: "IR" };
    const cls = s === "ir" ? "inj-ir" : s === "out" ? "inj-o" : s === "doubtful" ? "inj-d" : "inj-q";
    return `<span class="inj-badge ${cls}">${map[s] || s.toUpperCase()}</span>`;
}

// ── Player leaderboard ────────────────────────────────────────────────────────
function renderLeaderboard() {
    const wrap = document.getElementById("leaderboard-wrap");
    if (!wrap) return;

    const pos  = activeView;
    const cols = COLS[pos];
    if (!cols) { wrap.innerHTML = ""; return; }

    const defPositions = new Set(["DE","DT","NT","LB","ILB","OLB","MLB","CB","S","FS","SS","DB","EDG"]);
    let byPos;
    if (pos === "DEF") {
        byPos = playerStats.filter(p => defPositions.has(p.pos));
    } else {
        byPos = playerStats.filter(p => p.pos === pos);
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        byPos = byPos.filter(p =>
            (p.name || "").toLowerCase().includes(q) ||
            (p.team || "").toLowerCase().includes(q)
        );
    }

    const primaryKey = { QB:"passYds", RB:"rushYds", WR:"recYds", TE:"recYds", DEF:"tackles" }[pos];
    const filtered = primaryKey ? byPos.filter(p => (p[primaryKey]||0) > 0) : byPos;
    const players = (searchQuery ? byPos : (filtered.length ? filtered : byPos)).sort((a, b) => {
        const av = parseFloat(a[lbSort.col]) || 0;
        const bv = parseFloat(b[lbSort.col]) || 0;
        return lbSort.dir === "asc" ? av - bv : bv - av;
    });

    if (!players.length) {
        wrap.innerHTML = `<p class="loading-msg">${searchQuery ? "No players match your search." : pos + " data not yet available."}</p>`;
        return;
    }

    const maxes = {};
    cols.forEach(c => { maxes[c.key] = Math.max(...players.map(p => parseFloat(p[c.key]) || 0), 1); });

    let html = `<table class="lb-table"><thead><tr>
  <th class="lb-check"></th>
  <th class="lb-rank">#</th>
  <th class="lb-photo"></th>
  <th class="lb-player">Player</th>
  ${cols.map(c => {
      const active = c.key === lbSort.col;
      const arrow  = active ? (lbSort.dir === "desc" ? " ▼" : " ▲") : "";
      return `<th class="lb-stat sortable${active?" sorted":""}" data-sort="${c.key}" data-def="${c.def}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join("")}
</tr></thead><tbody>`;

    players.forEach((p, i) => {
        const hasPlayed = (p.games || 0) > 0;
        const shot = p.espnId
            ? `<img class="lb-headshot" src="${ESPN_HEADSHOT(p.espnId)}" alt="${p.name}" onerror="this.classList.add('hidden')">`
            : `<div class="lb-headshot-blank"></div>`;
        const rankCls = i === 0 ? "rank-gold" : i === 1 ? "rank-silver" : i === 2 ? "rank-bronze" : "";
        const primaryKey2 = { QB:"passYds", RB:"rushYds", WR:"recYds", TE:"recYds", DEF:"tackles" }[pos] || "passYds";
        const primaryMax = maxes[primaryKey2] || 1;
        const primaryVal = parseFloat(p[primaryKey2]) || 0;
        const barPct = hasPlayed ? Math.round(primaryVal / primaryMax * 100) : 0;
        const isCompared = compareSet.has(String(p.espnId));

        html += `<tr class="lb-row lb-row--clickable" data-espnid="${p.espnId || ""}">
  <td class="lb-check"><input type="checkbox" class="compare-cb" data-espnid="${p.espnId || ""}" ${isCompared ? "checked" : ""}></td>
  <td class="lb-rank"><span class="rank-num ${rankCls}">${i+1}</span></td>
  <td class="lb-photo">${shot}</td>
  <td class="lb-player">
    <div class="lb-name">${p.name}${trendArrow(p.espnId)}${statsInjuryBadge(p.name)}</div>
    <div class="lb-team-row">
      <img class="lb-team-logo" src="${p.teamLogo||ESPN_LOGO(p.team)}" alt="${p.team}" onerror="this.style.display='none'">
      <span class="lb-team-abbr">${p.team}</span>
    </div>
    <div class="lb-bar-wrap"><div class="lb-bar" style="width:${barPct}%"></div></div>
  </td>
  ${cols.map(c => {
      const raw = p[c.key];
      const disp = !hasPlayed ? "—" : c.fmt(raw, p);
      return `<td class="lb-stat-cell">${disp}</td>`;
  }).join("")}
</tr>`;
    });

    html += `</tbody></table>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll("th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (lbSort.col === col) {
                lbSort.dir = lbSort.dir === "asc" ? "desc" : "asc";
            } else {
                lbSort.col = col;
                lbSort.dir = th.dataset.def || "desc";
            }
            renderLeaderboard();
        });
    });

    wrap.querySelectorAll(".lb-row--clickable").forEach(row => {
        row.addEventListener("click", e => {
            if (e.target.closest(".lb-check") || e.target.type === "checkbox") return;
            const espnId = row.dataset.espnid;
            const player = players.find(p => String(p.espnId) === espnId);
            if (player) openPlayerModal(player);
        });
    });

    wrap.querySelectorAll(".compare-cb").forEach(cb => {
        cb.addEventListener("change", e => {
            e.stopPropagation();
            const id = cb.dataset.espnid;
            if (!id) return;
            if (cb.checked) {
                if (compareSet.size >= 4) {
                    cb.checked = false;
                    const rowEl = cb.closest(".lb-row");
                    if (rowEl) { rowEl.classList.add("compare-shake"); setTimeout(() => rowEl.classList.remove("compare-shake"), 400); }
                    return;
                }
                compareSet.add(id);
            } else {
                compareSet.delete(id);
            }
            updateCompareBar();
        });
    });
}

// ── Compare bar ───────────────────────────────────────────────────────────────
function updateCompareBar() {
    let bar = document.getElementById("compare-bar");
    if (compareSet.size === 0) {
        if (bar) bar.remove();
        return;
    }
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "compare-bar";
        bar.className = "compare-bar";
        document.body.appendChild(bar);
    }
    const names = [...compareSet].map(id => {
        const p = playerStats.find(x => String(x.espnId) === id);
        return p ? p.name.split(" ").pop() : id;
    });
    bar.innerHTML = `<span class="compare-bar-label">Compare (${compareSet.size}): ${names.join(", ")}</span>
        <button class="compare-bar-btn" id="compare-go-btn">Compare ▶</button>
        <button class="compare-bar-clear" id="compare-clear-btn">✕</button>`;
    document.getElementById("compare-go-btn")?.addEventListener("click", showCompareModal);
    document.getElementById("compare-clear-btn")?.addEventListener("click", () => {
        compareSet.clear();
        document.querySelectorAll(".compare-cb").forEach(cb => { cb.checked = false; });
        updateCompareBar();
    });
}

// ── Sparkline builder ─────────────────────────────────────────────────────────
function buildSparkline(logs) {
    const pts = logs.map(l => +(l.fantasy_pts_ppr || 0));
    if (pts.length < 2) return "";
    const W = 200, H = 48, PAD = 4;
    const maxV = Math.max(...pts, 1);
    const minV = Math.min(...pts, 0);
    const range = maxV - minV || 1;
    const xStep = (W - PAD * 2) / Math.max(pts.length - 1, 1);
    const points = pts.map((v, i) => {
        const x = PAD + i * xStep;
        const y = H - PAD - ((v - minV) / range) * (H - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const lastX = PAD + (pts.length - 1) * xStep;
    const lastY = H - PAD - ((pts[pts.length - 1] - minV) / range) * (H - PAD * 2);
    return `<svg class="sparkline-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" points="${points}"/>
<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="var(--accent)"/>
</svg>`;
}

// ── Player detail modal ───────────────────────────────────────────────────────
async function openPlayerModal(player) {
    let modal = document.getElementById("player-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "player-modal";
        modal.className = "player-modal";
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="pm-overlay"><div class="pm-panel">
        <button class="pm-close" aria-label="Close">✕</button>
        <div class="pm-loading">Loading game logs…</div>
    </div></div>`;
    modal.classList.add("active");
    modal.querySelector(".pm-overlay").addEventListener("click", e => {
        if (e.target === modal.querySelector(".pm-overlay")) modal.classList.remove("active");
    });
    modal.querySelector(".pm-close").addEventListener("click", () => modal.classList.remove("active"));

    try {
        const r = await fetch(`/api/player-game-logs?espnId=${player.espnId}&season=${activeSeason}`);
        const logs = r.ok ? await r.json() : [];

        const pos = player.pos || activeView;
        const statCols = pos === "QB"
            ? [["Wk","week"],["Opp","opp_abbr"],["H/A","home_away"],["Pass Yds","passing_yds"],["TD","passing_tds"],["Rush Yds","rushing_yds"],["FP","fantasy_pts_ppr"]]
            : pos === "RB"
            ? [["Wk","week"],["Opp","opp_abbr"],["H/A","home_away"],["Rush Yds","rushing_yds"],["Rush TD","rushing_tds"],["Rec Yds","receiving_yds"],["FP","fantasy_pts_ppr"]]
            : [["Wk","week"],["Opp","opp_abbr"],["H/A","home_away"],["Rec Yds","receiving_yds"],["Rec TD","receiving_tds"],["FP","fantasy_pts_ppr"]];

        const sparkHtml = buildSparkline(logs);
        const tableRows = logs.length
            ? logs.map(l => `<tr>${statCols.map(([, k]) => `<td>${l[k] ?? "—"}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${statCols.length}" style="text-align:center;color:var(--text-dim);padding:16px">No game logs for this season.</td></tr>`;

        const panel = modal.querySelector(".pm-panel");
        panel.innerHTML = `
<button class="pm-close" aria-label="Close">✕</button>
<div class="pm-header">
    <img class="pm-headshot" src="${ESPN_HEADSHOT(player.espnId)}" alt="${player.name}" onerror="this.style.display='none'">
    <div class="pm-info">
        <div class="pm-name">${player.name}</div>
        <div class="pm-meta">${pos} · ${player.team}</div>
    </div>
</div>
${sparkHtml ? `<div class="pm-sparkline-wrap"><div class="pm-spark-label">Fantasy PPR by week</div>${sparkHtml}</div>` : ""}
<div class="pm-table-wrap">
<table class="pm-table"><thead><tr>${statCols.map(([l]) => `<th>${l}</th>`).join("")}</tr></thead>
<tbody>${tableRows}</tbody></table>
</div>`;
        panel.querySelector(".pm-close").addEventListener("click", () => modal.classList.remove("active"));
    } catch (_) {}
}

// ── Compare modal ─────────────────────────────────────────────────────────────
function showCompareModal() {
    const ids = [...compareSet];
    const comparePlayers = ids.map(id => playerStats.find(p => String(p.espnId) === id)).filter(Boolean);
    if (comparePlayers.length < 2) return;

    let modal = document.getElementById("compare-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "compare-modal";
        modal.className = "player-modal";
        document.body.appendChild(modal);
    }

    const pos = comparePlayers[0].pos;
    const metricsMap = {
        QB: [["Pass Yds","passYds"],["Pass TDs","passTDs"],["Rating","passRating"],["Rush Yds","rushYds"]],
        RB: [["Rush Yds","rushYds"],["Rush TDs","rushTDs"],["Rec","recRec"],["Rec Yds","recYds"]],
        WR: [["Rec","recRec"],["Rec Yds","recYds"],["Rec TDs","recTDs"],["YPR","ypr"]],
        TE: [["Rec","recRec"],["Rec Yds","recYds"],["Rec TDs","recTDs"],["YPR","ypr"]],
    };
    const metrics = metricsMap[pos] || metricsMap.WR;

    const tableHTML = `<table class="pm-table compare-table"><thead><tr>
<th>Metric</th>${comparePlayers.map(p => `<th>${p.name.split(" ").pop()}</th>`).join("")}
</tr></thead><tbody>
<tr><th>Team</th>${comparePlayers.map(p => `<td>${p.team}</td>`).join("")}</tr>
<tr><th>Games</th>${comparePlayers.map(p => `<td>${p.games||0}</td>`).join("")}</tr>
${metrics.map(([label, key]) => `<tr><th>${label}</th>${comparePlayers.map(p => `<td>${p[key] !== undefined ? Number(p[key]).toLocaleString() : "—"}</td>`).join("")}</tr>`).join("")}
</tbody></table>`;

    const N = metrics.length;
    const CX = 110, CY = 110, R = 82;
    const angles = metrics.map((_, i) => (i / N) * 2 * Math.PI - Math.PI / 2);
    const COLORS = ["#63b3ed","#f6ad55","#68d391","#fc8181"];
    const radarMaxes = metrics.map(([, key]) => Math.max(...comparePlayers.map(p => +(p[key]||0)), 1));
    const gridLines = [0.25, 0.5, 0.75, 1].map(pct => {
        const pts = angles.map(a => `${(CX+pct*R*Math.cos(a)).toFixed(1)},${(CY+pct*R*Math.sin(a)).toFixed(1)}`);
        return `<polygon points="${pts.join(" ")}" fill="none" stroke="var(--border)" stroke-width="0.8"/>`;
    }).join("");
    const axisLines = angles.map(a => `<line x1="${CX}" y1="${CY}" x2="${(CX+R*Math.cos(a)).toFixed(1)}" y2="${(CY+R*Math.sin(a)).toFixed(1)}" stroke="var(--border)" stroke-width="0.8"/>`).join("");
    const polygons = comparePlayers.map((p, pi) => {
        const pts = metrics.map(([, key], i) => {
            const pct = Math.min(+(p[key]||0) / radarMaxes[i], 1);
            return `${(CX+pct*R*Math.cos(angles[i])).toFixed(1)},${(CY+pct*R*Math.sin(angles[i])).toFixed(1)}`;
        });
        return `<polygon points="${pts.join(" ")}" fill="${COLORS[pi]}" fill-opacity="0.18" stroke="${COLORS[pi]}" stroke-width="2"/>`;
    }).join("");
    const labelsEl = metrics.map(([label], i) => {
        const x = CX + (R + 14) * Math.cos(angles[i]);
        const y = CY + (R + 14) * Math.sin(angles[i]);
        return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="var(--text-dim)">${label}</text>`;
    }).join("");
    const radarSVG = `<svg class="radar-svg" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">${gridLines}${axisLines}${polygons}${labelsEl}</svg>`;
    const legend = comparePlayers.map((p, i) => `<div class="radar-legend-item"><span class="radar-swatch" style="background:${COLORS[i]}"></span>${p.name.split(" ").pop()}</div>`).join("");

    modal.innerHTML = `<div class="pm-overlay"><div class="pm-panel pm-panel--wide">
<button class="pm-close" aria-label="Close">✕</button>
<div class="pm-name" style="margin-bottom:12px">Player Comparison</div>
<div class="compare-layout">
    <div class="compare-radar-wrap">${radarSVG}<div class="radar-legend">${legend}</div></div>
    <div class="pm-table-wrap">${tableHTML}</div>
</div>
</div></div>`;
    modal.classList.add("active");
    modal.querySelector(".pm-close").addEventListener("click", () => modal.classList.remove("active"));
    modal.querySelector(".pm-overlay").addEventListener("click", e => {
        if (e.target === modal.querySelector(".pm-overlay")) modal.classList.remove("active");
    });
}

// ── Team table ────────────────────────────────────────────────────────────────
function renderTeamTable() {
    const wrap = document.getElementById("team-table-wrap");
    if (!wrap) return;

    if (!teamStats.length) {
        wrap.innerHTML = `<p class="loading-msg">Team data not yet available.</p>`;
        return;
    }

    const teams = [...teamStats].sort((a, b) => {
        const av = parseFloat(a[teamSort.col]) || 0;
        const bv = parseFloat(b[teamSort.col]) || 0;
        return teamSort.dir === "asc" ? av - bv : bv - av;
    });

    const maxPPG = Math.max(...teams.map(t => parseFloat(t.ppg)||0), 1);

    let html = `<table class="lb-table"><thead><tr>
  <th class="lb-rank">#</th>
  <th class="lb-player" style="min-width:200px">Team</th>
  ${TEAM_COLS.map(c => {
      const active = c.key === teamSort.col;
      const arrow  = active ? (teamSort.dir === "desc" ? " ▼" : " ▲") : "";
      return `<th class="lb-stat sortable${active?" sorted":""}" data-sort="${c.key}" data-def="${c.def}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join("")}
</tr></thead><tbody>`;

    teams.forEach((t, i) => {
        const barPct = Math.round((parseFloat(t.ppg)||0) / maxPPG * 100);
        const rankCls = i===0?"rank-gold":i===1?"rank-silver":i===2?"rank-bronze":"";
        html += `<tr class="lb-row">
  <td class="lb-rank"><span class="rank-num ${rankCls}">${i+1}</span></td>
  <td class="lb-player">
    <div class="lb-name" style="display:flex;align-items:center;gap:8px">
      <img src="${t.logo||ESPN_LOGO(t.abbr)}" alt="${t.abbr}" style="width:28px;height:28px;object-fit:contain" onerror="this.style.display='none'">
      ${t.name}
    </div>
    <div class="lb-bar-wrap"><div class="lb-bar" style="width:${barPct}%"></div></div>
  </td>
  ${TEAM_COLS.map(c => `<td class="lb-stat-cell">${c.fmt(t[c.key])}</td>`).join("")}
</tr>`;
    });

    html += `</tbody></table>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll("th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (teamSort.col === col) {
                teamSort.dir = teamSort.dir === "asc" ? "desc" : "asc";
            } else {
                teamSort.col = col;
                teamSort.dir = th.dataset.def || "desc";
            }
            renderTeamTable();
        });
    });
}

// ── Scatter chart ─────────────────────────────────────────────────────────────
function renderScatter(container, { title, data, xKey, xLabel, yKey, yLabel, nameKey, logoFn }) {
    if (!data?.length) return;
    const xs = data.map(d => +d[xKey]||0), ys = data.map(d => +d[yKey]||0);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);

    // Pad range so points near edges are still visible
    const xPad = (xMax - xMin) * 0.08 || 1;
    const yPad = (yMax - yMin) * 0.08 || 1;
    const xLo = xMin - xPad, xHi = xMax + xPad, xRange = xHi - xLo;
    const yLo = yMin - yPad, yHi = yMax + yPad, yRange = yHi - yLo;

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

    // Grid lines + Y tick labels (5 ticks)
    const TICKS = 5;
    for (let i = 0; i <= TICKS; i++) {
        const pct = (i / TICKS) * 100;
        const val = yLo + (i / TICKS) * yRange;
        const h = document.createElement("div");
        h.className = "chart-grid-h";
        h.style.bottom = pct + "%";
        area.appendChild(h);

        const tick = document.createElement("div");
        tick.className = "chart-y-tick-val";
        tick.style.bottom = pct + "%";
        tick.textContent = formatTick(val);
        area.appendChild(tick);
    }
    // X grid lines only (ticks go below)
    for (let i = 1; i < TICKS; i++) {
        const pct = (i / TICKS) * 100;
        const v = document.createElement("div");
        v.className = "chart-grid-v";
        v.style.left = pct + "%";
        area.appendChild(v);
    }

    // Mean crosshairs + optional regression line
    const n = xs.length;
    if (n >= 3) {
        const meanX = xs.reduce((s, v) => s + v, 0) / n;
        const meanY = ys.reduce((s, v) => s + v, 0) / n;
        const meanXPct = ((meanX - xLo) / xRange) * 100;
        const meanYPct = ((meanY - yLo) / yRange) * 100;

        const hMean = document.createElement("div");
        hMean.className = "chart-mean-h";
        hMean.style.bottom = meanYPct.toFixed(1) + "%";
        area.appendChild(hMean);

        const vMean = document.createElement("div");
        vMean.className = "chart-mean-v";
        vMean.style.left = meanXPct.toFixed(1) + "%";
        area.appendChild(vMean);

        // Pearson r and regression
        let num = 0, dx2 = 0, dy2 = 0;
        for (let i = 0; i < n; i++) {
            const dx = xs[i] - meanX, dy = ys[i] - meanY;
            num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
        }
        const r = dx2 && dy2 ? num / Math.sqrt(dx2 * dy2) : 0;
        if (Math.abs(r) > 0.3 && dx2) {
            const slope = num / dx2;
            const intercept = meanY - slope * meanX;
            const y1Pct = ((intercept + slope * xLo - yLo) / yRange) * 100;
            const y2Pct = ((intercept + slope * xHi - yLo) / yRange) * 100;

            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:0";
            const rLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            rLine.setAttribute("x1", "0%");
            rLine.setAttribute("y1", (100 - y1Pct).toFixed(1) + "%");
            rLine.setAttribute("x2", "100%");
            rLine.setAttribute("y2", (100 - y2Pct).toFixed(1) + "%");
            rLine.setAttribute("stroke", "rgba(99,179,237,0.5)");
            rLine.setAttribute("stroke-width", "1.5");
            rLine.setAttribute("stroke-dasharray", "5,4");
            svg.appendChild(rLine);
            area.appendChild(svg);
        }
    }

    data.forEach(d => {
        const xPct = ((+d[xKey] - xLo) / xRange) * 100;
        const yPct = ((+d[yKey] - yLo) / yRange) * 100;
        const pt   = document.createElement("div");
        pt.className = "chart-point";
        pt.style.left   = Math.min(98, Math.max(2, xPct)) + "%";
        pt.style.bottom = Math.min(98, Math.max(2, yPct)) + "%";
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

    // X tick labels row
    const xTickRow = document.createElement("div");
    xTickRow.className = "chart-x-ticks";
    for (let i = 0; i <= TICKS; i++) {
        const val = xLo + (i / TICKS) * xRange;
        const t = document.createElement("span");
        t.className = "chart-x-tick-val";
        t.textContent = formatTick(val);
        xTickRow.appendChild(t);
    }

    const xLbl = document.createElement("div");
    xLbl.className = "chart-x-label";
    xLbl.textContent = xLabel;

    chartMain.appendChild(area);
    chartMain.appendChild(xTickRow);
    chartMain.appendChild(xLbl);
    inner.appendChild(chartMain);
    wrap.appendChild(inner);
    container.appendChild(wrap);
}

// ── Placeholder chart ─────────────────────────────────────────────────────────
function renderPlaceholder(container, { title, reason }) {
    const wrap = document.createElement("div");
    wrap.className = "scatter-wrap";

    const h3 = document.createElement("h3");
    h3.className = "chart-title";
    h3.textContent = title;
    wrap.appendChild(h3);

    const inner = document.createElement("div");
    inner.className = "chart-placeholder";
    inner.innerHTML = `<div class="chart-placeholder-icon">📊</div>
        <div class="chart-placeholder-label">${title}</div>
        <div>${reason}</div>`;
    wrap.appendChild(inner);
    container.appendChild(wrap);
}

// ── Fantasy breakdown bars (all positions) ────────────────────────────────────
const FANTASY_SEGS = {
    QB: [
        { key:"passYdsPts",  label:"Pass Yds",  color:"#3b82f6" },
        { key:"passTdsPts",  label:"Pass TDs",  color:"#22c55e" },
        { key:"rushYdsPts",  label:"Rush Yds",  color:"#f59e0b" },
        { key:"rushTdsPts",  label:"Rush TDs",  color:"#a78bfa" },
        { key:"negPlaysPts", label:"Neg Plays", color:"#ef4444" },
    ],
    RB: [
        { key:"rushYdsPts",  label:"Rush Yds",  color:"#22c55e" },
        { key:"rushTdsPts",  label:"Rush TDs",  color:"#86efac" },
        { key:"recPts",      label:"Rec (PPR)", color:"#38bdf8" },
        { key:"recYdsPts",   label:"Rec Yds",   color:"#f59e0b" },
        { key:"recTdsPts",   label:"Rec TDs",   color:"#fcd34d" },
        { key:"negPlaysPts", label:"Neg Plays", color:"#ef4444" },
    ],
    WR: [
        { key:"recPts",      label:"Rec (PPR)", color:"#38bdf8" },
        { key:"recYdsPts",   label:"Rec Yds",   color:"#f59e0b" },
        { key:"recTdsPts",   label:"Rec TDs",   color:"#fcd34d" },
        { key:"rushYdsPts",  label:"Rush Yds",  color:"#22c55e" },
        { key:"negPlaysPts", label:"Neg Plays", color:"#ef4444" },
    ],
    TE: [
        { key:"recPts",      label:"Rec (PPR)", color:"#38bdf8" },
        { key:"recYdsPts",   label:"Rec Yds",   color:"#a78bfa" },
        { key:"recTdsPts",   label:"Rec TDs",   color:"#c4b5fd" },
        { key:"negPlaysPts", label:"Neg Plays", color:"#ef4444" },
    ],
};

const fantasyBarSorts = {};

function computeFantasyRows(players, pos) {
    const CALC = {
        passYdsPts:  p => +((p.passYds || 0) * 0.04).toFixed(1),
        passTdsPts:  p => +((p.passTDs || 0) * 4).toFixed(1),
        rushYdsPts:  p => +((p.rushYds || 0) * 0.1).toFixed(1),
        rushTdsPts:  p => +((p.rushTDs || 0) * 6).toFixed(1),
        recPts:      p => +((p.recRec  || 0) * 1).toFixed(1),
        recYdsPts:   p => +((p.recYds  || 0) * 0.1).toFixed(1),
        recTdsPts:   p => +((p.recTDs  || 0) * 6).toFixed(1),
        negPlaysPts: p => +(-(p.passINT || 0) * 2 - (p.fumbleLost || 0) * 2).toFixed(1),
    };
    const segs = FANTASY_SEGS[pos] || [];
    return players.map(p => {
        const c = {};
        Object.keys(CALC).forEach(k => { c[k] = CALC[k](p); });
        const total = +segs.reduce((s, seg) => s + (c[seg.key] || 0), 0).toFixed(1);
        return { ...p, ...c, total };
    });
}

function renderFantasyBar(container, players, yr, pos) {
    const segs = FANTASY_SEGS[pos];
    if (!segs) return;
    if (!fantasyBarSorts[pos]) fantasyBarSorts[pos] = { key: "total", dir: "desc", segsOrder: [...segs] };
    else if (!fantasyBarSorts[pos].segsOrder) fantasyBarSorts[pos].segsOrder = [...segs];
    const sortState = fantasyBarSorts[pos];

    const filterFn = pos === "QB" ? (p => (p.passAtt || 0) > 0)
        : pos === "RB" ? (p => (p.rushAtt || 0) + (p.recRec || 0) > 0)
        : (p => (p.recRec || 0) > 0);
    const allRows = computeFantasyRows(players.filter(filterFn), pos);
    if (!allRows.length) return;

    const wrap = document.createElement("div");
    wrap.className = "hbar-wrap";
    wrap.dataset.chartId = `${pos.toLowerCase()}-fantasy-bar`;

    function rebuild() {
        wrap.innerHTML = "";
        const activeSegs = sortState.segsOrder;

        const h3 = document.createElement("h3");
        h3.className = "chart-title";
        const scoringLabel = pos === "QB" ? "Standard Scoring" : "PPR Scoring";
        h3.textContent = `${yr} ${pos}s — Fantasy Points Breakdown (${scoringLabel})`;
        wrap.appendChild(h3);

        const legend = document.createElement("div");
        legend.className = "hbar-legend";

        let dragSrcIdx = null;

        activeSegs.forEach((s, idx) => {
            const item = document.createElement("div");
            item.className = "hbar-legend-item" + (sortState.key === s.key ? " active" : "");
            item.draggable = true;
            item.title = `Sort by ${s.label} · drag to reorder`;

            const swatch = document.createElement("span");
            swatch.className = "hbar-legend-swatch";
            swatch.style.background = s.color;
            const lbl = document.createElement("span");
            const arrow = sortState.key === s.key ? (sortState.dir === "desc" ? " ▼" : " ▲") : "";
            lbl.textContent = s.label + arrow;
            item.appendChild(swatch);
            item.appendChild(lbl);

            item.addEventListener("click", () => {
                if (sortState.key === s.key) sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
                else { sortState.key = s.key; sortState.dir = "desc"; }
                rebuild();
            });

            item.addEventListener("dragstart", e => {
                dragSrcIdx = idx;
                e.dataTransfer.effectAllowed = "move";
                setTimeout(() => item.classList.add("dragging"), 0);
            });
            item.addEventListener("dragend", () => {
                dragSrcIdx = null;
                item.classList.remove("dragging");
                legend.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
            });
            item.addEventListener("dragover", e => {
                e.preventDefault();
                if (dragSrcIdx === null || dragSrcIdx === idx) return;
                legend.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
                item.classList.add("drag-over");
            });
            item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
            item.addEventListener("drop", e => {
                e.preventDefault();
                if (dragSrcIdx === null || dragSrcIdx === idx) return;
                const [moved] = activeSegs.splice(dragSrcIdx, 1);
                activeSegs.splice(idx, 0, moved);
                rebuild();
            });

            legend.appendChild(item);
        });

        // Non-draggable Total sort button
        const totalItem = document.createElement("div");
        totalItem.className = "hbar-legend-item" + (sortState.key === "total" ? " active" : "");
        totalItem.title = "Sort by Total";
        const totalArrow = sortState.key === "total" ? (sortState.dir === "desc" ? " ▼" : " ▲") : "";
        totalItem.innerHTML = `<span class="hbar-legend-swatch" style="background:var(--border)"></span><span>Total${totalArrow}</span>`;
        totalItem.addEventListener("click", () => {
            if (sortState.key === "total") sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
            else { sortState.key = "total"; sortState.dir = "desc"; }
            rebuild();
        });
        legend.appendChild(totalItem);
        wrap.appendChild(legend);

        const rows = [...allRows].sort((a, b) => {
            const av = a[sortState.key] ?? 0, bv = b[sortState.key] ?? 0;
            return sortState.dir === "asc" ? av - bv : bv - av;
        });

        const maxTotal = Math.max(...rows.map(r => Math.max(r.total, 1)), 1);
        const list = document.createElement("div");
        list.className = "hbar-list";

        rows.forEach(r => {
            const row = document.createElement("div");
            row.className = "hbar-row";

            const label = document.createElement("div");
            label.className = "hbar-label";
            label.innerHTML = `<img src="${r.teamLogo||ESPN_LOGO(r.team)}" style="width:13px;height:13px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none'"> <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name.split(" ").pop()}</span>`;
            row.appendChild(label);

            const track = document.createElement("div");
            track.className = "hbar-track";
            activeSegs.forEach(s => {
                const rawVal = r[s.key] || 0;
                const pct = Math.abs(rawVal) / maxTotal * 100;
                if (pct < 0.3) return;
                const seg = document.createElement("div");
                seg.className = "hbar-seg";
                seg.style.width = pct + "%";
                seg.style.background = s.color;
                seg.style.opacity = rawVal < 0 ? "0.55" : "1";
                seg.title = `${s.label}: ${rawVal > 0 ? "+" : ""}${rawVal.toFixed(1)}`;
                if (pct > 7) seg.textContent = (rawVal < 0 ? "" : "+") + rawVal.toFixed(1);
                track.appendChild(seg);
            });
            row.appendChild(track);

            const total = document.createElement("div");
            total.className = "hbar-total";
            total.style.color = r.total < 0 ? "#ef4444" : "var(--text-dim)";
            total.textContent = r.total.toFixed(1);
            row.appendChild(total);

            list.appendChild(row);
        });

        wrap.appendChild(list);
    }

    rebuild();
    container.appendChild(wrap);
}

// ── Average fantasy points per position column chart ──────────────────────────
function renderAvgFPPerPosition(container, yr) {
    const defPositions = new Set(["DE","DT","NT","LB","ILB","OLB","MLB","CB","S","FS","SS","DB","EDG"]);
    const SHOW_POS = ["QB", "RB", "WR", "TE"];

    const byPos = {};
    playerStats.forEach(p => {
        const pos = defPositions.has(p.pos) ? "DEF" : p.pos;
        if (!SHOW_POS.includes(pos)) return;
        const fp = +(p.fantasyPtsPpr || 0);
        if (fp <= 0) return;
        const g = Math.max(1, p.games || 1);
        if (!byPos[pos]) byPos[pos] = [];
        byPos[pos].push(fp / g);
    });

    const data = SHOW_POS.filter(pos => (byPos[pos]?.length || 0) >= 3).map(pos => {
        const vals = [...byPos[pos]].sort((a, b) => b - a);
        return {
            pos,
            avg:  +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1),
            top10: +(vals.slice(0, 10).reduce((s, v) => s + v, 0) / Math.min(10, vals.length)).toFixed(1),
            count: vals.length,
        };
    });

    if (data.length < 2) return;

    const wrap = document.createElement("div");
    wrap.className = "scatter-wrap";

    const h3 = document.createElement("h3");
    h3.className = "chart-title";
    h3.textContent = `${yr} — Avg Fantasy PPR Points Per Game by Position`;
    wrap.appendChild(h3);

    const POS_COLORS = { QB:"#3b82f6", RB:"#22c55e", WR:"#f59e0b", TE:"#a78bfa" };
    const maxVal = Math.max(...data.map(d => d.top10), 1);
    const W = 320, H = 160, barPad = 30;
    const spacing = (W - barPad * 2) / data.length;
    const barW = Math.min(52, spacing - 12);

    let svgInner = "";
    for (let i = 1; i <= 4; i++) {
        const yG = H - 28 - (i / 4) * (H - 52);
        const val = ((i / 4) * maxVal).toFixed(1);
        svgInner += `<line x1="${barPad}" y1="${yG.toFixed(1)}" x2="${W - barPad}" y2="${yG.toFixed(1)}" stroke="var(--border)" stroke-width="0.7"/>`;
        svgInner += `<text x="${(barPad - 3).toFixed(1)}" y="${(yG + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--text-dim)">${val}</text>`;
    }

    data.forEach((d, i) => {
        const cx   = barPad + spacing * i + spacing / 2;
        const x    = cx - barW / 2;
        const avgH  = (d.avg  / maxVal) * (H - 52);
        const top10H = (d.top10 / maxVal) * (H - 52);
        const color = POS_COLORS[d.pos] || "#63b3ed";
        svgInner += `<rect x="${x.toFixed(1)}" y="${(H - 28 - top10H).toFixed(1)}" width="${barW}" height="${top10H.toFixed(1)}" rx="3" fill="${color}" fill-opacity="0.22"/>`;
        svgInner += `<rect x="${x.toFixed(1)}" y="${(H - 28 - avgH).toFixed(1)}"   width="${barW}" height="${avgH.toFixed(1)}"   rx="3" fill="${color}" fill-opacity="0.85"/>`;
        svgInner += `<text x="${cx.toFixed(1)}" y="${(H - 28 - avgH - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text)" font-weight="600">${d.avg}</text>`;
        svgInner += `<text x="${cx.toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--text-dim)" font-weight="500">${d.pos}</text>`;
    });
    svgInner += `<text x="${(W / 2).toFixed(1)}" y="${(H - 1).toFixed(1)}" text-anchor="middle" font-size="8" fill="var(--text-dim)">darker = season avg · lighter = top-10 avg</text>`;

    const chartDiv = document.createElement("div");
    chartDiv.style.cssText = "padding:8px 0;display:flex;justify-content:center";
    chartDiv.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" xmlns="http://www.w3.org/2000/svg">${svgInner}</svg>`;
    wrap.appendChild(chartDiv);
    container.appendChild(wrap);
}

// ── Chart card drag-to-swap ───────────────────────────────────────────────────
function swapChartElements(a, b) {
    const parent = a.parentNode;
    if (!parent || parent !== b.parentNode) return;
    const aMark = document.createComment("");
    const bMark = document.createComment("");
    parent.insertBefore(aMark, a);
    parent.insertBefore(bMark, b);
    parent.insertBefore(a, bMark);
    parent.insertBefore(b, aMark);
    parent.removeChild(aMark);
    parent.removeChild(bMark);
}

function makeChartsDraggable(container) {
    let dragEl = null;

    [...container.children].forEach(el => {
        const handle = document.createElement("div");
        handle.className = "chart-drag-handle";
        handle.title = "Drag to swap";
        handle.innerHTML = "⠿";
        el.style.position = "relative";
        el.appendChild(handle);

        el.draggable = true;

        el.addEventListener("dragstart", e => {
            if (e.target.closest(".hbar-legend, .lb-table, .chart-area")) { e.preventDefault(); return; }
            dragEl = el;
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => el.classList.add("chart-dragging"), 0);
        });
        el.addEventListener("dragend", () => {
            dragEl = null;
            el.classList.remove("chart-dragging");
            container.querySelectorAll(".chart-drag-over").forEach(c => c.classList.remove("chart-drag-over"));
        });
        el.addEventListener("dragover", e => {
            if (!dragEl || dragEl === el) return;
            e.preventDefault();
            container.querySelectorAll(".chart-drag-over").forEach(c => c.classList.remove("chart-drag-over"));
            el.classList.add("chart-drag-over");
        });
        el.addEventListener("dragleave", e => {
            if (!el.contains(e.relatedTarget)) el.classList.remove("chart-drag-over");
        });
        el.addEventListener("drop", e => {
            e.preventDefault();
            if (!dragEl || dragEl === el) return;
            swapChartElements(dragEl, el);
            el.classList.remove("chart-drag-over");
        });
    });
}

// ── Player charts ─────────────────────────────────────────────────────────────
function renderPlayerCharts() {
    const container = document.getElementById("player-charts-area");
    if (!container) return;
    container.innerHTML = "";

    const yr     = activeSeason;
    const pos    = activeView;
    const logoFn = d => d.teamLogo || ESPN_LOGO(d.team);

    if (pos === "QB") {
        const qbs = playerStats.filter(p => p.pos === "QB" && p.passAtt > 10)
            .sort((a, b) => b.passYds - a.passYds).slice(0, 24)
            .map(p => ({
                ...p,
                ypa:    p.passAtt > 0 ? +(p.passYds / p.passAtt).toFixed(2) : 0,
                toRate: p.games  > 0 ? +(((p.passINT||0) + (p.fumbleLost||0)) / p.games).toFixed(2) : 0,
            }));
        if (!qbs.length) return;

        renderFantasyBar(container, qbs, yr, "QB");
        renderAvgFPPerPosition(container, yr);
        renderScatter(container, { title:`${yr} QBs — Passer Rating vs. Completion %`, data:qbs, xKey:"compPct", xLabel:"Completion %", yKey:"passRating", yLabel:"Passer Rating", nameKey:"name", logoFn });
        renderScatter(container, { title:`${yr} QBs — Completion % vs. Avg Depth of Target`, data:qbs, xKey:"compPct", xLabel:"Completion %", yKey:"ypa", yLabel:"Yards Per Attempt (aDOT proxy)", nameKey:"name", logoFn });
        renderPlaceholder(container, { title:`${yr} QBs — Offensive EPA per Drive vs. Defensive EPA per Drive`, reason:"EPA (Expected Points Added) requires play-by-play tracking data not available via Tank01 API" });
        renderPlaceholder(container, { title:`${yr} QBs — Blitz Rate vs. Pressure Rate from Blitz`, reason:"Blitz/pressure tracking requires Next Gen Stats or PFF data not available via Tank01 API" });
        renderPlaceholder(container, { title:`${yr} QBs — Net Momentum by Game Time`, reason:"Momentum tracking requires play-by-play time-series data not available via Tank01 API" });

    } else if (pos === "RB") {
        const rbs = playerStats.filter(p => p.pos === "RB" && p.rushAtt > 0).sort((a, b) => b.rushYds - a.rushYds).slice(0, 28);
        if (!rbs.length) return;

        renderFantasyBar(container, rbs, yr, "RB");
        renderAvgFPPerPosition(container, yr);
        renderScatter(container, { title:`${yr} RBs — Total Touches vs. Yards Per Carry`, data:rbs, xKey:"touches", xLabel:"Total Touches", yKey:"ypc", yLabel:"Yards Per Carry", nameKey:"name", logoFn });
        renderScatter(container, { title:`${yr} RBs — Carries vs. Targets Per Game`, data:rbs, xKey:"carPerGame", xLabel:"Carries Per Game", yKey:"tgtPerGame", yLabel:"Targets Per Game", nameKey:"name", logoFn });

    } else if (pos === "WR") {
        const wrs = playerStats.filter(p => p.pos === "WR" && p.recRec > 0).sort((a, b) => b.recYds - a.recYds).slice(0, 36);
        if (!wrs.length) return;

        renderFantasyBar(container, wrs, yr, "WR");
        renderAvgFPPerPosition(container, yr);
        renderScatter(container, { title:`${yr} WRs — Yards Per Reception vs. Receptions Per Game`, data:wrs, xKey:"ypr", xLabel:"Yards Per Reception", yKey:"recPg", yLabel:"Receptions Per Game", nameKey:"name", logoFn });
        renderScatter(container, { title:`${yr} WRs — Receiving Yards vs. Receiving TDs`, data:wrs, xKey:"recYds", xLabel:"Receiving Yards", yKey:"recTDs", yLabel:"Receiving TDs", nameKey:"name", logoFn });
        const wrsProxy = wrs.filter(p => p.targets > 4).map(p => ({
            ...p,
            ypTarget: p.targets > 0 ? +(p.recYds / p.targets).toFixed(1) : 0,
        }));
        if (wrsProxy.length >= 4)
            renderScatter(container, { title:`${yr} WRs — Yards Per Target vs. Targets Per Game`, data:wrsProxy, xKey:"tgtPerGame", xLabel:"Targets Per Game", yKey:"ypTarget", yLabel:"Yards Per Target", nameKey:"name", logoFn });
        renderPlaceholder(container, { title:`${yr} WRs — Yards Per Route Run vs. Separation Score`, reason:"Route-level separation tracking requires Next Gen Stats data not available via Tank01 API" });
        renderPlaceholder(container, { title:`${yr} WRs — Catchable Throws % vs. Avg Net Yards Per Attempt`, reason:"Catchable throw tracking requires play-by-play charting data not available via Tank01 API" });
        renderPlaceholder(container, { title:`${yr} WRs — Separation Rate vs. Catchable Target %`, reason:"Separation tracking requires Next Gen Stats data not available via Tank01 API" });

    } else if (pos === "TE") {
        const tes = playerStats.filter(p => p.pos === "TE" && p.recRec > 0).sort((a, b) => b.recYds - a.recYds).slice(0, 24);
        if (!tes.length) return;

        renderFantasyBar(container, tes, yr, "TE");
        renderAvgFPPerPosition(container, yr);
        renderScatter(container, { title:`${yr} TEs — Yards Per Reception vs. Receptions Per Game`, data:tes, xKey:"ypr", xLabel:"Yards Per Reception", yKey:"recPg", yLabel:"Receptions Per Game", nameKey:"name", logoFn });
        renderScatter(container, { title:`${yr} TEs — Receiving Yards vs. Receiving TDs`, data:tes, xKey:"recYds", xLabel:"Receiving Yards", yKey:"recTDs", yLabel:"Receiving TDs", nameKey:"name", logoFn });
        renderPlaceholder(container, { title:`${yr} TEs — Yards Per Route Run vs. Separation Score`, reason:"Route-level separation tracking requires Next Gen Stats data not available via Tank01 API" });
        renderPlaceholder(container, { title:`${yr} TEs — Catchable Throws % vs. Avg Net Yards Per Attempt`, reason:"Catchable throw tracking requires play-by-play charting data not available via Tank01 API" });
        renderPlaceholder(container, { title:`${yr} TEs — Separation Rate vs. Catchable Target %`, reason:"Separation tracking requires Next Gen Stats data not available via Tank01 API" });

    } else if (pos === "DEF") {
        const defPositions = new Set(["DE","DT","NT","LB","ILB","OLB","MLB","CB","S","FS","SS","DB","EDG"]);
        const defs = playerStats.filter(p => defPositions.has(p.pos) && (p.tackles || 0) > 0)
            .sort((a, b) => b.tackles - a.tackles).slice(0, 32);
        if (!defs.length) {
            renderPlaceholder(container, { title:"Defensive Stats", reason:"Defensive player data will be available after re-seeding with the updated seeder" });
            return;
        }
        renderScatter(container, { title:`${yr} Defense — Sacks vs. Tackles For Loss`, data:defs, xKey:"sacks", xLabel:"Sacks", yKey:"tfl", yLabel:"Tackles For Loss", nameKey:"name", logoFn });
        renderScatter(container, { title:`${yr} Defense — Total Tackles vs. Passes Defended`, data:defs, xKey:"tackles", xLabel:"Total Tackles", yKey:"pd", yLabel:"Passes Defended", nameKey:"name", logoFn });

    } else if (pos === "Rookie") {
        const rookies = playerStats.filter(p => p.draftYear === 2025 || p.draftYear === Number(activeSeason) - 1);
        if (!rookies.length) {
            renderPlaceholder(container, { title:"Rookie Performance", reason:"Draft year data will populate after re-seeding. Players drafted in 2025 will appear here." });
            return;
        }
        const rookiesWithPick = rookies.filter(p => p.draftPick > 0 && p.fantasyPtsStd > 0)
            .sort((a, b) => a.draftPick - b.draftPick);
        if (rookiesWithPick.length >= 4) {
            renderScatter(container, { title:`${yr} Rookies — Rookie Performance vs. Draft Position`, data:rookiesWithPick, xKey:"draftPick", xLabel:"Draft Pick #", yKey:"fantasyPtsStd", yLabel:"Fantasy Pts (Std)", nameKey:"name", logoFn });
        }
        const rookiesAny = rookies.filter(p => p.draftPick > 0).sort((a, b) => a.draftPick - b.draftPick);
        if (rookiesAny.length >= 4) {
            renderScatter(container, { title:`${yr} Rookies — Games Played vs. Draft Round`, data:rookiesAny, xKey:"draftRound", xLabel:"Draft Round", yKey:"games", yLabel:"Games Played", nameKey:"name", logoFn });
        }
    }

    makeChartsDraggable(container);
}

// ── Team charts ───────────────────────────────────────────────────────────────
function renderTeamCharts() {
    const container = document.getElementById("team-charts-area");
    if (!container) return;
    container.innerHTML = "";
    if (!teamStats.length) return;

    const yr     = activeSeason;
    const logoFn = d => d.logo || ESPN_LOGO(d.abbr);
    const teams  = teamStats.filter(t => t.ppg > 0);

    renderScatter(container, { title:`${yr} — Points Scored vs. Points Allowed Per Game`, data:teams, xKey:"ppg", xLabel:"Points Scored Per Game", yKey:"papg", yLabel:"Points Allowed Per Game", nameKey:"abbr", logoFn });
    renderScatter(container, { title:`${yr} — Offensive vs. Defensive Yards Per Game`, data:teamStats.filter(t => t.ypg > 0 && t.yapg > 0), xKey:"ypg", xLabel:"Yards Gained Per Game", yKey:"yapg", yLabel:"Yards Allowed Per Game", nameKey:"abbr", logoFn });
    renderPlaceholder(container, { title:`${yr} — Net Success Rate on Offensive Drives`, reason:"Drive success rate requires play-by-play data not available via Tank01 API" });
    renderPlaceholder(container, { title:`${yr} — Team Drive Success Rate vs. Takeaways Per Game`, reason:"Drive/turnover correlation requires play-by-play data not available via Tank01 API" });
    renderPlaceholder(container, { title:`${yr} — Offensive EPA per Drive vs. Defensive EPA per Drive`, reason:"EPA (Expected Points Added) requires play-by-play tracking data not available via Tank01 API" });

    makeChartsDraggable(container);
}

// ── Season selector ───────────────────────────────────────────────────────────
function initSeasonSelect() {
    document.getElementById("season-select")?.addEventListener("change", async e => {
        await loadData(e.target.value);
        updateDefaultSort();
        renderView();
        const prog = await fetchSeedProgress();
        updateSeedUI(prog);
    });
}

// ── Seed progress polling ─────────────────────────────────────────────────────
let seedPollTimer = null;

async function fetchSeedProgress() {
    try {
        const r = await fetch("/api/seed-progress");
        if (!r.ok) return null;
        return await r.json();
    } catch { return null; }
}

function updateSeedUI(prog) {
    const seedBtn   = document.getElementById("seed-btn");
    const bar       = document.getElementById("seed-progress-bar");
    const fill      = document.getElementById("seed-progress-fill");
    const statusTxt = document.getElementById("seed-status-text");
    if (!seedBtn || !prog) return;

    const pending   = prog.pendingCount ?? 0;
    const processed = prog.processedCount ?? 0;
    const total     = prog.rosterCount ?? 0;
    const running   = prog.seederRunning;
    const remaining = prog.remaining ?? 0;

    // Only show the seed button when on 2025 and there's work to do
    const show2025 = activeSeason === "2025";
    const hasPending = pending > 0 && remaining > 0 && !prog.hardStopped;
    seedBtn.classList.toggle("hidden", !show2025);

    if (!show2025) { bar?.classList.add("hidden"); if (statusTxt) statusTxt.textContent = ""; return; }

    if (running) {
        seedBtn.classList.add("running");
        seedBtn.disabled = true;
        const lbl = seedBtn.querySelector("#seed-btn-label");
        if (lbl) lbl.textContent = "Fetching…";
        bar?.classList.remove("hidden");
        const pct = total > 0 ? Math.round(processed / total * 100) : 0;
        if (fill) fill.style.width = pct + "%";
        if (statusTxt) statusTxt.textContent = `${processed}/${total} players · ${remaining} calls left`;
    } else {
        seedBtn.classList.remove("running");
        seedBtn.disabled = !hasPending;
        const lbl = seedBtn.querySelector("#seed-btn-label");
        if (lbl) lbl.textContent = hasPending ? `Fetch ${pending} logs` : pending === 0 ? "Up to date" : "Budget exhausted";
        bar?.classList.toggle("hidden", !hasPending);
        if (fill && total > 0) fill.style.width = Math.round(processed / total * 100) + "%";
        if (statusTxt) statusTxt.textContent = hasPending
            ? `${remaining} API calls remaining`
            : pending > 0 ? `Resets at 22:54 UTC` : "";
    }
}

function startSeedPolling() {
    if (seedPollTimer) return;
    seedPollTimer = setInterval(async () => {
        const prog = await fetchSeedProgress();
        if (!prog) return;
        updateSeedUI(prog);
        // When seeder finishes, reload stats and stop polling
        if (!prog.seederRunning) {
            clearInterval(seedPollTimer);
            seedPollTimer = null;
            if (activeSeason === "2025") {
                await fetch("/api/reload-db-stats", { method: "POST" }).catch(() => {});
                await loadData("2025");
                renderView();
            }
        }
    }, 3000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    initViewTabs();
    initSeasonSelect();

    const reloadBtn = document.getElementById("reload-db-btn");
    if (reloadBtn) {
        reloadBtn.addEventListener("click", async () => {
            if (activeSeason != "2025") return;
            reloadBtn.classList.add("spinning");
            reloadBtn.disabled = true;
            try {
                await fetch("/api/reload-db-stats", { method: "POST" });
                await loadData("2025");
                renderView();
            } catch (_) {}
            reloadBtn.classList.remove("spinning");
            reloadBtn.disabled = false;
        });
    }

    // Playoff toggle — syncs both buttons, reloads data for 2025
    function syncPlayoffBtns() {
        const label = includePlayoffs ? "Playoffs On" : "Playoffs Off";
        document.querySelectorAll(".playoff-toggle-btn").forEach(btn => {
            btn.textContent = label;
            btn.classList.toggle("active", includePlayoffs);
        });
    }
    async function handlePlayoffToggle() {
        includePlayoffs = !includePlayoffs;
        syncPlayoffBtns();
        if (activeSeason === "2025") {
            playerStats = [];
            await loadData("2025");
        }
        updateDefaultSort();
        renderView();
    }

    document.getElementById("playoff-toggle-btn")?.addEventListener("click", handlePlayoffToggle);
    document.getElementById("team-playoff-toggle-btn")?.addEventListener("click", handlePlayoffToggle);

    const seedBtn = document.getElementById("seed-btn");
    if (seedBtn) {
        seedBtn.addEventListener("click", async () => {
            if (seedBtn.disabled) return;
            const r = await fetch("/api/seed-remaining", { method: "POST" }).catch(() => null);
            if (!r?.ok) return;
            updateSeedUI({ seederRunning: true, pendingCount: 1, processedCount: 0, rosterCount: 1, remaining: 999 });
            startSeedPolling();
        });
    }

    const lbSearchInput = document.getElementById("lb-search");
    const lbSearchClear = document.getElementById("lb-search-clear");
    if (lbSearchInput) {
        lbSearchInput.addEventListener("input", () => {
            searchQuery = lbSearchInput.value.trim();
            if (lbSearchClear) lbSearchClear.classList.toggle("hidden", !searchQuery);
            if (activeView !== "Teams") renderLeaderboard();
        });
    }
    if (lbSearchClear) {
        lbSearchClear.addEventListener("click", () => {
            searchQuery = "";
            if (lbSearchInput) lbSearchInput.value = "";
            lbSearchClear.classList.add("hidden");
            if (activeView !== "Teams") renderLeaderboard();
        });
    }

    await loadData("2026");
    await Promise.all([loadTrends(), loadStatsInjuries()]);
    updateDefaultSort();

    const sp = new URLSearchParams(location.search);
    const spTeam = sp.get("team");
    if (spTeam) {
        searchQuery = spTeam.toUpperCase();
        if (lbSearchInput) lbSearchInput.value = searchQuery;
        if (lbSearchClear) lbSearchClear.classList.remove("hidden");
    }

    renderView();

    const spPlayer = sp.get("player");
    if (spPlayer) {
        const found = playerStats.find(p => p.name.toLowerCase() === spPlayer.toLowerCase());
        if (found) openPlayerModal(found);
    }

    // Initial seed status check
    const prog = await fetchSeedProgress();
    updateSeedUI(prog);
    if (prog?.seederRunning) startSeedPolling();
}

init();
