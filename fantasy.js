/* ============================================================
   Fantasy page — rankings data and UI logic
   ============================================================ */

const ESPN_LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

// ── Player ranking data (half-PPR, 2025 season) ───────────────────────────
// fppg = fantasy points per game (half-PPR)
const RANKINGS = {
    QB: [
        { name:"Lamar Jackson",     team:"BAL", fppg:29.7, g:16,
          stats:{ "Pass Yds":"4,172", "Pass TD":"41", "Rush Yds":"1,206", "Rush TD":"4", "INT":"4", "Comp%":"67.4%" } },
        { name:"Jalen Hurts",       team:"PHI", fppg:28.1, g:13,
          stats:{ "Pass Yds":"3,102", "Pass TD":"28", "Rush Yds":"891",   "Rush TD":"14","INT":"3", "Comp%":"68.9%" } },
        { name:"Josh Allen",        team:"BUF", fppg:26.4, g:17,
          stats:{ "Pass Yds":"4,531", "Pass TD":"37", "Rush Yds":"531",   "Rush TD":"12","INT":"7", "Comp%":"65.2%" } },
        { name:"Jayden Daniels",    team:"WAS", fppg:24.8, g:17,
          stats:{ "Pass Yds":"3,568", "Pass TD":"25", "Rush Yds":"864",   "Rush TD":"6", "INT":"5", "Comp%":"69.1%" } },
        { name:"Bo Nix",            team:"DEN", fppg:23.1, g:17,
          stats:{ "Pass Yds":"4,001", "Pass TD":"29", "Rush Yds":"412",   "Rush TD":"5", "INT":"8", "Comp%":"66.7%" } },
        { name:"Patrick Mahomes",   team:"KC",  fppg:22.4, g:17,
          stats:{ "Pass Yds":"4,183", "Pass TD":"31", "Rush Yds":"176",   "Rush TD":"2", "INT":"8", "Comp%":"67.8%" } },
        { name:"Sam Darnold",       team:"MIN", fppg:20.9, g:16,
          stats:{ "Pass Yds":"4,319", "Pass TD":"35", "Rush Yds":"92",    "Rush TD":"2", "INT":"12","Comp%":"64.1%" } },
        { name:"Jared Goff",        team:"DET", fppg:20.1, g:17,
          stats:{ "Pass Yds":"4,629", "Pass TD":"37", "Rush Yds":"28",    "Rush TD":"1", "INT":"9", "Comp%":"70.4%" } },
        { name:"Caleb Williams",    team:"CHI", fppg:19.6, g:17,
          stats:{ "Pass Yds":"3,541", "Pass TD":"22", "Rush Yds":"308",   "Rush TD":"4", "INT":"9", "Comp%":"64.3%" } },
        { name:"Baker Mayfield",    team:"TB",  fppg:19.2, g:17,
          stats:{ "Pass Yds":"4,041", "Pass TD":"30", "Rush Yds":"82",    "Rush TD":"1", "INT":"9", "Comp%":"65.8%" } },
    ],
    RB: [
        { name:"Saquon Barkley",    team:"PHI", fppg:20.2, g:16,
          stats:{ "Rush Att":"335", "Rush Yds":"2,005","Rush TD":"13","Rec":"35","Rec Yds":"278","Rec TD":"0","YPC":"5.98" } },
        { name:"Derrick Henry",     team:"BAL", fppg:19.6, g:16,
          stats:{ "Rush Att":"326", "Rush Yds":"1,921","Rush TD":"16","Rec":"19","Rec Yds":"162","Rec TD":"0","YPC":"5.89" } },
        { name:"Jahmyr Gibbs",      team:"DET", fppg:17.0, g:17,
          stats:{ "Rush Att":"221", "Rush Yds":"1,389","Rush TD":"12","Rec":"48","Rec Yds":"364","Rec TD":"3","YPC":"6.29" } },
        { name:"Josh Jacobs",       team:"GB",  fppg:16.8, g:17,
          stats:{ "Rush Att":"276", "Rush Yds":"1,329","Rush TD":"15","Rec":"40","Rec Yds":"365","Rec TD":"1","YPC":"4.82" } },
        { name:"Kyren Williams",    team:"LAR", fppg:15.9, g:16,
          stats:{ "Rush Att":"252", "Rush Yds":"1,242","Rush TD":"12","Rec":"44","Rec Yds":"312","Rec TD":"2","YPC":"4.93" } },
        { name:"De'Von Achane",     team:"MIA", fppg:15.4, g:14,
          stats:{ "Rush Att":"194", "Rush Yds":"1,109","Rush TD":"8", "Rec":"62","Rec Yds":"449","Rec TD":"3","YPC":"5.72" } },
        { name:"Joe Mixon",         team:"HOU", fppg:14.8, g:17,
          stats:{ "Rush Att":"241", "Rush Yds":"1,184","Rush TD":"10","Rec":"37","Rec Yds":"289","Rec TD":"2","YPC":"4.91" } },
        { name:"James Cook",        team:"BUF", fppg:14.3, g:17,
          stats:{ "Rush Att":"222", "Rush Yds":"1,009","Rush TD":"9", "Rec":"51","Rec Yds":"421","Rec TD":"2","YPC":"4.55" } },
        { name:"Bijan Robinson",    team:"ATL", fppg:13.9, g:16,
          stats:{ "Rush Att":"231", "Rush Yds":"1,116","Rush TD":"8", "Rec":"54","Rec Yds":"366","Rec TD":"2","YPC":"4.83" } },
        { name:"Isiah Pacheco",     team:"KC",  fppg:12.8, g:17,
          stats:{ "Rush Att":"228", "Rush Yds":"1,028","Rush TD":"9", "Rec":"28","Rec Yds":"201","Rec TD":"1","YPC":"4.51" } },
        { name:"Jonathan Taylor",   team:"IND", fppg:12.1, g:15,
          stats:{ "Rush Att":"208", "Rush Yds":"1,004","Rush TD":"8", "Rec":"24","Rec Yds":"198","Rec TD":"1","YPC":"4.83" } },
    ],
    WR: [
        { name:"Ja'Marr Chase",     team:"CIN", fppg:19.0, g:17,
          stats:{ "Rec":"100", "Rec Yds":"1,708","Rec TD":"17","Tgts":"148","YPR":"17.1","Catch%":"67.6%" } },
        { name:"CeeDee Lamb",       team:"DAL", fppg:14.5, g:16,
          stats:{ "Rec":"93",  "Rec Yds":"1,194","Rec TD":"11","Tgts":"137","YPR":"12.8","Catch%":"67.9%" } },
        { name:"Malik Nabers",      team:"NYG", fppg:13.6, g:16,
          stats:{ "Rec":"109", "Rec Yds":"1,204","Rec TD":"7", "Tgts":"158","YPR":"11.0","Catch%":"69.0%" } },
        { name:"Brian Thomas Jr.",  team:"JAX", fppg:13.6, g:17,
          stats:{ "Rec":"87",  "Rec Yds":"1,282","Rec TD":"10","Tgts":"121","YPR":"14.7","Catch%":"71.9%" } },
        { name:"Justin Jefferson",  team:"MIN", fppg:13.3, g:17,
          stats:{ "Rec":"91",  "Rec Yds":"1,244","Rec TD":"9", "Tgts":"130","YPR":"13.7","Catch%":"70.0%" } },
        { name:"Puka Nacua",        team:"LAR", fppg:12.9, g:17,
          stats:{ "Rec":"108", "Rec Yds":"1,212","Rec TD":"7", "Tgts":"148","YPR":"11.2","Catch%":"73.0%" } },
        { name:"Amon-Ra St. Brown", team:"DET", fppg:12.7, g:17,
          stats:{ "Rec":"97",  "Rec Yds":"1,056","Rec TD":"8", "Tgts":"127","YPR":"10.9","Catch%":"76.4%" } },
        { name:"Tyreek Hill",       team:"MIA", fppg:12.3, g:16,
          stats:{ "Rec":"81",  "Rec Yds":"1,182","Rec TD":"8", "Tgts":"122","YPR":"14.6","Catch%":"66.4%" } },
        { name:"Davante Adams",     team:"LV",  fppg:11.9, g:16,
          stats:{ "Rec":"80",  "Rec Yds":"1,012","Rec TD":"9", "Tgts":"115","YPR":"12.7","Catch%":"69.6%" } },
        { name:"Rashee Rice",       team:"KC",  fppg:11.7, g:17,
          stats:{ "Rec":"90",  "Rec Yds":"1,054","Rec TD":"7", "Tgts":"125","YPR":"11.7","Catch%":"72.0%" } },
        { name:"Mike Evans",        team:"TB",  fppg:11.5, g:16,
          stats:{ "Rec":"78",  "Rec Yds":"1,044","Rec TD":"9", "Tgts":"110","YPR":"13.4","Catch%":"70.9%" } },
    ],
    TE: [
        { name:"Trey McBride",      team:"ARI", fppg:12.8, g:17,
          stats:{ "Rec":"111", "Rec Yds":"1,146","Rec TD":"8","Tgts":"148","YPR":"10.3","Catch%":"75.0%" } },
        { name:"Brock Bowers",      team:"LV",  fppg:12.1, g:17,
          stats:{ "Rec":"112", "Rec Yds":"1,194","Rec TD":"5","Tgts":"150","YPR":"10.7","Catch%":"74.7%" } },
        { name:"Sam LaPorta",       team:"DET", fppg:11.4, g:17,
          stats:{ "Rec":"84",  "Rec Yds":"991", "Rec TD":"7","Tgts":"117","YPR":"11.8","Catch%":"71.8%" } },
        { name:"George Kittle",     team:"SF",  fppg:11.0, g:16,
          stats:{ "Rec":"82",  "Rec Yds":"1,051","Rec TD":"5","Tgts":"110","YPR":"12.8","Catch%":"74.5%" } },
        { name:"T.J. Hockenson",    team:"MIN", fppg:10.2, g:16,
          stats:{ "Rec":"77",  "Rec Yds":"842", "Rec TD":"6","Tgts":"108","YPR":"10.9","Catch%":"71.3%" } },
    ],
};

