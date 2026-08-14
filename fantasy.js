/* ============================================================
   Fantasy page — rankings, PPR scoring, position filter
   ============================================================ */

/* ── Player data ──────────────────────────────────────────────
   rawPts: season total fantasy pts at HALF-PPR (baseline)
   recSeason: total receptions for the season (used to adjust PPR)
   g: games played
   stats: display strings for expanded stat row
   ──────────────────────────────────────────────────────────── */
const PLAYERS = [
    // QBs — PPR multiplier doesn't apply (no reception scoring for QBs)
    { name:"Lamar Jackson",     pos:"QB", team:"BAL", rawPts:475.5, recSeason:0,  g:16,
      stats:{ "Comp%":"67.4%","Pass Yds":"4,172","Pass TD":"41","Rush Yds":"1,206","Rush TD":"4","INT":"4" } },
    { name:"Jalen Hurts",       pos:"QB", team:"PHI", rawPts:365.3, recSeason:0,  g:13,
      stats:{ "Comp%":"68.9%","Pass Yds":"3,102","Pass TD":"28","Rush Yds":"891", "Rush TD":"14","INT":"3" } },
    { name:"Josh Allen",        pos:"QB", team:"BUF", rawPts:448.8, recSeason:0,  g:17,
      stats:{ "Comp%":"65.2%","Pass Yds":"4,531","Pass TD":"37","Rush Yds":"531", "Rush TD":"12","INT":"7" } },
    { name:"Jayden Daniels",    pos:"QB", team:"WAS", rawPts:421.6, recSeason:0,  g:17,
      stats:{ "Comp%":"69.1%","Pass Yds":"3,568","Pass TD":"25","Rush Yds":"864", "Rush TD":"6", "INT":"5" } },
    { name:"Bo Nix",            pos:"QB", team:"DEN", rawPts:392.7, recSeason:0,  g:17,
      stats:{ "Comp%":"66.7%","Pass Yds":"4,001","Pass TD":"29","Rush Yds":"412", "Rush TD":"5", "INT":"8" } },
    { name:"Patrick Mahomes",   pos:"QB", team:"KC",  rawPts:380.8, recSeason:0,  g:17,
      stats:{ "Comp%":"67.8%","Pass Yds":"4,183","Pass TD":"31","Rush Yds":"176", "Rush TD":"2", "INT":"8" } },
    { name:"Sam Darnold",       pos:"QB", team:"MIN", rawPts:334.4, recSeason:0,  g:16,
      stats:{ "Comp%":"64.1%","Pass Yds":"4,319","Pass TD":"35","Rush Yds":"92",  "Rush TD":"2", "INT":"12" } },
    { name:"Jared Goff",        pos:"QB", team:"DET", rawPts:341.7, recSeason:0,  g:17,
      stats:{ "Comp%":"70.4%","Pass Yds":"4,629","Pass TD":"37","Rush Yds":"28",  "Rush TD":"1", "INT":"9" } },
    { name:"Caleb Williams",    pos:"QB", team:"CHI", rawPts:333.2, recSeason:0,  g:17,
      stats:{ "Comp%":"64.3%","Pass Yds":"3,541","Pass TD":"22","Rush Yds":"308", "Rush TD":"4", "INT":"9" } },
    { name:"Baker Mayfield",    pos:"QB", team:"TB",  rawPts:326.4, recSeason:0,  g:17,
      stats:{ "Comp%":"65.8%","Pass Yds":"4,041","Pass TD":"30","Rush Yds":"82",  "Rush TD":"1", "INT":"9" } },

    // RBs — recSeason matters
    { name:"Saquon Barkley",    pos:"RB", team:"PHI", rawPts:323.2, recSeason:35,  g:16,
      stats:{ "Rush Att":"335","Rush Yds":"2,005","Rush TD":"13","Rec":"35","Rec Yds":"278","Rec TD":"0" } },
    { name:"Derrick Henry",     pos:"RB", team:"BAL", rawPts:313.8, recSeason:19,  g:16,
      stats:{ "Rush Att":"326","Rush Yds":"1,921","Rush TD":"16","Rec":"19","Rec Yds":"162","Rec TD":"0" } },
    { name:"Jahmyr Gibbs",      pos:"RB", team:"DET", rawPts:289.3, recSeason:48,  g:17,
      stats:{ "Rush Att":"221","Rush Yds":"1,389","Rush TD":"12","Rec":"48","Rec Yds":"364","Rec TD":"3" } },
    { name:"Josh Jacobs",       pos:"RB", team:"GB",  rawPts:285.4, recSeason:40,  g:17,
      stats:{ "Rush Att":"276","Rush Yds":"1,329","Rush TD":"15","Rec":"40","Rec Yds":"365","Rec TD":"1" } },
    { name:"Kyren Williams",    pos:"RB", team:"LAR", rawPts:254.4, recSeason:44,  g:16,
      stats:{ "Rush Att":"252","Rush Yds":"1,242","Rush TD":"12","Rec":"44","Rec Yds":"312","Rec TD":"2" } },
    { name:"De'Von Achane",     pos:"RB", team:"MIA", rawPts:215.6, recSeason:62,  g:14,
      stats:{ "Rush Att":"194","Rush Yds":"1,109","Rush TD":"8", "Rec":"62","Rec Yds":"449","Rec TD":"3" } },
    { name:"Joe Mixon",         pos:"RB", team:"HOU", rawPts:251.6, recSeason:37,  g:17,
      stats:{ "Rush Att":"241","Rush Yds":"1,184","Rush TD":"10","Rec":"37","Rec Yds":"289","Rec TD":"2" } },
    { name:"James Cook",        pos:"RB", team:"BUF", rawPts:243.1, recSeason:51,  g:17,
      stats:{ "Rush Att":"222","Rush Yds":"1,009","Rush TD":"9", "Rec":"51","Rec Yds":"421","Rec TD":"2" } },
    { name:"Bijan Robinson",    pos:"RB", team:"ATL", rawPts:222.4, recSeason:54,  g:16,
      stats:{ "Rush Att":"231","Rush Yds":"1,116","Rush TD":"8", "Rec":"54","Rec Yds":"366","Rec TD":"2" } },
    { name:"Isiah Pacheco",     pos:"RB", team:"KC",  rawPts:217.6, recSeason:28,  g:17,
      stats:{ "Rush Att":"228","Rush Yds":"1,028","Rush TD":"9", "Rec":"28","Rec Yds":"201","Rec TD":"1" } },
    { name:"Jonathan Taylor",   pos:"RB", team:"IND", rawPts:181.5, recSeason:24,  g:15,
      stats:{ "Rush Att":"208","Rush Yds":"1,004","Rush TD":"8", "Rec":"24","Rec Yds":"198","Rec TD":"1" } },

    // WRs
    { name:"Ja'Marr Chase",     pos:"WR", team:"CIN", rawPts:322.8, recSeason:100, g:17,
      stats:{ "Rec":"100","Rec Yds":"1,708","Rec TD":"17","Tgts":"148","YPR":"17.1","Catch%":"67.6%" } },
    { name:"CeeDee Lamb",       pos:"WR", team:"DAL", rawPts:231.9, recSeason:93,  g:16,
      stats:{ "Rec":"93", "Rec Yds":"1,194","Rec TD":"11","Tgts":"137","YPR":"12.8","Catch%":"67.9%" } },
    { name:"Malik Nabers",      pos:"WR", team:"NYG", rawPts:216.9, recSeason:109, g:16,
      stats:{ "Rec":"109","Rec Yds":"1,204","Rec TD":"7", "Tgts":"158","YPR":"11.0","Catch%":"69.0%" } },
    { name:"Brian Thomas Jr.",  pos:"WR", team:"JAX", rawPts:231.7, recSeason:87,  g:17,
      stats:{ "Rec":"87", "Rec Yds":"1,282","Rec TD":"10","Tgts":"121","YPR":"14.7","Catch%":"71.9%" } },
    { name:"Justin Jefferson",  pos:"WR", team:"MIN", rawPts:226.1, recSeason:91,  g:17,
      stats:{ "Rec":"91", "Rec Yds":"1,244","Rec TD":"9", "Tgts":"130","YPR":"13.7","Catch%":"70.0%" } },
    { name:"Puka Nacua",        pos:"WR", team:"LAR", rawPts:219.3, recSeason:108, g:17,
      stats:{ "Rec":"108","Rec Yds":"1,212","Rec TD":"7", "Tgts":"148","YPR":"11.2","Catch%":"73.0%" } },
    { name:"Amon-Ra St. Brown", pos:"WR", team:"DET", rawPts:215.9, recSeason:97,  g:17,
      stats:{ "Rec":"97", "Rec Yds":"1,056","Rec TD":"8", "Tgts":"127","YPR":"10.9","Catch%":"76.4%" } },
    { name:"Tyreek Hill",       pos:"WR", team:"MIA", rawPts:196.8, recSeason:81,  g:16,
      stats:{ "Rec":"81", "Rec Yds":"1,182","Rec TD":"8", "Tgts":"122","YPR":"14.6","Catch%":"66.4%" } },
    { name:"Davante Adams",     pos:"WR", team:"LV",  rawPts:190.4, recSeason:80,  g:16,
      stats:{ "Rec":"80", "Rec Yds":"1,012","Rec TD":"9", "Tgts":"115","YPR":"12.7","Catch%":"69.6%" } },
    { name:"Rashee Rice",       pos:"WR", team:"KC",  rawPts:198.9, recSeason:90,  g:17,
      stats:{ "Rec":"90", "Rec Yds":"1,054","Rec TD":"7", "Tgts":"125","YPR":"11.7","Catch%":"72.0%" } },
    { name:"Mike Evans",        pos:"WR", team:"TB",  rawPts:184.0, recSeason:78,  g:16,
      stats:{ "Rec":"78", "Rec Yds":"1,044","Rec TD":"9", "Tgts":"110","YPR":"13.4","Catch%":"70.9%" } },

    // TEs
    { name:"Trey McBride",      pos:"TE", team:"ARI", rawPts:218.1, recSeason:111, g:17,
      stats:{ "Rec":"111","Rec Yds":"1,146","Rec TD":"8","Tgts":"148","YPR":"10.3","Catch%":"75.0%" } },
    { name:"Brock Bowers",      pos:"TE", team:"LV",  rawPts:205.4, recSeason:112, g:17,
      stats:{ "Rec":"112","Rec Yds":"1,194","Rec TD":"5","Tgts":"150","YPR":"10.7","Catch%":"74.7%" } },
    { name:"Sam LaPorta",       pos:"TE", team:"DET", rawPts:193.8, recSeason:84,  g:17,
      stats:{ "Rec":"84", "Rec Yds":"991", "Rec TD":"7","Tgts":"117","YPR":"11.8","Catch%":"71.8%" } },
    { name:"George Kittle",     pos:"TE", team:"SF",  rawPts:176.1, recSeason:82,  g:16,
      stats:{ "Rec":"82", "Rec Yds":"1,051","Rec TD":"5","Tgts":"110","YPR":"12.8","Catch%":"74.5%" } },
    { name:"T.J. Hockenson",    pos:"TE", team:"MIN", rawPts:163.2, recSeason:77,  g:16,
      stats:{ "Rec":"77", "Rec Yds":"842", "Rec TD":"6","Tgts":"108","YPR":"10.9","Catch%":"71.3%" } },
];

