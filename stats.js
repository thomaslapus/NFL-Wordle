// ============================================================
// Mid Stats — NFL Stats page logic
// ============================================================

const LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

// ============================================================
// Data
// ============================================================

const TEAM_DATA = [
    { abbr:"KC",  name:"Kansas City Chiefs",       ppg:28.3, ypg:387, yapg:312, papg:20.1, sos:0.518 },
    { abbr:"DET", name:"Detroit Lions",            ppg:29.1, ypg:398, yapg:308, papg:19.8, sos:0.488 },
    { abbr:"MIA", name:"Miami Dolphins",           ppg:27.9, ypg:391, yapg:325, papg:21.9, sos:0.504 },
    { abbr:"BUF", name:"Buffalo Bills",            ppg:27.1, ypg:369, yapg:329, papg:22.8, sos:0.509 },
    { abbr:"SF",  name:"San Francisco 49ers",      ppg:26.7, ypg:378, yapg:318, papg:21.4, sos:0.502 },
    { abbr:"BAL", name:"Baltimore Ravens",         ppg:26.3, ypg:371, yapg:322, papg:22.3, sos:0.515 },
    { abbr:"WAS", name:"Washington Commanders",    ppg:26.1, ypg:374, yapg:320, papg:21.6, sos:0.522 },
    { abbr:"PHI", name:"Philadelphia Eagles",      ppg:25.8, ypg:362, yapg:334, papg:23.2, sos:0.511 },
    { abbr:"CIN", name:"Cincinnati Bengals",       ppg:25.1, ypg:364, yapg:338, papg:23.7, sos:0.499 },
    { abbr:"HOU", name:"Houston Texans",           ppg:24.8, ypg:361, yapg:333, papg:23.1, sos:0.521 },
    { abbr:"ATL", name:"Atlanta Falcons",          ppg:24.7, ypg:358, yapg:332, papg:21.8, sos:0.498 },
    { abbr:"MIN", name:"Minnesota Vikings",        ppg:24.6, ypg:358, yapg:336, papg:23.4, sos:0.503 },
    { abbr:"DAL", name:"Dallas Cowboys",           ppg:24.2, ypg:348, yapg:341, papg:24.6, sos:0.497 },
    { abbr:"LAC", name:"Los Angeles Chargers",     ppg:23.6, ypg:352, yapg:341, papg:24.2, sos:0.516 },
    { abbr:"LAR", name:"Los Angeles Rams",         ppg:23.8, ypg:356, yapg:345, papg:25.1, sos:0.506 },
    { abbr:"GB",  name:"Green Bay Packers",        ppg:23.4, ypg:344, yapg:348, papg:24.9, sos:0.501 },
    { abbr:"PIT", name:"Pittsburgh Steelers",      ppg:22.8, ypg:341, yapg:351, papg:25.9, sos:0.508 },
    { abbr:"SEA", name:"Seattle Seahawks",         ppg:22.7, ypg:339, yapg:355, papg:26.2, sos:0.495 },
    { abbr:"IND", name:"Indianapolis Colts",       ppg:22.4, ypg:336, yapg:354, papg:26.5, sos:0.497 },
    { abbr:"TB",  name:"Tampa Bay Buccaneers",     ppg:21.9, ypg:331, yapg:362, papg:27.1, sos:0.507 },
    { abbr:"ATL", name:"Atlanta Falcons",          ppg:22.1, ypg:335, yapg:358, papg:26.8, sos:0.512 },
    { abbr:"NYJ", name:"New York Jets",            ppg:21.5, ypg:332, yapg:361, papg:27.8, sos:0.514 },
    { abbr:"DEN", name:"Denver Broncos",           ppg:21.3, ypg:328, yapg:365, papg:27.4, sos:0.509 },
    { abbr:"CLE", name:"Cleveland Browns",         ppg:20.1, ypg:322, yapg:369, papg:28.7, sos:0.511 },
    { abbr:"CHI", name:"Chicago Bears",            ppg:20.5, ypg:325, yapg:367, papg:28.1, sos:0.493 },
    { abbr:"NO",  name:"New Orleans Saints",       ppg:20.8, ypg:318, yapg:371, papg:28.3, sos:0.494 },
    { abbr:"ARI", name:"Arizona Cardinals",        ppg:19.7, ypg:312, yapg:378, papg:29.1, sos:0.492 },
    { abbr:"JAX", name:"Jacksonville Jaguars",     ppg:19.4, ypg:309, yapg:381, papg:29.4, sos:0.503 },
    { abbr:"LV",  name:"Las Vegas Raiders",        ppg:18.9, ypg:305, yapg:384, papg:29.8, sos:0.498 },
    { abbr:"CAR", name:"Carolina Panthers",        ppg:18.2, ypg:298, yapg:389, papg:30.7, sos:0.486 },
    { abbr:"NYG", name:"New York Giants",          ppg:17.5, ypg:284, yapg:402, papg:31.8, sos:0.484 },
    { abbr:"NE",  name:"New England Patriots",     ppg:16.9, ypg:278, yapg:408, papg:32.4, sos:0.479 },
];