// ── Weekly top 10 data ─────────────────────────────────────────────────────
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
    { name:"Lamar Jackson",    team:"BAL", pos:"QB", pts:"-",
      detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"Josh Allen",       team:"BUF", pos:"QB", pts:"-",
      detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"Saquon Barkley",   team:"PHI", pos:"RB", pts:"-",
      detail:{ "Rush Yds":"-","Rush TD":"-","Rec":"-","Rec Yds":"-","Rec TD":"-","FP (proj)":"-" } },
    { name:"Jalen Hurts",      team:"PHI", pos:"QB", pts:"-",
      detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"Ja'Marr Chase",    team:"CIN", pos:"WR", pts:"-",
      detail:{ "Rec":"-","Rec Yds":"-","Rec TD":"-","Rush Yds":"-","Rush TD":"-","FP (proj)":"-" } },
    { name:"Derrick Henry",    team:"BAL", pos:"RB", pts:"-",
      detail:{ "Rush Yds":"-","Rush TD":"-","Rec":"-","Rec Yds":"-","Rec TD":"-","FP (proj)":"-" } },
    { name:"Patrick Mahomes",  team:"KC",  pos:"QB", pts:"-",
      detail:{ "Pass Yds":"-","Pass TD":"-","Rush Yds":"-","Rush TD":"-","INT":"-","FP (proj)":"-" } },
    { name:"CeeDee Lamb",      team:"DAL", pos:"WR", pts:"-",
      detail:{ "Rec":"-","Rec Yds":"-","Rec TD":"-","Rush Yds":"-","Rush TD":"-","FP (proj)":"-" } },
    { name:"Jahmyr Gibbs",     team:"DET", pos:"RB", pts:"-",
      detail:{ "Rush Yds":"-","Rush TD":"-","Rec":"-","Rec Yds":"-","Rec TD":"-","FP (proj)":"-" } },
    { name:"Trey McBride",     team:"ARI", pos:"TE", pts:"-",
      detail:{ "Rec":"-","Rec Yds":"-","Rec TD":"-","Rush Yds":"-","Rush TD":"-","FP (proj)":"-" } },
];