// Active player list — replaced by API data when available, falls back to PLAYERS
let players = PLAYERS;

// Convert a /api/player-stats entry into the PLAYERS format
function apiPlayerToFantasy(p) {
    const rawPts = +(
        (p.passYds || 0) * 0.04 +
        (p.passTDs || 0) * 4 +
        (p.rushYds || 0) * 0.1 +
        (p.rushTDs || 0) * 6 +
        (p.recYds  || 0) * 0.1 +
        (p.recTDs  || 0) * 6 +
        (p.recRec  || 0) * 0.5   // half-PPR baseline
    ).toFixed(1);

    const stats = {};
    if (p.pos === "QB") {
        stats["Comp%"]    = (p.compPct || 0) + "%";
        stats["Pass Yds"] = Number(p.passYds || 0).toLocaleString();
        stats["Pass TD"]  = p.passTDs || 0;
        stats["Rush Yds"] = Number(p.rushYds || 0).toLocaleString();
        stats["Rush TD"]  = p.rushTDs || 0;
    } else if (p.pos === "RB" || p.pos === "FB") {
        stats["Rush Att"] = p.rushAtt || 0;
        stats["Rush Yds"] = Number(p.rushYds || 0).toLocaleString();
        stats["Rush TD"]  = p.rushTDs || 0;
        stats["Rec"]      = p.recRec || 0;
        stats["Rec Yds"]  = Number(p.recYds || 0).toLocaleString();
        stats["Rec TD"]   = p.recTDs || 0;
    } else {
        const ypr = p.recRec > 0 ? (p.recYds / p.recRec).toFixed(1) : "0.0";
        stats["Rec"]     = p.recRec || 0;
        stats["Rec Yds"] = Number(p.recYds || 0).toLocaleString();
        stats["Rec TD"]  = p.recTDs || 0;
        stats["YPR"]     = ypr;
    }

    return {
        name:      p.name,
        pos:       p.pos === "FB" ? "RB" : p.pos,
        team:      p.team,
        espnId:    p.espnId ?? "",
        rawPts:    +rawPts,
        recSeason: p.recRec || 0,
        g:         p.games || 1,
        stats,
    };
}

