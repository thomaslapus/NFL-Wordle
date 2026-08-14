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

/* ── Weekly top-10 data ──────────────────────────────────────── */
const TOP10_LAST = [
    { name:"Lamar Jackson",    team:"BAL", pos:"QB", pts:"41.2",
      detail:{ "Pass Yds":"388","Pass TD":"4","Rush Yds":"74","Rush TD":"1","INT":"0","FP":"41.2" } },
    { name:"Josh Allen",       team:"BUF", pos:"QB", pts:"38.9",
      detail:{ "Pass Yds":"362","Pass TD":"3","Rush Yds":"91","Rush TD":"2","INT":"0","FP":"38.9" } },
    { name:"Saquon Barkley",   team:"PHI", pos:"RB", pts:"36.4",
      detail:{ "Rush Yds":"211","Rush TD":"2","Rec":"5","Rec Yds":"42","Rec TD":"0","FP":"36.4" } },
    { name:"Ja'Marr Chase",    team:"CIN", pos:"WR", pts:"35.1",
      detail:{ "Rec":"11","Rec Yds":"198","Rec TD":"2","Rush Yds":"-","Rush TD":"-","FP":"35.1" } },
    { name:"Jalen Hurts",      team:"PHI", pos:"QB", pts:"33.7",
      detail:{ "Pass Yds":"291","Pass TD":"2","Rush Yds":"88","Rush TD":"2","INT":"0","FP":"33.7" } },
    { name:"Derrick Henry",    team:"BAL", pos:"RB", pts:"29.8",
      detail:{ "Rush Yds":"168","Rush TD":"2","Rec":"4","Rec Yds":"29","Rec TD":"0","FP":"29.8" } },
    { name:"CeeDee Lamb",      team:"DAL", pos:"WR", pts:"27.4",
      detail:{ "Rec":"9","Rec Yds":"162","Rec TD":"2","Rush Yds":"-","Rush TD":"-","FP":"27.4" } },
    { name:"Trey McBride",     team:"ARI", pos:"TE", pts:"24.1",
      detail:{ "Rec":"10","Rec Yds":"118","Rec TD":"1","Rush Yds":"-","Rush TD":"-","FP":"24.1" } },
    { name:"Jahmyr Gibbs",     team:"DET", pos:"RB", pts:"23.6",
      detail:{ "Rush Yds":"118","Rush TD":"1","Rec":"7","Rec Yds":"54","Rec TD":"1","FP":"23.6" } },
    { name:"Justin Jefferson", team:"MIN", pos:"WR", pts:"22.9",
      detail:{ "Rec":"8","Rec Yds":"148","Rec TD":"1","Rush Yds":"-","Rush TD":"-","FP":"22.9" } },
];

const TOP10_PROJ = [
    { name:"Lamar Jackson",    team:"BAL", pos:"QB", pts:"-", detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"Josh Allen",       team:"BUF", pos:"QB", pts:"-", detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"Saquon Barkley",   team:"PHI", pos:"RB", pts:"-", detail:{ "Rush Yds":"-","Rush TD":"-","Rec":"-","Rec Yds":"-","Rec TD":"-","FP (proj)":"-" } },
    { name:"Jalen Hurts",      team:"PHI", pos:"QB", pts:"-", detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"Ja'Marr Chase",    team:"CIN", pos:"WR", pts:"-", detail:{ "Rec":"-","Rec Yds":"-","Rec TD":"-","Rush Yds":"-","Rush TD":"-","FP (proj)":"-" } },
    { name:"Derrick Henry",    team:"BAL", pos:"RB", pts:"-", detail:{ "Rush Yds":"-","Rush TD":"-","Rec":"-","Rec Yds":"-","Rec TD":"-","FP (proj)":"-" } },
    { name:"Patrick Mahomes",  team:"KC",  pos:"QB", pts:"-", detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"CeeDee Lamb",      team:"DAL", pos:"WR", pts:"-", detail:{ "Rec":"-","Rec Yds":"-","Rec TD":"-","Rush Yds":"-","Rush TD":"-","FP (proj)":"-" } },
    { name:"Jahmyr Gibbs",     team:"DET", pos:"RB", pts:"-", detail:{ "Rush Yds":"-","Rush TD":"-","Rec":"-","Rec Yds":"-","Rec TD":"-","FP (proj)":"-" } },
    { name:"Trey McBride",     team:"ARI", pos:"TE", pts:"-", detail:{ "Rec":"-","Rec Yds":"-","Rec TD":"-","Rush Yds":"-","Rush TD":"-","FP (proj)":"-" } },
];

/* ── State ─────────────────────────────────────────────────── */
let currentPPR    = 1;      // default: full PPR
let currentPos    = "ALL";
let currentSeason = "2026";
let lastPosTab    = { last: "QB", proj: "QB" };

/* ── Ranking renderer ───────────────────────────────────────── */
const POS_COLOR = { QB:"qb", RB:"rb", WR:"wr", TE:"te" };

// Column definitions per position for the rankings table
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