// ── Ranking renderers ──────────────────────────────────────────────────────
function renderRankGroup(pos, players, bodyEl) {
    bodyEl.innerHTML = players.map((p, i) => {
        const numCls = i < 3 ? "top3" : "";
        const detailId = `detail-${pos}-${i}`;
        const statHtml = Object.entries(p.stats)
            .map(([k, v]) => `<div class="detail-stat"><span class="detail-stat-val">${v}</span><span class="detail-stat-lbl">${k}</span></div>`)
            .join("");
        return `
<div class="rank-row" data-detail="${detailId}" onclick="toggleDetail('${detailId}', this)">
  <span class="rank-num ${numCls}">${i + 1}</span>
  <div>
    <div class="rank-name">${p.name}</div>
    <div class="rank-team">${p.team}</div>
  </div>
  <span style="font-size:.65rem;color:var(--text-dim)">${p.g} G</span>
  <span class="rank-pts">${p.fppg} <span style="font-size:.6rem;color:var(--text-dim)">fppg</span></span>
</div>
<div class="rank-row-detail" id="${detailId}">
  <div class="detail-grid">${statHtml}</div>
</div>`;
    }).join("");
}

function renderWeeklyList(players, containerId) {
    const el = document.getElementById(containerId);
    el.innerHTML = players.map((p, i) => {
        const numCls = i < 3 ? "top3" : "";
        const detailId = `${containerId}-detail-${i}`;
        const statHtml = Object.entries(p.detail)
            .map(([k, v]) => `<div class="detail-stat"><span class="detail-stat-val">${v}</span><span class="detail-stat-lbl">${k}</span></div>`)
            .join("");
        return `
<div class="weekly-row" onclick="toggleDetail('${detailId}', this)">
  <span class="weekly-rank ${numCls}">${i + 1}</span>
  <div>
    <div class="weekly-name">${p.name}</div>
    <div class="weekly-pos-team">${p.pos} · ${p.team}</div>
  </div>
  <span style="font-size:.65rem;color:var(--text-dim)">${p.pos}</span>
  <span class="weekly-pts">${p.pts}</span>
</div>
<div class="weekly-row-detail" id="${detailId}">
  <div class="detail-grid">${statHtml}</div>
</div>`;
    }).join("");
}