/* rawPts is at half-PPR (0.5/rec). To convert:
   full PPR  → add recSeason × 0.5
   no PPR    → subtract recSeason × 0.5                          */
function computeFppg(player, pprMult) {
    const halfPPR_total = player.rawPts;
    const halfPPR_rec   = player.recSeason * 0.5;
    const full_rec      = player.recSeason * pprMult;
    const adjusted      = halfPPR_total - halfPPR_rec + full_rec;
    return +(adjusted / player.g).toFixed(1);
}

/* ── State ─────────────────────────────────────────────────── */
let currentPPR    = 1;      // default: full PPR
let currentPos    = "ALL";
let currentSeason = "2026";

/* ── Pos color map ──────────────────────────────────────────── */
const POS_COLOR = { QB:"qb", RB:"rb", WR:"wr", TE:"te" };

/* ── Injury data ──────────────────────────────────────────── */
let injuryMap = {}; // normalized-name → status string

async function loadInjuryData() {
    try {
        const res = await fetch("/api/injuries");
        if (!res.ok) return;
        const data = await res.json();
        injuryMap = {};
        for (const p of (data.players || [])) {
            const key = (p.name || "").toLowerCase().replace(/[^a-z]/g,"");
            if (key) injuryMap[key] = p.status;
        }
    } catch (_) {}
}