const RB_DATA = [
    { name:"Christian McCaffrey", team:"SF",  ypc:5.4, cpg:17.8, ypg:96.1, tds:14, games:16 },
    { name:"Saquon Barkley",      team:"PHI", ypc:5.1, cpg:19.2, ypg:98.0, tds:12, games:17 },
    { name:"Derrick Henry",       team:"BAL", ypc:4.8, cpg:20.1, ypg:96.5, tds:11, games:17 },
    { name:"De'Von Achane",       team:"MIA", ypc:5.8, cpg:12.4, ypg:72.0, tds:10, games:14 },
    { name:"Jahmyr Gibbs",        team:"DET", ypc:5.2, cpg:14.3, ypg:74.4, tds:10, games:16 },
    { name:"Bijan Robinson",      team:"ATL", ypc:4.9, cpg:16.5, ypg:80.8, tds:9,  games:16 },
    { name:"Kyren Williams",      team:"LAR", ypc:4.7, cpg:17.0, ypg:79.9, tds:11, games:15 },
    { name:"James Cook",          team:"BUF", ypc:5.0, cpg:14.8, ypg:74.0, tds:8,  games:16 },
    { name:"Josh Jacobs",         team:"GB",  ypc:4.4, cpg:17.6, ypg:77.4, tds:7,  games:17 },
    { name:"Joe Mixon",           team:"HOU", ypc:4.6, cpg:15.9, ypg:73.1, tds:9,  games:15 },
    { name:"Breece Hall",         team:"NYJ", ypc:4.5, cpg:16.2, ypg:72.9, tds:7,  games:16 },
    { name:"David Montgomery",    team:"DET", ypc:4.3, cpg:13.8, ypg:59.3, tds:8,  games:16 },
    { name:"Kenneth Walker III",  team:"SEA", ypc:4.2, cpg:16.0, ypg:67.2, tds:6,  games:15 },
    { name:"Javonte Williams",    team:"DEN", ypc:4.1, cpg:14.5, ypg:59.5, tds:5,  games:14 },
    { name:"Tony Pollard",        team:"TEN", ypc:4.4, cpg:13.2, ypg:58.1, tds:5,  games:16 },
    { name:"Travis Etienne",      team:"JAX", ypc:4.0, cpg:14.9, ypg:59.6, tds:5,  games:15 },
    { name:"Aaron Jones",         team:"MIN", ypc:4.3, cpg:12.7, ypg:54.6, tds:6,  games:16 },
    { name:"Isiah Pacheco",       team:"KC",  ypc:4.2, cpg:14.1, ypg:59.2, tds:7,  games:14 },
    { name:"Raheem Mostert",      team:"MIA", ypc:4.6, cpg:11.3, ypg:52.0, tds:6,  games:13 },
    { name:"D'Andre Swift",       team:"CHI", ypc:4.1, cpg:13.5, ypg:55.4, tds:4,  games:16 },
    { name:"Rachaad White",       team:"TB",  ypc:3.9, cpg:13.8, ypg:53.8, tds:5,  games:17 },
    { name:"Chase Brown",         team:"CIN", ypc:4.3, cpg:11.8, ypg:50.7, tds:4,  games:15 },
    { name:"Zamir White",         team:"LV",  ypc:3.8, cpg:14.2, ypg:54.0, tds:4,  games:16 },
    { name:"Kareem Hunt",         team:"CLE", ypc:4.0, cpg:12.4, ypg:49.6, tds:4,  games:14 },
    { name:"Zack Moss",           team:"IND", ypc:3.9, cpg:13.1, ypg:51.1, tds:4,  games:15 },
    { name:"Tyler Allgeier",      team:"ATL", ypc:4.1, cpg:10.8, ypg:44.3, tds:3,  games:16 },
    { name:"AJ Dillon",           team:"GB",  ypc:3.7, cpg:10.2, ypg:37.7, tds:3,  games:15 },
    { name:"Jerome Ford",         team:"CLE", ypc:4.2, cpg:9.6,  ypg:40.3, tds:3,  games:14 },
    { name:"Tyjae Spears",        team:"TEN", ypc:4.4, cpg:8.9,  ypg:39.2, tds:2,  games:15 },
    { name:"Rhamondre Stevenson", team:"NE",  ypc:3.6, cpg:12.8, ypg:46.1, tds:2,  games:16 },
];