function renderRankings() {
    const container = document.getElementById("rankings-all-body");
    if (!container) return;

    let list = players.filter(p => currentPos === "ALL" || p.pos === currentPos);
    list = list
        .map(p => ({ ...p, fppg: computeFppg(p, currentPPR) }))
        .sort((a, b) => b.fppg - a.fppg);

    if (!list.length) {
        container.innerHTML = `<p class="loading-note" style="padding:16px">No data available</p>`;
        return;
    }

    const cols = getRankingCols(currentPos);

    let html = `<div class="table-scroll"><table class="rankings-table">
<thead><tr>
  <th class="rt-rank">#</th>
  <th class="rt-photo"></th>
  <th class="rt-player">Player</th>
  <th class="rt-pos">Pos</th>
  ${cols.map(c => `<th class="rt-num">${c.label}</th>`).join("")}
</tr></thead><tbody>`;

    list.forEach((p, i) => {
        const shotSrc = p.espnId
            ? `https://a.espncdn.com/i/headshots/nfl/players/full/${p.espnId}.png`
            : "";
        const shot = shotSrc
            ? `<img class="rank-headshot" src="${shotSrc}" onerror="this.style.display='none'">`
            : `<div class="rank-headshot-blank"></div>`;
        const numCls = i < 3 ? "top3" : "";
        html += `<tr>
  <td class="rt-rank"><span class="rank-num ${numCls}">${i + 1}</span></td>
  <td class="rt-photo">${shot}</td>
  <td class="rt-player">
    <div class="rank-name">${p.name}</div>
    <div class="rank-team">${p.team}</div>
  </td>
  <td class="rt-pos"><span class="rg-pos ${POS_COLOR[p.pos]}">${p.pos}</span></td>
  ${cols.map(c => `<td class="rt-num">${c.fn(p)}</td>`).join("")}
</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function updateScoringLabel() {
    const labels = { 1:"Full PPR · by Fantasy Pts/Game", 0.5:"Half PPR · by Fantasy Pts/Game", 0:"No PPR · by Fantasy Pts/Game" };
    const el = document.getElementById("scoring-label");
    if (el) el.textContent = labels[currentPPR] ?? "";
    const title = document.getElementById("rankings-title");
    if (title) title.textContent = `${currentSeason} Season Rankings`;
}

/* ── Weekly list with position filter ─────────────────────── */
function renderWeeklyByPos(sourceList, containerId, pos) {
    const filtered = sourceList.filter(p => p.pos === pos).slice(0, 10);
    renderWeeklyList(filtered, containerId);
}

function initWeeklyPosTabs() {
    document.querySelectorAll(".weekly-pos-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const listKey = btn.dataset.list;   // "last" or "proj"
            const pos     = btn.dataset.pos;
            // Update active state for this group only
            document.querySelectorAll(`.weekly-pos-btn[data-list="${listKey}"]`)
                .forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            lastPosTab[listKey] = pos;
            const containerId = listKey === "last" ? "top10-last" : "top10-proj";
            const sourceList  = listKey === "last" ? TOP10_LAST : TOP10_PROJ;
            renderWeeklyByPos(sourceList, containerId, pos);
        });
    });
}

/* ── Weekly list renderer ───────────────────────────────────── */
function renderWeeklyList(players, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = players.map((p, i) => {
        const numCls   = i < 3 ? "top3" : "";
        const detailId = `${containerId}-d-${i}`;
        const statHtml = Object.entries(p.detail)
            .map(([k, v]) => `<div class="detail-stat"><span class="detail-stat-val">${v}</span><span class="detail-stat-lbl">${k}</span></div>`)
            .join("");
        return `
<div class="weekly-row" onclick="toggleDetail('${detailId}')">
  <span class="weekly-rank ${numCls}">${i + 1}</span>
  <div>
    <div class="weekly-name">${p.name}</div>
    <div class="weekly-pos-team">${p.pos} · ${p.team}</div>
  </div>
  <span class="rg-pos ${POS_COLOR[p.pos]}" style="font-size:.6rem">${p.pos}</span>
  <span class="weekly-pts">${p.pts}</span>
</div>
<div class="weekly-row-detail" id="${detailId}">
  <div class="detail-grid">${statHtml}</div>
</div>`;
    }).join("");
}

/* ── Toggle expand ──────────────────────────────────────────── */
function toggleDetail(id) {
    document.getElementById(id)?.classList.toggle("open");
}

/* ── Controls ───────────────────────────────────────────────── */
function initRankControls() {
    // Season dropdown
    document.getElementById("season-select")?.addEventListener("change", async e => {
        currentSeason = e.target.value;
        if (currentSeason === "2025") {
            players = PLAYERS;
        } else {
            // Try to load 2026 API data
            try {
                const res = await fetch("/api/player-stats");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        const KEEP = new Set(["QB","RB","WR","TE","FB"]);
                        const mapped = data
                            .filter(p => KEEP.has(p.pos) && (p.totalYds > 0 || p.passTDs > 0))
                            .map(apiPlayerToFantasy);
                        if (mapped.length > 0) { players = mapped; }
                        else players = PLAYERS;
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

/* ── Platform tabs (My Team) ────────────────────────────────── */
function initPlatformTabs() {
    document.querySelectorAll(".plat-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".plat-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".link-form").forEach(f => f.classList.add("hidden"));
            btn.classList.add("active");
            document.getElementById(`link-form-${btn.dataset.platform}`)?.classList.remove("hidden");
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

    // Try to load 2026 API data; fall back to hardcoded PLAYERS
    try {
        const res = await fetch("/api/player-stats");
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const KEEP = new Set(["QB","RB","WR","TE","FB"]);
                const mapped = data
                    .filter(p => KEEP.has(p.pos) && (p.totalYds > 0 || p.passTDs > 0))
                    .map(apiPlayerToFantasy);
                if (mapped.length > 0) players = mapped;
            }
        }
    } catch (_) { /* use PLAYERS fallback */ }

    renderRankings();
    // Render weekly lists filtered to default position (QB)
    renderWeeklyByPos(TOP10_LAST, "top10-last", "QB");
    renderWeeklyByPos(TOP10_PROJ, "top10-proj", "QB");
}

document.addEventListener("DOMContentLoaded", init);
