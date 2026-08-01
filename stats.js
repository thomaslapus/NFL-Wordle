"use strict";

// ── Utilities ─────────────────────────────────────────────────────────────────
const ESPN_LOGO = abbr =>
    `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbr || "").toLowerCase()}.png`;

function rankColor(t) {
    return `rgb(${Math.round(76+179*t)},${Math.round(175-68*t)},${Math.round(109-2*t)})`;
}

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

// ── Dummy data builders ───────────────────────────────────────────────────────
function makeTeam(id, abbr, name, conf, div, won, lost, pf, pa, offYds, defYds) {
    const g = won + lost || 17;
    return {
        id, name, abbr,
        logo:       ESPN_LOGO(abbr),
        conference: conf,
        division:   div,
        won,  lost,
        ppg:  +(pf     / g).toFixed(1),
        papg: +(pa     / g).toFixed(1),
        ypg:  +(offYds / g).toFixed(1),
        yapg: +(defYds / g).toFixed(1),
    };
}

function makePlayer({ id, name, pos, team, teamName,
    games = 17,
    passAtt = 0, passComp = 0, passYds = 0, passTDs = 0,
    rushAtt = 0, rushYds  = 0, rushTDs  = 0,
    recRec  = 0, recYds   = 0, recTDs   = 0,
}) {
    const totalYds = passYds + rushYds + recYds;
    const totalTDs = passTDs + rushTDs + recTDs;
    const g = games || 1;
    return {
        id, name, pos, team, teamName,
        teamLogo: ESPN_LOGO(team),
        games,
        passYds, passTDs, passAtt, passComp,
        compPct:  passAtt > 0 ? +(passComp / passAtt * 100).toFixed(1) : 0,
        rushYds, rushTDs, rushAtt,
        ypc:      rushAtt > 0 ? +(rushYds / rushAtt).toFixed(1) : 0,
        cpg:      +(rushAtt / g).toFixed(1),
        rushYpg:  +(rushYds  / g).toFixed(1),
        recYds, recTDs, recRec,
        recYpg:   +(recYds / g).toFixed(1),
        recPg:    +(recRec  / g).toFixed(1),
        totalYds, totalTDs,
        ypg:      +(totalYds / g).toFixed(1),
    };
}