// ============================================================
// Utilities
// ============================================================

function simplifyPosition(pos) {
    if (!pos) return "";
    if (["DE","DT","NT"].includes(pos)) return "DL";
    if (["CB","S","FS","SS"].includes(pos)) return "DB";
    if (["OT","OG","C","OL","G","T"].includes(pos)) return "OL";
    return pos;
}

// Seed-based deterministic "random" for dummy stats
function seededStat(id, mult, min, max) {
    const seed = String(id).split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
    return min + ((seed * mult) % 1000) / 1000 * (max - min);
}

function getDummyStats(playerId, position) {
    const id = playerId || "000";
    const ranges = {
        QB: { yards:[2400,4900], tds:[14,42], ypp:[6.4,9.6], games:[9,17] },
        RB: { yards:[180,1750],  tds:[2,17],  ypp:[3.3,6.2], games:[7,17] },
        WR: { yards:[280,1900],  tds:[2,15],  ypp:[8.4,17.5],games:[9,17] },
        TE: { yards:[110,1080],  tds:[2,11],  ypp:[7.1,14.4],games:[8,17] },
        DL: { yards:[0,50],      tds:[0,2],   ypp:[0,0],     games:[8,17] },
        LB: { yards:[0,80],      tds:[0,2],   ypp:[0,0],     games:[9,17] },
        DB: { yards:[0,60],      tds:[0,2],   ypp:[0,0],     games:[9,17] },
        K:  { yards:[0,0],       tds:[0,0],   ypp:[0,0],     games:[10,17] },
        OL: { yards:[0,0],       tds:[0,0],   ypp:[0,0],     games:[8,17] },
    };
    const r = ranges[position] || ranges.RB;
    return {
        yards:       Math.round(seededStat(id, 37, r.yards[0], r.yards[1])),
        tds:         Math.round(seededStat(id, 13, r.tds[0],   r.tds[1])),
        yardsPerPlay: Math.round(seededStat(id, 7,  r.ypp[0],   r.ypp[1]) * 10) / 10,
        gamesPlayed: Math.round(seededStat(id, 3,  r.games[0], r.games[1])),
    };
}

// Interpolate green → red based on rank (0 = best, 1 = worst)
function rankColor(t) {
    const r = Math.round(76  + 179 * t);
    const g = Math.round(175 -  68 * t);
    const b = Math.round(109 -   2 * t);
    return `rgb(${r},${g},${b})`;
}

// Parse filter expressions like ">25", "<350", "KC"
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

// ============================================================
// Tab switching
// ============================================================

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
            const parentPanel = btn.closest(".page-panel");
            parentPanel.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
            parentPanel.querySelectorAll(".sub-panel").forEach(p => p.classList.add("hidden"));
            btn.classList.add("active");
            document.getElementById(btn.dataset.panel).classList.remove("hidden");
        });
    });
}

// ============================================================
// Player comparison
// ============================================================

let allPlayers = [];

async function initPlayerData() {
    try {
        const res = await fetch("/api/players");
        if (!res.ok) throw new Error("Server error");
        allPlayers = await res.json();
    } catch {
        allPlayers = [];
        document.getElementById("player-selects").innerHTML =
            '<p class="loading-note" style="color:var(--danger)">Could not load players — check server connection.</p>';
        return;
    }
    initCompare();
}