function getInjuryStatus(name) {
    const key = (name || "").toLowerCase().replace(/[^a-z]/g,"");
    return injuryMap[key] || "active";
}

function injuryBadge(name) {
    const s = getInjuryStatus(name);
    if (s === "active") return "";
    const map = { questionable:"Q", doubtful:"D", out:"OUT", ir:"IR" };
    const cls = s === "ir" ? "inj-ir" : s === "out" ? "inj-out" : s === "doubtful" ? "inj-doubt" : "inj-q";
    return `<span class="inj-badge ${cls}">${map[s] || s.toUpperCase()}</span>`;
}

/* ── Column definitions per position ────────────────────────── */
function getRankingCols(pos) {
    const base = [
        { label:"FPPG",     fn: p => p.fppg.toFixed(1) },
        { label:"G",        fn: p => p.g ?? "—" },
    ];
    const qb = [
        { label:"Comp%",    fn: p => p.stats["Comp%"]    ?? "—" },
        { label:"Pass Yds", fn: p => p.stats["Pass Yds"] ?? "—" },
        { label:"Pass TD",  fn: p => p.stats["Pass TD"]  ?? "—" },
        { label:"INT",      fn: p => p.stats["INT"]      ?? "—" },
        { label:"Rush Yds", fn: p => p.stats["Rush Yds"] ?? "—" },
        { label:"Rush TD",  fn: p => p.stats["Rush TD"]  ?? "—" },
    ];
    const rb = [
        { label:"Carries",  fn: p => p.stats["Rush Att"] ?? "—" },
        { label:"Rush Yds", fn: p => p.stats["Rush Yds"] ?? "—" },
        { label:"Rush TD",  fn: p => p.stats["Rush TD"]  ?? "—" },
        { label:"Rec",      fn: p => p.stats["Rec"]      ?? "—" },
        { label:"Rec Yds",  fn: p => p.stats["Rec Yds"]  ?? "—" },
        { label:"Rec TD",   fn: p => p.stats["Rec TD"]   ?? "—" },
    ];
    const wr = [
        { label:"Tgts",     fn: p => p.stats["Tgts"]    ?? "—" },
        { label:"Rec",      fn: p => p.stats["Rec"]      ?? "—" },
        { label:"Rec Yds",  fn: p => p.stats["Rec Yds"]  ?? "—" },
        { label:"Rec TD",   fn: p => p.stats["Rec TD"]   ?? "—" },
        { label:"YPR",      fn: p => p.stats["YPR"]      ?? "—" },
        { label:"Catch%",   fn: p => p.stats["Catch%"]   ?? "—" },
    ];
    const all = [
        { label:"Pass Yds", fn: p => p.stats["Pass Yds"] ?? "—" },
        { label:"Pass TD",  fn: p => p.stats["Pass TD"]  ?? "—" },
        { label:"Rush Yds", fn: p => p.stats["Rush Yds"] ?? "—" },
        { label:"Rush TD",  fn: p => p.stats["Rush TD"]  ?? "—" },
        { label:"Rec",      fn: p => p.stats["Rec"]      ?? "—" },
        { label:"Rec Yds",  fn: p => p.stats["Rec Yds"]  ?? "—" },
        { label:"Rec TD",   fn: p => p.stats["Rec TD"]   ?? "—" },
    ];
    return { QB:[...base,...qb], RB:[...base,...rb], WR:[...base,...wr], TE:[...base,...wr] }[pos] ?? [...base,...all];
}