// ── Dummy team stats — 2025 season ────────────────────────────────────────────
// makeTeam(id, abbr, name, conf, div, W, L, pf, pa, offYdsTot, defYdsTot)
const DUMMY_TEAM_STATS = [
    makeTeam( 1, "ARI", "Arizona Cardinals",      "NFC", "NFC West",  8,  9, 374, 425,  5695, 5984),
    makeTeam( 2, "ATL", "Atlanta Falcons",         "NFC", "NFC South", 8,  9, 382, 422,  5780, 5999),
    makeTeam( 3, "BAL", "Baltimore Ravens",        "AFC", "AFC North",12,  5, 456, 369,  6307, 5440),
    makeTeam( 4, "BUF", "Buffalo Bills",           "AFC", "AFC East", 13,  4, 483, 341,  6154, 5457),
    makeTeam( 5, "CAR", "Carolina Panthers",       "NFC", "NFC South", 5, 12, 309, 477,  4896, 6545),
    makeTeam( 6, "CHI", "Chicago Bears",           "NFC", "NFC North", 5, 12, 322, 465,  5015, 6443),
    makeTeam( 7, "CIN", "Cincinnati Bengals",      "AFC", "AFC North", 9,  8, 394, 418,  5967, 5984),
    makeTeam( 8, "CLE", "Cleveland Browns",        "AFC", "AFC North", 3, 14, 292, 507,  4624, 6766),
    makeTeam( 9, "DAL", "Dallas Cowboys",          "NFC", "NFC East",  7, 10, 353, 430,  5355, 6137),
    makeTeam(10, "DEN", "Denver Broncos",          "AFC", "AFC West", 10,  7, 404, 390,  5695, 5627),
    makeTeam(11, "DET", "Detroit Lions",           "NFC", "NFC North",15,  2, 531, 404,  6834, 5797),
    makeTeam(12, "GB",  "Green Bay Packers",       "NFC", "NFC North",11,  6, 428, 393,  6137, 5763),
    makeTeam(13, "HOU", "Houston Texans",          "AFC", "AFC South",10,  7, 421, 409,  6035, 5916),
    makeTeam(14, "IND", "Indianapolis Colts",      "AFC", "AFC South", 8,  9, 375, 412,  5576, 5865),
    makeTeam(15, "JAX", "Jacksonville Jaguars",    "AFC", "AFC South", 4, 13, 315, 501,  4964, 6715),
    makeTeam(16, "KC",  "Kansas City Chiefs",      "AFC", "AFC West", 15,  2, 506, 309,  6426, 5304),
    makeTeam(17, "LAC", "Los Angeles Chargers",    "AFC", "AFC West", 11,  6, 410, 390,  5814, 5678),
    makeTeam(18, "LAR", "Los Angeles Rams",        "NFC", "NFC West", 10,  7, 417, 400,  5899, 5729),
    makeTeam(19, "LV",  "Las Vegas Raiders",       "AFC", "AFC West",  4, 13, 307, 496,  4777, 6664),
    makeTeam(20, "MIA", "Miami Dolphins",          "AFC", "AFC East",  8,  9, 364, 427,  5763, 6086),
    makeTeam(21, "MIN", "Minnesota Vikings",       "NFC", "NFC North",14,  3, 459, 360,  5865, 5355),
    makeTeam(22, "NE",  "New England Patriots",    "AFC", "AFC East",  4, 13, 296, 491,  4675, 6596),
    makeTeam(23, "NO",  "New Orleans Saints",      "NFC", "NFC South", 5, 12, 332, 455,  5117, 6307),
    makeTeam(24, "NYG", "New York Giants",         "NFC", "NFC East",  3, 14, 281, 518,  4454, 6936),
    makeTeam(25, "NYJ", "New York Jets",           "AFC", "AFC East",  5, 12, 325, 469,  5066, 6409),
    makeTeam(26, "PHI", "Philadelphia Eagles",     "NFC", "NFC East", 14,  3, 510, 374,  6715, 5610),
    makeTeam(27, "PIT", "Pittsburgh Steelers",     "AFC", "AFC North",10,  7, 390, 374,  5406, 5474),
    makeTeam(28, "SEA", "Seattle Seahawks",        "NFC", "NFC West", 10,  7, 413, 420,  5933, 5967),
    makeTeam(29, "SF",  "San Francisco 49ers",     "NFC", "NFC West",  6, 11, 358, 449,  5474, 6256),
    makeTeam(30, "TB",  "Tampa Bay Buccaneers",    "NFC", "NFC South",10,  7, 426, 406,  6086, 5814),
    makeTeam(31, "TEN", "Tennessee Titans",        "AFC", "AFC South", 3, 14, 285, 512,  4556, 6817),
    makeTeam(32, "WAS", "Washington Commanders",   "NFC", "NFC East", 12,  5, 433, 391,  5746, 5576),
];