function toggleDetail(id, row) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("open");
}

// ── Collapsible group logic ────────────────────────────────────────────────
function initCollapseGroups() {
    document.querySelectorAll(".rank-group-hdr").forEach(btn => {
        btn.addEventListener("click", () => {
            const group = btn.closest(".rank-group");
            group.classList.toggle("collapsed");
        });
    });
}

// ── Page tabs ──────────────────────────────────────────────────────────────
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

// ── Platform tabs ──────────────────────────────────────────────────────────
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

// ── League connect stub ────────────────────────────────────────────────────
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

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
    initPageTabs();
    initPlatformTabs();
    initConnectButtons();
    initCollapseGroups();

    // Render position rankings
    renderRankGroup("QB", RANKINGS.QB, document.getElementById("rg-qb-body"));
    renderRankGroup("RB", RANKINGS.RB, document.getElementById("rg-rb-body"));
    renderRankGroup("WR", RANKINGS.WR, document.getElementById("rg-wr-body"));
    renderRankGroup("TE", RANKINGS.TE, document.getElementById("rg-te-body"));

    // Render weekly lists
    renderWeeklyList(TOP10_LAST, "top10-last");
    renderWeeklyList(TOP10_PROJ, "top10-proj");
}

document.addEventListener("DOMContentLoaded", init);