/* ── Rankings table ─────────────────────────────────────────── */
function renderRankings() {
    const container = document.getElementById("rankings-all-body");
    if (!container) return;

    let list = players.filter(p => currentPos === "ALL" || p.pos === currentPos);
    list = list.map(p => ({ ...p, fppg: computeFppg(p, currentPPR) }))
               .sort((a, b) => b.fppg - a.fppg);

    if (!list.length) {
        container.innerHTML = `<p class="loading-note" style="padding:16px">No data available</p>`;
        return;
    }

    const cols = getRankingCols(currentPos);
    container.innerHTML = buildFantasyTable(list, cols, (p, i) => {
        const shot = p.espnId
            ? `<img class="rank-headshot" src="https://a.espncdn.com/i/headshots/nfl/players/full/${p.espnId}.png" onerror="this.style.display='none'">`
            : `<div class="rank-headshot-blank"></div>`;
        const numCls = i < 3 ? "top3" : "";
        return `<tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
  <td class="rt-rank"><span class="rank-num ${numCls}">${i + 1}</span></td>
  <td class="rt-photo">${shot}</td>
  <td class="rt-player">
    <div class="rank-name">${p.name}${injuryBadge(p.name)}</div>
    <div class="rank-team">${p.team}</div>
  </td>
  <td class="rt-pos"><span class="rg-pos ${POS_COLOR[p.pos]}">${p.pos}</span></td>
  ${cols.map(c => `<td class="rt-num">${c.fn(p)}</td>`).join("")}
</tr>`;
    });
}

function buildFantasyTable(list, cols, rowFn) {
    return `<table class="rankings-table">
<thead><tr>
  <th class="rt-rank">#</th>
  <th class="rt-photo"></th>
  <th class="rt-player">Player</th>
  <th class="rt-pos">Pos</th>
  ${cols.map(c => `<th class="rt-num">${c.label}</th>`).join("")}
</tr></thead><tbody>
${list.map((p, i) => rowFn(p, i)).join("\n")}
</tbody></table>`;
}

/* ── Last Week table (10 blank rows) ────────────────────────── */
const LAST_WEEK_POS_COLS = {
    QB: [{ label:"FP", fn:()=>"—" }, { label:"Pass Yds",fn:()=>"—" }, { label:"Pass TD",fn:()=>"—" }, { label:"Rush Yds",fn:()=>"—" }],
    RB: [{ label:"FP", fn:()=>"—" }, { label:"Rush Yds",fn:()=>"—" }, { label:"Rush TD",fn:()=>"—" }, { label:"Rec",fn:()=>"—" }, { label:"Rec Yds",fn:()=>"—" }],
    WR: [{ label:"FP", fn:()=>"—" }, { label:"Rec",fn:()=>"—" }, { label:"Rec Yds",fn:()=>"—" }, { label:"Rec TD",fn:()=>"—" }],
    TE: [{ label:"FP", fn:()=>"—" }, { label:"Rec",fn:()=>"—" }, { label:"Rec Yds",fn:()=>"—" }, { label:"Rec TD",fn:()=>"—" }],
};