// ── Dummy player stats — 2025 season ─────────────────────────────────────────
const DUMMY_PLAYER_STATS = [
    // ── QBs ──────────────────────────────────────────────────────────────────
    makePlayer({ id:  1, name: "Lamar Jackson",   pos: "QB", team: "BAL", teamName: "Baltimore Ravens",      games: 16, passAtt: 545, passComp: 367, passYds: 4172, passTDs: 41, rushAtt: 101, rushYds: 1206, rushTDs:  4 }),
    makePlayer({ id:  2, name: "Jared Goff",       pos: "QB", team: "DET", teamName: "Detroit Lions",         games: 17, passAtt: 546, passComp: 378, passYds: 4629, passTDs: 37, rushAtt:  22, rushYds:   28, rushTDs:  1 }),
    makePlayer({ id:  3, name: "Sam Darnold",      pos: "QB", team: "MIN", teamName: "Minnesota Vikings",     games: 16, passAtt: 546, passComp: 368, passYds: 4319, passTDs: 35, rushAtt:  52, rushYds:   92, rushTDs:  2 }),
    makePlayer({ id:  4, name: "Josh Allen",       pos: "QB", team: "BUF", teamName: "Buffalo Bills",         games: 17, passAtt: 494, passComp: 326, passYds: 3731, passTDs: 29, rushAtt: 120, rushYds:  531, rushTDs: 12 }),
    makePlayer({ id:  5, name: "Bo Nix",           pos: "QB", team: "DEN", teamName: "Denver Broncos",        games: 17, passAtt: 568, passComp: 375, passYds: 3775, passTDs: 29, rushAtt:  80, rushYds:  462, rushTDs:  5 }),
    makePlayer({ id:  6, name: "Patrick Mahomes",  pos: "QB", team: "KC",  teamName: "Kansas City Chiefs",    games: 17, passAtt: 572, passComp: 380, passYds: 3928, passTDs: 26, rushAtt:  75, rushYds:  356, rushTDs:  4 }),
    makePlayer({ id:  7, name: "Jayden Daniels",   pos: "QB", team: "WAS", teamName: "Washington Commanders", games: 16, passAtt: 472, passComp: 321, passYds: 3568, passTDs: 25, rushAtt: 104, rushYds:  864, rushTDs:  6 }),
    makePlayer({ id:  8, name: "Jalen Hurts",      pos: "QB", team: "PHI", teamName: "Philadelphia Eagles",   games: 13, passAtt: 387, passComp: 257, passYds: 2903, passTDs: 22, rushAtt:  97, rushYds:  726, rushTDs: 14 }),
    makePlayer({ id:  9, name: "Caleb Williams",   pos: "QB", team: "CHI", teamName: "Chicago Bears",         games: 16, passAtt: 514, passComp: 320, passYds: 3541, passTDs: 20, rushAtt:  61, rushYds:  385, rushTDs:  4 }),
    makePlayer({ id: 10, name: "Jordan Love",      pos: "QB", team: "GB",  teamName: "Green Bay Packers",     games: 16, passAtt: 501, passComp: 333, passYds: 3952, passTDs: 25, rushAtt:  44, rushYds:  198, rushTDs:  3 }),

    // ── RBs ──────────────────────────────────────────────────────────────────
    makePlayer({ id: 11, name: "Saquon Barkley",  pos: "RB", team: "PHI", teamName: "Philadelphia Eagles",  games: 16, rushAtt: 345, rushYds: 2005, rushTDs: 13, recRec:  35, recYds:  278, recTDs: 0 }),
    makePlayer({ id: 12, name: "Derrick Henry",   pos: "RB", team: "BAL", teamName: "Baltimore Ravens",      games: 16, rushAtt: 303, rushYds: 1921, rushTDs: 16, recRec:  19, recYds:  162, recTDs: 0 }),
    makePlayer({ id: 13, name: "Jahmyr Gibbs",    pos: "RB", team: "DET", teamName: "Detroit Lions",         games: 17, rushAtt: 234, rushYds: 1389, rushTDs: 12, recRec:  48, recYds:  364, recTDs: 3 }),
    makePlayer({ id: 14, name: "Josh Jacobs",     pos: "RB", team: "GB",  teamName: "Green Bay Packers",     games: 17, rushAtt: 266, rushYds: 1329, rushTDs: 15, recRec:  40, recYds:  365, recTDs: 1 }),
    makePlayer({ id: 15, name: "Kyren Williams",  pos: "RB", team: "LAR", teamName: "Los Angeles Rams",      games: 16, rushAtt: 228, rushYds: 1144, rushTDs: 12, recRec:  40, recYds:  294, recTDs: 2 }),
    makePlayer({ id: 16, name: "Jonathan Taylor", pos: "RB", team: "IND", teamName: "Indianapolis Colts",    games: 16, rushAtt: 228, rushYds: 1069, rushTDs:  7, recRec:  26, recYds:  186, recTDs: 1 }),
    makePlayer({ id: 17, name: "Joe Mixon",       pos: "RB", team: "HOU", teamName: "Houston Texans",        games: 16, rushAtt: 216, rushYds: 1035, rushTDs:  8, recRec:  42, recYds:  285, recTDs: 2 }),
    makePlayer({ id: 18, name: "James Cook",      pos: "RB", team: "BUF", teamName: "Buffalo Bills",         games: 17, rushAtt: 220, rushYds: 1009, rushTDs:  6, recRec:  35, recYds:  228, recTDs: 2 }),
    makePlayer({ id: 19, name: "De'Von Achane",   pos: "RB", team: "MIA", teamName: "Miami Dolphins",        games: 14, rushAtt: 173, rushYds:  906, rushTDs: 11, recRec:  68, recYds:  577, recTDs: 2 }),
    makePlayer({ id: 20, name: "Isiah Pacheco",   pos: "RB", team: "KC",  teamName: "Kansas City Chiefs",    games: 13, rushAtt: 168, rushYds:  839, rushTDs:  9, recRec:  18, recYds:  124, recTDs: 1 }),
    makePlayer({ id: 21, name: "Chuba Hubbard",   pos: "RB", team: "CAR", teamName: "Carolina Panthers",     games: 16, rushAtt: 201, rushYds:  910, rushTDs:  5, recRec:  37, recYds:  248, recTDs: 1 }),

    // ── WRs ──────────────────────────────────────────────────────────────────
    makePlayer({ id: 22, name: "Ja'Marr Chase",       pos: "WR", team: "CIN", teamName: "Cincinnati Bengals",   games: 17, recRec: 100, recYds: 1708, recTDs: 17 }),
    makePlayer({ id: 23, name: "Brian Thomas Jr.",    pos: "WR", team: "JAX", teamName: "Jacksonville Jaguars",  games: 17, recRec:  87, recYds: 1282, recTDs: 10 }),
    makePlayer({ id: 24, name: "Malik Nabers",        pos: "WR", team: "NYG", teamName: "New York Giants",       games: 16, recRec: 109, recYds: 1204, recTDs:  7 }),
    makePlayer({ id: 25, name: "CeeDee Lamb",         pos: "WR", team: "DAL", teamName: "Dallas Cowboys",        games: 16, recRec:  93, recYds: 1194, recTDs: 11 }),
    makePlayer({ id: 26, name: "Amon-Ra St. Brown",   pos: "WR", team: "DET", teamName: "Detroit Lions",         games: 16, recRec: 109, recYds: 1163, recTDs: 10 }),
    makePlayer({ id: 27, name: "Jordan Addison",      pos: "WR", team: "MIN", teamName: "Minnesota Vikings",     games: 16, recRec:  76, recYds: 1062, recTDs: 10 }),
    makePlayer({ id: 28, name: "Drake London",        pos: "WR", team: "ATL", teamName: "Atlanta Falcons",       games: 16, recRec:  93, recYds: 1055, recTDs:  9 }),
    makePlayer({ id: 29, name: "Puka Nacua",          pos: "WR", team: "LAR", teamName: "Los Angeles Rams",      games: 16, recRec:  88, recYds: 1025, recTDs:  6 }),
    makePlayer({ id: 30, name: "DJ Moore",            pos: "WR", team: "CHI", teamName: "Chicago Bears",         games: 17, recRec:  84, recYds:  987, recTDs:  8 }),
    makePlayer({ id: 31, name: "Tyreek Hill",         pos: "WR", team: "MIA", teamName: "Miami Dolphins",        games: 12, recRec:  81, recYds:  959, recTDs:  4 }),
    makePlayer({ id: 32, name: "Tank Dell",           pos: "WR", team: "HOU", teamName: "Houston Texans",        games: 14, recRec:  72, recYds:  886, recTDs:  7 }),

    // ── TEs ──────────────────────────────────────────────────────────────────
    makePlayer({ id: 33, name: "Brock Bowers",  pos: "TE", team: "LV",  teamName: "Las Vegas Raiders",      games: 17, recRec: 112, recYds: 1194, recTDs: 5 }),
    makePlayer({ id: 34, name: "Trey McBride",  pos: "TE", team: "ARI", teamName: "Arizona Cardinals",      games: 17, recRec: 111, recYds: 1146, recTDs: 8 }),
    makePlayer({ id: 35, name: "George Kittle", pos: "TE", team: "SF",  teamName: "San Francisco 49ers",    games: 16, recRec:  82, recYds: 1051, recTDs: 5 }),
    makePlayer({ id: 36, name: "Sam LaPorta",   pos: "TE", team: "DET", teamName: "Detroit Lions",          games: 17, recRec:  71, recYds:  746, recTDs: 5 }),
    makePlayer({ id: 37, name: "Jake Ferguson", pos: "TE", team: "DAL", teamName: "Dallas Cowboys",         games: 16, recRec:  64, recYds:  634, recTDs: 5 }),
];

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

// ── Data load ─────────────────────────────────────────────────────────────────
async function loadData() {
    teamStats   = DUMMY_TEAM_STATS;
    playerStats = DUMMY_PLAYER_STATS;
    return false; // never "still loading"
}

// ── Player comparison ─────────────────────────────────────────────────────────
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

    renderScatter(container, {
        title:  "2025 — Yards Per Game vs. Points Per Game",
        data:   teamStats, xKey: "ypg", xLabel: "Yards Per Game",
        yKey:   "ppg",                  yLabel: "Points Per Game",
        nameKey: "abbr", logoFn,
    });
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
    await loadData();
    initTeamTable();
    buildTeamCharts();
    initCompare();
    buildRBCharts();
}

init();