function initCompare() {
    const posSelect = document.getElementById("pos-select");
    posSelect.addEventListener("change", buildPlayerSelects);
    buildPlayerSelects();
}

function buildPlayerSelects() {
    const pos = document.getElementById("pos-select").value;
    const filtered = allPlayers
        .filter(p => simplifyPosition(p.position) === pos || p.position === pos)
        .slice(0, 300);

    const wrap = document.getElementById("player-selects");
    wrap.innerHTML = "";

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
            opt.value = p.player_id;
            opt.textContent = p.full_name;
            opt.dataset.team = p.team || "—";
            sel.appendChild(opt);
        });

        if (filtered[i]) sel.value = filtered[i].player_id;
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

    // Gather selected players
    const rows = [];
    sels.forEach(sel => {
        if (!sel.value) return;
        const opt = sel.querySelector(`option[value="${sel.value}"]`);
        const player = allPlayers.find(p => p.player_id === sel.value);
        if (!player) return;
        rows.push({
            name:  player.full_name,
            team:  player.team || "—",
            stats: getDummyStats(player.player_id, pos),
        });
    });

    if (!rows.length) { wrap.innerHTML = ""; return; }

    const STAT_DEFS = [
        { key:"yards",        label:"2025 Total Yards",   higher:true  },
        { key:"tds",          label:"2025 Touchdowns",    higher:true  },
        { key:"yardsPerPlay", label:"2025 Yds / Play",    higher:true  },
        { key:"gamesPlayed",  label:"2025 Games Played",  higher:true  },
    ];

    // Build HTML table
    let html = `<div class="compare-table-wrap"><table class="compare-table">
    <thead><tr>
        <th>Player</th><th>Team</th>
        ${STAT_DEFS.map(s => `<th class="stat-col">${s.label}</th>`).join("")}
    </tr></thead><tbody>`;

    rows.forEach(row => {
        html += `<tr>
            <td class="player-name-cell">${row.name}</td>
            <td class="player-team-cell"><img src="${LOGO(row.team)}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:4px" onerror="this.style.display='none'">${row.team}</td>`;

        STAT_DEFS.forEach(def => {
            // Rank this player among all selected for this stat
            const vals = rows.map(r => r.stats[def.key]);
            const sorted = [...vals].sort((a, b) => def.higher ? b - a : a - b);
            const rank = sorted.indexOf(row.stats[def.key]);
            const t = rows.length === 1 ? 0 : rank / (rows.length - 1);
            const bg = rankColor(t);
            const val = def.key === "yardsPerPlay"
                ? row.stats[def.key].toFixed(1)
                : row.stats[def.key];
            html += `<td class="stat-cell" style="background:${bg};color:#fff">${val}</td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
}

// ============================================================
// Scatter charts
// ============================================================

function renderScatter(container, { title, data, xKey, xLabel, yKey, yLabel, nameKey, teamKey }) {
    const xs = data.map(d => d[xKey]);
    const ys = data.map(d => d[yKey]);
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

    // Y axis label
    const yLbl = document.createElement("div");
    yLbl.className = "chart-y-label";
    yLbl.textContent = yLabel;
    inner.appendChild(yLbl);

    const main = document.createElement("div");
    main.className = "chart-main";

    const area = document.createElement("div");
    area.className = "chart-area";

    // Grid lines
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

    // Data points
    data.forEach(d => {
        const xPct = 5 + ((d[xKey] - xMin) / xRange) * 88;
        const yPct = 5 + ((d[yKey] - yMin) / yRange) * 88;

        const pt = document.createElement("div");
        pt.className = "chart-point";
        pt.style.left   = xPct + "%";
        pt.style.bottom = yPct + "%";
        pt.title = `${d[nameKey]} (${d[teamKey]})\n${xLabel}: ${d[xKey]}\n${yLabel}: ${d[yKey]}`;

        const img = document.createElement("img");
        img.className = "point-logo";
        img.src = LOGO(d[teamKey]);
        img.alt = d[teamKey];
        img.onerror = function () { this.style.opacity = "0"; };

        const name = document.createElement("span");
        name.className = "point-name";
        // Last name only to save space
        name.textContent = d[nameKey].split(" ").slice(-1)[0];

        pt.appendChild(img);
        pt.appendChild(name);
        area.appendChild(pt);
    });

    const xLbl = document.createElement("div");
    xLbl.className = "chart-x-label";
    xLbl.textContent = xLabel;

    main.appendChild(area);
    main.appendChild(xLbl);
    inner.appendChild(main);
    wrap.appendChild(inner);
    container.appendChild(wrap);
}

function buildRBCharts() {
    const container = document.getElementById("rb-charts");
    container.innerHTML = "";

    renderScatter(container, {
        title:   "Yards Per Carry vs. Carries Per Game",
        data:    RB_DATA,
        xKey:    "ypc",   xLabel: "Yards Per Carry",
        yKey:    "cpg",   yLabel: "Carries Per Game",
        nameKey: "name",  teamKey: "team",
    });

    renderScatter(container, {
        title:   "Total Yards vs. Touchdowns",
        data:    RB_DATA,
        xKey:    "tds",   xLabel: "Touchdowns",
        yKey:    "ypg",   yLabel: "Rushing Yards Per Game",
        nameKey: "name",  teamKey: "team",
    });

    renderScatter(container, {
        title:   "Yards Per Game vs. Games Played",
        data:    RB_DATA,
        xKey:    "games", xLabel: "Games Played",
        yKey:    "ypg",   yLabel: "Yards Per Game",
        nameKey: "name",  teamKey: "team",
    });
}

function buildTeamCharts() {
    const container = document.getElementById("team-charts");
    container.innerHTML = "";

    renderScatter(container, {
        title:   "Offense vs. Defense — Points Per Game",
        data:    TEAM_DATA,
        xKey:    "ppg",   xLabel: "Points Scored Per Game",
        yKey:    "papg",  yLabel: "Points Allowed Per Game",
        nameKey: "abbr",  teamKey: "abbr",
    });

    renderScatter(container, {
        title:   "Offense vs. Defense — Yards Per Game",
        data:    TEAM_DATA,
        xKey:    "ypg",   xLabel: "Yards Gained Per Game",
        yKey:    "yapg",  yLabel: "Yards Allowed Per Game",
        nameKey: "abbr",  teamKey: "abbr",
    });

    renderScatter(container, {
        title:   "Points Scored vs. Yards Gained Per Game",
        data:    TEAM_DATA,
        xKey:    "ypg",   xLabel: "Yards Per Game",
        yKey:    "ppg",   yLabel: "Points Per Game",
        nameKey: "abbr",  teamKey: "abbr",
    });
}

// ============================================================
// Team rankings table
// ============================================================

let sortCol = "ppg", sortDir = "desc";
let filterVals = {};

function buildTeamTable() {
    const tbody = document.getElementById("team-tbody");

    // Sort
    const sorted = [...TEAM_DATA].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol];
        return sortDir === "asc" ? av - bv : bv - av;
    });

    // Filter
    const filtered = sorted.filter(t => {
        return Object.entries(filterVals).every(([col, expr]) => {
            const val = col === "name" ? t.name : t[col];
            return matchesFilter(val, expr);
        });
    });

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td>
                <div class="team-cell">
                    <img class="team-logo-sm" src="${LOGO(t.abbr)}" alt="${t.abbr}" onerror="this.style.opacity='0'">
                    <div>
                        <div class="team-name">${t.name}</div>
                        <div class="team-abbr">${t.abbr}</div>
                    </div>
                </div>
            </td>
            <td>${t.ppg.toFixed(1)}</td>
            <td>${t.ypg}</td>
            <td>${t.yapg}</td>
            <td>${t.papg.toFixed(1)}</td>
            <td>${t.sos.toFixed(3)}</td>
        </tr>
    `).join("");

    // Update sort icons
    document.querySelectorAll(".sortable").forEach(th => {
        th.classList.remove("asc", "desc");
        if (th.dataset.col === sortCol) th.classList.add(sortDir);
    });
}

function initTeamTable() {
    document.querySelectorAll(".sortable").forEach(th => {
        th.addEventListener("click", () => {
            if (sortCol === th.dataset.col) {
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
            const col = inp.dataset.col;
            filterVals[col] = inp.value;
            buildTeamTable();
        });
    });

    buildTeamTable();
}

// ============================================================
// Init
// ============================================================

initTabs();
initPlayerData();
buildRBCharts();
buildTeamCharts();
initTeamTable();