function renderLastWeekTable(pos) {
    const el = document.getElementById("top10-last");
    if (!el) return;
    const cols = LAST_WEEK_POS_COLS[pos] || LAST_WEEK_POS_COLS.QB;
    const blankRows = Array.from({ length: 10 }, (_, i) => `<tr class="${i%2===0?"row-even":"row-odd"}">
  <td class="rt-rank"><span class="rank-num">${i+1}</span></td>
  <td class="rt-photo"><div class="rank-headshot-blank"></div></td>
  <td class="rt-player"><div class="rank-name" style="color:var(--text-dim)">—</div><div class="rank-team">—</div></td>
  <td class="rt-pos">—</td>
  ${cols.map(() => `<td class="rt-num" style="color:var(--text-dim)">—</td>`).join("")}
</tr>`).join("\n");

    el.innerHTML = `<table class="rankings-table">
<thead><tr>
  <th class="rt-rank">#</th><th class="rt-photo"></th>
  <th class="rt-player">Player</th><th class="rt-pos">Pos</th>
  ${cols.map(c=>`<th class="rt-num">${c.label}</th>`).join("")}
</tr></thead><tbody>${blankRows}</tbody></table>`;
}

/* ── Projected table (getNFLProjections data) ───────────────── */
let projectionData = []; // loaded from /api/projections

const PROJ_POS_COLS = {
    QB: [{ label:"Proj Pts", fn:p=>p.pts }, { label:"Pass Yds",fn:p=>p.stats?.["Pass Yds"]||"—" }, { label:"Pass TD",fn:p=>p.stats?.["Pass TD"]||"—" }, { label:"Rush Yds",fn:p=>p.stats?.["Rush Yds"]||"—" }],
    RB: [{ label:"Proj Pts", fn:p=>p.pts }, { label:"Rush Yds",fn:p=>p.stats?.["Rush Yds"]||"—" }, { label:"Rush TD",fn:p=>p.stats?.["Rush TD"]||"—" }, { label:"Rec",fn:p=>p.stats?.["Rec"]||"—" }, { label:"Rec Yds",fn:p=>p.stats?.["Rec Yds"]||"—" }],
    WR: [{ label:"Proj Pts", fn:p=>p.pts }, { label:"Rec",fn:p=>p.stats?.["Rec"]||"—" }, { label:"Rec Yds",fn:p=>p.stats?.["Rec Yds"]||"—" }, { label:"Rec TD",fn:p=>p.stats?.["Rec TD"]||"—" }],
    TE: [{ label:"Proj Pts", fn:p=>p.pts }, { label:"Rec",fn:p=>p.stats?.["Rec"]||"—" }, { label:"Rec Yds",fn:p=>p.stats?.["Rec Yds"]||"—" }, { label:"Rec TD",fn:p=>p.stats?.["Rec TD"]||"—" }],
};

function normalizeProjectionPlayer(raw) {
    const pos = (raw.pos ?? raw.position ?? raw.fantasyPosition ?? "").toUpperCase();
    const pts  = +(raw.fantasyPoints ?? raw.projPts ?? raw.pts ?? raw.projectedPoints ?? 0).toFixed(1);
    const stats = {};
    // Try to pull relevant stats from the projection object
    const py = +(raw.passYds ?? raw.passingYards ?? 0);
    const pt = +(raw.passTD ?? raw.passTDs ?? 0);
    const ry = +(raw.rushYds ?? raw.rushingYards ?? 0);
    const rt = +(raw.rushTD ?? raw.rushTDs ?? 0);
    const rec = +(raw.rec ?? raw.receptions ?? raw.catches ?? 0);
    const rcy = +(raw.recYds ?? raw.receivingYards ?? 0);
    const rct = +(raw.recTD ?? raw.recTDs ?? 0);
    if (py > 0 || pt > 0) { stats["Pass Yds"] = Math.round(py); stats["Pass TD"] = pt; }
    if (ry > 0 || rt > 0) { stats["Rush Yds"] = Math.round(ry); stats["Rush TD"] = rt; }
    if (rec > 0 || rcy > 0) { stats["Rec"] = rec; stats["Rec Yds"] = Math.round(rcy); stats["Rec TD"] = rct; }
    return {
        name:   (raw.longName ?? raw.fullName ?? raw.playerName ?? raw.name ?? "").trim(),
        team:   (raw.teamAbv ?? raw.team ?? "—").toUpperCase(),
        pos,
        espnId: raw.espnID ?? raw.espnId ?? "",
        pts,
        stats,
    };
}

function renderProjectionsTable(pos) {
    const el = document.getElementById("top10-proj");
    if (!el) return;
    const cols = PROJ_POS_COLS[pos] || PROJ_POS_COLS.QB;

    if (!projectionData.length) {
        // Show 10 blank placeholder rows
        el.innerHTML = `<table class="rankings-table">
<thead><tr>
  <th class="rt-rank">#</th><th class="rt-photo"></th>
  <th class="rt-player">Player</th><th class="rt-pos">Pos</th>
  ${cols.map(c=>`<th class="rt-num">${c.label}</th>`).join("")}
</tr></thead><tbody>
${Array.from({length:10},(_,i)=>`<tr class="${i%2===0?"row-even":"row-odd"}">
  <td class="rt-rank"><span class="rank-num">${i+1}</span></td>
  <td class="rt-photo"><div class="rank-headshot-blank"></div></td>
  <td class="rt-player"><div class="rank-name" style="color:var(--text-dim)">—</div><div class="rank-team">—</div></td>
  <td class="rt-pos">—</td>
  ${cols.map(()=>`<td class="rt-num" style="color:var(--text-dim)">—</td>`).join("")}
</tr>`).join("\n")}
</tbody></table>`;
        return;
    }

    const filtered = projectionData.filter(p => p.pos === pos).slice(0, 10);
    if (!filtered.length) { el.innerHTML = `<p class="loading-note" style="padding:16px">No projections for ${pos}</p>`; return; }

    el.innerHTML = `<table class="rankings-table">
<thead><tr>
  <th class="rt-rank">#</th><th class="rt-photo"></th>
  <th class="rt-player">Player</th><th class="rt-pos">Pos</th>
  ${cols.map(c=>`<th class="rt-num">${c.label}</th>`).join("")}
</tr></thead><tbody>
${filtered.map((p,i)=>{
  const shot = p.espnId
      ? `<img class="rank-headshot" src="https://a.espncdn.com/i/headshots/nfl/players/full/${p.espnId}.png" onerror="this.style.display='none'">`
      : `<div class="rank-headshot-blank"></div>`;
  const numCls = i<3?"top3":"";
  return `<tr class="${i%2===0?"row-even":"row-odd"}">
  <td class="rt-rank"><span class="rank-num ${numCls}">${i+1}</span></td>
  <td class="rt-photo">${shot}</td>
  <td class="rt-player">
    <div class="rank-name">${p.name}${injuryBadge(p.name)}</div>
    <div class="rank-team">${p.team}</div>
  </td>
  <td class="rt-pos"><span class="rg-pos ${POS_COLOR[p.pos]}">${p.pos}</span></td>
  ${cols.map(c=>`<td class="rt-num">${c.fn(p)}</td>`).join("")}
</tr>`;}).join("\n")}
</tbody></table>`;
}

/* ── Weekly pos tab init (controls last week + projected boxes) ── */
let activeLastPos = "QB";
let activeProjPos = "QB";

function initWeeklyPosTabs() {
    document.querySelectorAll(".weekly-pos-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const listKey = btn.dataset.list;
            const pos     = btn.dataset.pos;
            document.querySelectorAll(`.weekly-pos-btn[data-list="${listKey}"]`)
                .forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            if (listKey === "last") { activeLastPos = pos; renderLastWeekTable(pos); }
            else                   { activeProjPos = pos; renderProjectionsTable(pos); }
        });
    });
}

/* ── Scoring label ──────────────────────────────────────────── */
function updateScoringLabel() {
    const labels = { 1:"Full PPR · by Fantasy Pts/Game", 0.5:"Half PPR · by Fantasy Pts/Game", 0:"No PPR · by Fantasy Pts/Game" };
    const el = document.getElementById("scoring-label");
    if (el) el.textContent = labels[currentPPR] ?? "";
    const title = document.getElementById("rankings-title");
    if (title) title.textContent = `${currentSeason} Season Rankings`;
}

/* ── Rank controls ───────────────────────────────────────────── */
function initRankControls() {
    // Season dropdown
    document.getElementById("season-select")?.addEventListener("change", async e => {
        currentSeason = e.target.value;
        if (currentSeason === "2025") {
            players = PLAYERS;
        } else {
            try {
                const res = await fetch("/api/player-stats");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        const KEEP = new Set(["QB","RB","WR","TE","FB"]);
                        // Include ALL skill players — zeros are valid for current preseason
                        const mapped = data.filter(p => KEEP.has(p.pos)).map(apiPlayerToFantasy);
                        players = mapped.length > 0 ? mapped : PLAYERS;
                    } else players = PLAYERS;
                } else players = PLAYERS;
            } catch (_) { players = PLAYERS; }
        }
        updateScoringLabel();
        renderRankings();
    });

    // PPR dropdown
    document.getElementById("ppr-select")?.addEventListener("change", e => {
        currentPPR = parseFloat(e.target.value);
        updateScoringLabel();
        renderRankings();
    });

    // Position filter buttons
    document.querySelectorAll(".pos-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".pos-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentPos = btn.dataset.pos;
            renderRankings();
        });
    });
}

/* ── Page tabs ──────────────────────────────────────────────── */
function initPageTabs() {
    document.querySelectorAll(".page-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".page-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".page-panel").forEach(p => p.classList.add("hidden"));
            tab.classList.add("active");
            document.getElementById(tab.dataset.panel)?.classList.remove("hidden");
        });
    });
}

/* ── Platform tabs (My Team) ─────────────────────────────────── */
function initPlatformTabs() {
    document.querySelectorAll(".plat-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".plat-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".link-form").forEach(f => f.classList.add("hidden"));
            btn.classList.add("active");
            const platform = btn.dataset.platform;
            document.getElementById(`link-form-${platform}`)?.classList.remove("hidden");
        });
    });
}

function initConnectButtons() {
    document.getElementById("link-sleeper-btn")?.addEventListener("click", () => {
        const id = document.getElementById("sleeper-league-id").value.trim();
        if (!id) { alert("Please enter a League ID."); return; }
        alert(`Sleeper league connection coming soon.\nLeague ID: ${id}`);
    });
    document.getElementById("link-espn-btn")?.addEventListener("click", () => {
        const id = document.getElementById("espn-league-id").value.trim();
        if (!id) { alert("Please enter a League ID."); return; }
        alert(`ESPN league connection coming soon.\nLeague ID: ${id}`);
    });
    document.getElementById("link-yahoo-btn")?.addEventListener("click", () => {
        alert("Yahoo integration coming soon — OAuth support in progress.");
    });
}

/* ── Init ───────────────────────────────────────────────────── */
async function init() {
    initPageTabs();
    initPlatformTabs();
    initConnectButtons();
    initRankControls();
    initWeeklyPosTabs();
    updateScoringLabel();

    // Load injury data
    await loadInjuryData().catch(() => {});

    // Try to load 2026 API player stats
    try {
        const res = await fetch("/api/player-stats");
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const KEEP = new Set(["QB","RB","WR","TE","FB"]);
                // Include all skill players — zeros are valid during preseason
                const mapped = data.filter(p => KEEP.has(p.pos)).map(apiPlayerToFantasy);
                if (mapped.length > 0) players = mapped;
            }
        }
    } catch (_) { /* use PLAYERS fallback */ }

    renderRankings();

    // Render last week — 10 blank rows (no data yet)
    renderLastWeekTable("QB");

    // Load projections and render projected table
    try {
        const res = await fetch("/api/projections");
        if (res.ok) {
            const data = await res.json();
            if (data.players?.length > 0) {
                projectionData = data.players.map(normalizeProjectionPlayer)
                    .filter(p => p.name && ["QB","RB","WR","TE"].includes(p.pos));
            }
        }
    } catch (_) {}
    renderProjectionsTable("QB");
}

document.addEventListener("DOMContentLoaded", init);
