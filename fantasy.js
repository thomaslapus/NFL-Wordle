/* ============================================================
   Fantasy page — rankings, PPR scoring, position filter
   ============================================================ */

/* ── Auth state ─────────────────────────────────────────────── */
let authToken = null;
let authUser  = null;

async function authInit() {
    const stored = localStorage.getItem("isaf_token");
    if (!stored) return;
    try {
        const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${stored}` } });
        if (!res.ok) { localStorage.removeItem("isaf_token"); return; }
        const data = await res.json();
        authToken = stored;
        authUser  = data.user;
        authUpdateNav();
        await authLoadPrefs();
    } catch (_) {}
}

function authUpdateNav() {
    const btn = document.getElementById("nav-auth-btn");
    if (!btn) return;
    if (authUser) {
        const initial = (authUser.username || authUser.email || "?")[0].toUpperCase();
        btn.innerHTML = `<span class="auth-nav-avatar">${initial}</span>`;
        btn.title = authUser.username;
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        btn.title = "Sign in";
    }
}

async function authLoadPrefs() {
    if (!authToken) return;
    try {
        const res = await fetch("/api/user/prefs", { headers: { Authorization: `Bearer ${authToken}` } });
        if (!res.ok) return;
        const prefs = await res.json();
        if (prefs.espnLeagueId) {
            const idEl = document.getElementById("tc-league-id");
            if (idEl && !idEl.value) idEl.value = prefs.espnLeagueId;
        }
        if (prefs.espnSeason) {
            const sEl = document.getElementById("tc-league-season");
            if (sEl) sEl.value = prefs.espnSeason;
        }
    } catch (_) {}
}

async function authSavePref(key, value) {
    if (!authToken) return;
    try {
        await fetch("/api/user/prefs", {
            method: "PUT",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ key, value }),
        });
    } catch (_) {}
}

function showAuthModal(showUser = false) {
    const overlay = document.getElementById("auth-modal-overlay");
    const form    = document.getElementById("auth-form");
    const panel   = document.getElementById("auth-user-panel");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    if (authUser || showUser) {
        form?.classList.add("hidden");
        panel?.classList.remove("hidden");
        document.getElementById("auth-welcome-text").textContent = `Welcome, ${authUser?.username || ""}!`;
        const av = document.getElementById("auth-avatar-large");
        if (av) av.textContent = (authUser?.username || authUser?.email || "?")[0].toUpperCase();
    } else {
        form?.classList.remove("hidden");
        panel?.classList.add("hidden");
    }
}

function hideAuthModal() {
    document.getElementById("auth-modal-overlay")?.classList.add("hidden");
}

function initAuthModal() {
    document.getElementById("nav-auth-btn")?.addEventListener("click", () => showAuthModal(!!authUser));
    document.getElementById("auth-modal-overlay")?.addEventListener("click", e => {
        if (e.target.id === "auth-modal-overlay") hideAuthModal();
    });
    document.getElementById("auth-modal-close")?.addEventListener("click", hideAuthModal);

    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const isReg = tab.dataset.tab === "register";
            document.getElementById("auth-username-field").style.display = isReg ? "" : "none";
            document.getElementById("auth-modal-title").textContent = isReg ? "Create Account" : "Sign In";
            document.getElementById("auth-submit").textContent = isReg ? "Create Account" : "Sign In";
            document.getElementById("auth-error")?.classList.add("hidden");
        });
    });

    document.getElementById("auth-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const isReg = document.querySelector(".auth-tab.active")?.dataset.tab === "register";
        const email = document.getElementById("auth-email")?.value.trim();
        const password = document.getElementById("auth-password")?.value;
        const username = document.getElementById("auth-username")?.value.trim();
        const errEl = document.getElementById("auth-error");
        const submitBtn = document.getElementById("auth-submit");

        if (!email || !password) return;
        submitBtn.disabled = true;
        submitBtn.textContent = "…";
        errEl?.classList.add("hidden");

        try {
            const url = isReg ? "/api/auth/register" : "/api/auth/login";
            const body = isReg ? { email, username, password } : { email, password };
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Request failed");
            authToken = data.token;
            authUser  = data.user;
            localStorage.setItem("isaf_token", authToken);
            authUpdateNav();
            await authLoadPrefs();
            hideAuthModal();
        } catch (err) {
            if (errEl) { errEl.textContent = err.message; errEl.classList.remove("hidden"); }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = isReg ? "Create Account" : "Sign In";
        }
    });

    document.getElementById("auth-signout-btn")?.addEventListener("click", async () => {
        if (authToken) {
            await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${authToken}` } }).catch(()=>{});
        }
        authToken = null;
        authUser  = null;
        localStorage.removeItem("isaf_token");
        authUpdateNav();
        hideAuthModal();
    });
}

// Active player list — populated from API data when available
let players = [];

// Convert a /api/player-stats entry into the fantasy player format
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
        // Only show real game count when the player has actual stats;
        // avoids showing stale 2025 counts carried over by the API for 2026 preseason
        g:         +rawPts > 0 ? (p.games || 0) : 0,
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
let rankSortCol   = "fppg";
let rankSortDir   = "desc";

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
    list = list.map(p => ({ ...p, fppg: computeFppg(p, currentPPR) }));

    // Sort by selected column
    list.sort((a, b) => {
        let av, bv;
        if (rankSortCol === "fppg") {
            av = a.fppg; bv = b.fppg;
        } else if (rankSortCol === "g") {
            av = a.g || 0; bv = b.g || 0;
        } else if (rankSortCol === "name") {
            return rankSortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        } else if (rankSortCol === "pos") {
            return rankSortDir === "asc" ? a.pos.localeCompare(b.pos) : b.pos.localeCompare(a.pos);
        } else {
            // Stat string — strip commas/percent and parse
            const parse = s => parseFloat(String(s).replace(/[,%]/g,"")) || 0;
            av = parse(a.stats?.[rankSortCol]); bv = parse(b.stats?.[rankSortCol]);
        }
        return rankSortDir === "asc" ? av - bv : bv - av;
    });

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
        // Show "—" for all stat cells when player has 0 games played
        const noData = (p.g || 0) === 0;
        return `<tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
  <td class="rt-rank"><span class="rank-num ${numCls}">${i + 1}</span></td>
  <td class="rt-photo">${shot}</td>
  <td class="rt-player">
    <div class="rank-name">${p.name}${injuryBadge(p.name)}</div>
    <div class="rank-team">${p.team}</div>
  </td>
  <td class="rt-pos"><span class="rg-pos ${POS_COLOR[p.pos]}">${p.pos}</span></td>
  ${cols.map(c => { const isG = c.label === "G"; const v = (!isG && noData) ? "—" : c.fn(p); return `<td class="rt-num">${(!isG && (v === "0" || v === 0)) ? "—" : v}</td>`; }).join("")}
</tr>`;
    });
}

function sortArrow(key) {
    if (rankSortCol !== key) return `<span class="rt-sort-arrow"></span>`;
    return `<span class="rt-sort-arrow">${rankSortDir === "desc" ? "▼" : "▲"}</span>`;
}

function buildFantasyTable(list, cols, rowFn) {
    // Map column labels to stat keys for sorting
    const labelToKey = {
        "FPPG":"fppg", "G":"g", "Player":"name", "Pos":"pos",
        "Comp%":"Comp%","Pass Yds":"Pass Yds","Pass TD":"Pass TD","INT":"INT",
        "Rush Yds":"Rush Yds","Rush TD":"Rush TD","Rec Yds":"Rec Yds",
        "Rec":"Rec","Rec TD":"Rec TD","Carries":"Rush Att","YPR":"YPR",
        "Catch%":"Catch%","Tgts":"Tgts",
    };

    const thead = `<thead><tr>
  <th class="rt-rank">#</th>
  <th class="rt-photo"></th>
  <th class="rt-player rt-sortable" data-sort-key="name">Player ${sortArrow("name")}</th>
  <th class="rt-pos rt-sortable" data-sort-key="pos">Pos ${sortArrow("pos")}</th>
  ${cols.map(c => {
      const key = labelToKey[c.label] || c.label;
      return `<th class="rt-num rt-sortable" data-sort-key="${key}">${c.label} ${sortArrow(key)}</th>`;
  }).join("")}
</tr></thead>`;

    const html = `<table class="rankings-table">
${thead}<tbody>
${list.map((p, i) => rowFn(p, i)).join("\n")}
</tbody></table>`;

    // Attach sort handlers after DOM update
    setTimeout(() => {
        const container = document.getElementById("rankings-all-body");
        if (!container) return;
        container.querySelectorAll(".rt-sortable").forEach(th => {
            th.addEventListener("click", () => {
                const key = th.dataset.sortKey;
                if (rankSortCol === key) {
                    rankSortDir = rankSortDir === "asc" ? "desc" : "asc";
                } else {
                    rankSortCol = key;
                    rankSortDir = key === "name" || key === "pos" ? "asc" : "desc";
                }
                renderRankings();
            });
        });
    }, 0);

    return html;
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
        rankSortCol = "fppg";
        rankSortDir = "desc";

        if (currentSeason === "2025") {
            try {
                const res = await fetch("/api/historical-player-stats?season=2025");
                if (res.ok) {
                    const data = await res.json();
                    const hasRealStats = Array.isArray(data) && data.some(p => (p.passYds||0)+(p.rushYds||0)+(p.recYds||0) > 0);
                    if (hasRealStats) {
                        const KEEP = new Set(["QB","RB","WR","TE","FB"]);
                        const mapped = data.filter(p => KEEP.has(p.pos)).map(apiPlayerToFantasy);
                        players = mapped.length > 0 ? mapped : [];
                    } else players = [];
                } else players = [];
            } catch (_) { players = []; }
        } else {
            try {
                const res = await fetch("/api/player-stats");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        const KEEP = new Set(["QB","RB","WR","TE","FB"]);
                        const mapped = data.filter(p => KEEP.has(p.pos)).map(apiPlayerToFantasy);
                        players = mapped.length > 0 ? mapped : [];
                    } else players = [];
                } else players = [];
            } catch (_) { players = []; }
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

/* ══════════════════════════════════════════════════════════════
   TRADE CALCULATOR
   ══════════════════════════════════════════════════════════════ */

/* ── Algorithm weights (adjustable via sliders) ─────────────── */
const tcWeights = { ppr: 1, age: 1, scarcity: 1, sample: 1, injury: 1 };

/* ── State: two rosters + selected sets ─────────────────────── */
const tc = {
    t1: { roster: [], selected: new Set(), teamName: "Team 1" },
    t2: { roster: [], selected: new Set(), teamName: "Team 2" },
};

/* ── ESPN league state ───────────────────────────────────────── */
const tcEspn = { loaded: false, teams: [], ppr: 1 };

/* ── ESPN proTeamId → NFL abbreviation ──────────────────────── */
const ESPN_NFL_TEAM = {
    1:"ATL",2:"BUF",3:"CHI",4:"CIN",5:"CLE",6:"DAL",7:"DEN",8:"DET",
    9:"GB",10:"TEN",11:"IND",12:"KC",13:"LV",14:"LAR",15:"MIA",16:"MIN",
    17:"NE",18:"NO",19:"NYG",20:"NYJ",21:"PHI",22:"ARI",23:"PIT",24:"LAC",
    25:"SF",26:"SEA",27:"TB",28:"WSH",29:"CAR",30:"JAX",33:"BAL",34:"HOU"
};

/* ── ESPN defaultPositionId → our pos string ────────────────── */
const ESPN_POS = { 1:"QB", 2:"RB", 3:"WR", 4:"TE", 5:"K", 16:"DST" };

/* ── ESPN lineupSlotId: which are bench/IR ───────────────────── */
const ESPN_BENCH_SLOT = 20;
const ESPN_IR_SLOT    = 21;

/* ── Position scarcity baselines ────────────────────────────── */
const POS_SCARCITY = { QB: 1.12, RB: 1.08, WR: 1.04, TE: 1.18 };

/* ── Compute composite trade value for a player ─────────────── */
function tcPlayerValue(p) {
    if (!p || !p.g || p.g === 0) return 0;
    const fppg = computeFppg(p, tcWeights.ppr);
    const scBase = POS_SCARCITY[p.pos] || 1.0;
    const scarcityMult = 1 + (scBase - 1) * tcWeights.scarcity;
    const age = p.age || 26;
    const ageRaw = age <= 23 ? 1.2 : age <= 25 ? 1.1 : age <= 27 ? 1.0 : age <= 29 ? 0.9 : age <= 31 ? 0.8 : 0.65;
    const ageMult = 1 + (ageRaw - 1) * tcWeights.age;
    const confidence = Math.min(p.g / 10, 1);
    const sampleMult = 1 - (1 - confidence) * 0.35 * tcWeights.sample;
    const injStatus = getInjuryStatus(p.name);
    const injPenalty = injStatus === "ir" ? 0.55 : injStatus === "out" ? 0.72 : injStatus === "doubtful" ? 0.85 : injStatus === "questionable" ? 0.94 : 1.0;
    const injMult = 1 - (1 - injPenalty) * tcWeights.injury;
    return +(fppg * scarcityMult * ageMult * sampleMult * injMult).toFixed(2);
}

/* ── Verdict string from score ───────────────────────────────── */
function tcVerdict(score, t1Val, t2Val) {
    if (score === null) return "Click players on both sides to rate this trade";
    const winner = t1Val > t2Val ? "t1" : t2Val > t1Val ? "t2" : null;
    const winnerName = winner ? tc[winner].teamName : null;
    if (score >= 95) return "Perfectly even trade";
    if (score >= 85) return winnerName ? `Slight edge to ${winnerName}` : "Near-even trade";
    if (score >= 72) return winnerName ? `Favors ${winnerName}` : "Moderately uneven";
    if (score >= 55) return winnerName ? `Clearly favors ${winnerName}` : "Uneven trade";
    if (score >= 35) return winnerName ? `${winnerName} wins this badly` : "Very one-sided";
    return winnerName ? `Highway robbery — ${winnerName} dominates` : "Extremely one-sided";
}

/* ── Color for gauge fill ────────────────────────────────────── */
function tcGaugeColor(score) {
    if (score >= 85) return "linear-gradient(90deg,#22c55e,#4ade80)";
    if (score >= 65) return "linear-gradient(90deg,#f59e0b,#fbbf24)";
    return "linear-gradient(90deg,#ef4444,#f87171)";
}

/* ── Refresh summary + rating ────────────────────────────────── */
function tcRefresh() {
    const summaryEl  = document.getElementById("tc-summary-body");
    const t1sel = tc.t1.roster.filter(p => tc.t1.selected.has(p.name));
    const t2sel = tc.t2.roster.filter(p => tc.t2.selected.has(p.name));

    if (summaryEl) {
        if (!t1sel.length && !t2sel.length) {
            summaryEl.innerHTML = `<div class="tc-summary-empty">Click players in each roster to build your trade</div>`;
        } else {
            const chip = (p, side) => {
                const val = tcPlayerValue(p);
                return `<div class="tc-chip tc-chip-${side}">
  <span class="tc-chip-pos ${POS_COLOR[p.pos]||""}">${p.pos}</span>
  <span class="tc-chip-name">${p.name}</span>
  <span class="tc-chip-val">${val.toFixed(1)}</span>
</div>`;
            };
            summaryEl.innerHTML = `
<div class="tc-sum-side">
  <div class="tc-sum-label">${tc.t1.teamName} gives</div>
  <div class="tc-sum-chips">${t1sel.length ? t1sel.map(p=>chip(p,"t1")).join("") : '<span class="tc-sum-none">Nothing selected</span>'}</div>
</div>
<div class="tc-sum-arrow">→</div>
<div class="tc-sum-side">
  <div class="tc-sum-label">${tc.t2.teamName} gives</div>
  <div class="tc-sum-chips">${t2sel.length ? t2sel.map(p=>chip(p,"t2")).join("") : '<span class="tc-sum-none">Nothing selected</span>'}</div>
</div>`;
        }
    }

    const gaugeEl    = document.getElementById("tc-gauge-fill");
    const needleEl   = document.getElementById("tc-gauge-needle");
    const scoreEl    = document.getElementById("tc-score-num");
    const verdictEl  = document.getElementById("tc-score-verdict");
    const breakdownEl= document.getElementById("tc-value-breakdown");
    const t1Val = t1sel.reduce((s, p) => s + tcPlayerValue(p), 0);
    const t2Val = t2sel.reduce((s, p) => s + tcPlayerValue(p), 0);

    if (!t1sel.length || !t2sel.length) {
        if (gaugeEl)  { gaugeEl.style.width = "0%"; gaugeEl.style.background = ""; }
        if (needleEl) needleEl.style.left = "0%";
        if (scoreEl)  scoreEl.textContent = "—";
        if (verdictEl) verdictEl.textContent = tcVerdict(null, 0, 0);
        if (breakdownEl) breakdownEl.innerHTML = "";
        return;
    }

    const maxVal = Math.max(t1Val, t2Val) || 1;
    const minVal = Math.min(t1Val, t2Val);
    const score  = Math.round(minVal / maxVal * 100);

    if (gaugeEl)  { gaugeEl.style.width = score + "%"; gaugeEl.style.background = tcGaugeColor(score); }
    if (needleEl) needleEl.style.left = score + "%";
    if (scoreEl)  { scoreEl.textContent = score; scoreEl.className = "tc-score-num " + (score >= 85 ? "score-fair" : score >= 65 ? "score-uneven" : "score-onesided"); }
    if (verdictEl) verdictEl.textContent = tcVerdict(score, t1Val, t2Val);

    if (breakdownEl) {
        breakdownEl.innerHTML = `
<div class="tc-breakdown-row">
  <span class="tc-bd-label">${tc.t1.teamName}</span>
  <div class="tc-bd-bar-wrap"><div class="tc-bd-bar tc-bd-t1" style="width:${Math.round(t1Val/maxVal*100)}%"></div></div>
  <span class="tc-bd-val">${t1Val.toFixed(1)}</span>
</div>
<div class="tc-breakdown-row">
  <span class="tc-bd-label">${tc.t2.teamName}</span>
  <div class="tc-bd-bar-wrap"><div class="tc-bd-bar tc-bd-t2" style="width:${Math.round(t2Val/maxVal*100)}%"></div></div>
  <span class="tc-bd-val">${t2Val.toFixed(1)}</span>
</div>`;
    }
}

/* ── One-line stat summary for a player ─────────────────────── */
function tcPlayerStatLine(p) {
    if (!p.g || p.g === 0) return "0 games";
    if (p.pos === "QB") return `${p.stats["Pass Yds"]||0} yds · ${p.stats["Pass TD"]||0} TD`;
    if (p.pos === "RB") return `${p.stats["Rush Yds"]||0} rush · ${p.stats["Rec"]||0} rec`;
    return `${p.stats["Rec"]||0} rec · ${p.stats["Rec Yds"]||0} yds`;
}

/* ── Render one team's ESPN roster ───────────────────────────── */
function tcRenderEspnRoster(side) {
    const state = tc[side];
    const el    = document.getElementById(`tc-roster-${side}`);
    if (!el) return;

    const SKILL = new Set(["QB","RB","WR","TE"]);
    const roster = state.roster.filter(p => SKILL.has(p.pos));

    if (!roster.length) {
        el.innerHTML = `<div class="tc-empty-msg">No skill players found on this roster</div>`;
        return;
    }

    const starters = roster.filter(p => p.slotType === "starter");
    const bench    = roster.filter(p => p.slotType === "bench");
    const ir       = roster.filter(p => p.slotType === "ir");

    const renderPlayer = p => {
        const val    = tcPlayerValue(p);
        const selCls = state.selected.has(p.name) ? " tc-player-row--selected" : "";
        const shot   = p.espnId
            ? `<img class="tc-headshot" src="https://a.espncdn.com/i/headshots/nfl/players/full/${p.espnId}.png" onerror="this.style.display='none'">`
            : `<div class="tc-headshot-blank"></div>`;
        const statStr = tcPlayerStatLine(p);
        const injMark = injuryBadge(p.name);
        return `<div class="tc-player-row${selCls}" data-name="${p.name}" data-side="${side}">
  ${shot}
  <div class="tc-player-info">
    <div class="tc-player-name">${p.name}${injMark}</div>
    <div class="tc-player-meta"><span class="rg-pos ${POS_COLOR[p.pos]||""}">${p.pos}</span> ${p.team} <span class="tc-stat-line">${statStr}</span></div>
  </div>
  <div class="tc-player-right">
    <div class="tc-player-val">${val > 0 ? val.toFixed(1) : "—"}</div>
    <div class="tc-player-fppg">${p.g > 0 ? computeFppg(p, tcWeights.ppr).toFixed(1) + " fppg" : "0 g"}</div>
  </div>
</div>`;
    };

    const renderSection = (group, label) => {
        if (!group.length) return "";
        return `<div class="tc-roster-section">
  <div class="tc-section-label">${label}</div>
  ${group.map(renderPlayer).join("")}
</div>`;
    };

    el.innerHTML = renderSection(starters, "Starters") +
                   renderSection(bench, "Bench") +
                   (ir.length ? renderSection(ir, "IR") : "");

    el.querySelectorAll(".tc-player-row").forEach(row => {
        row.addEventListener("click", () => {
            const name = row.dataset.name;
            if (!name) return;
            if (state.selected.has(name)) {
                state.selected.delete(name);
                row.classList.remove("tc-player-row--selected");
            } else {
                state.selected.add(name);
                row.classList.add("tc-player-row--selected");
            }
            tcRefresh();
        });
    });
}

/* ── Load ESPN fantasy league data ───────────────────────────── */
async function tcLoadEspnLeague(leagueId, season) {
    const statusEl = document.getElementById("tc-league-status");
    const setStatus = (msg, isErr) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className   = "tc-league-status" + (isErr ? " tc-status-err" : "");
    };

    setStatus("Loading…");
    try {
        const espnS2 = document.getElementById("tc-espn-s2")?.value.trim() || "";
        const swid   = document.getElementById("tc-swid")?.value.trim() || "";
        const params = new URLSearchParams({ leagueId, season });
        if (espnS2) params.set("espn_s2", espnS2);
        if (swid)   params.set("swid", swid);
        const res = await fetch(`/api/espn-league?${params}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setStatus(err.error || `ESPN error ${res.status}`, true);
            return false;
        }
        const data = await res.json();

        // Detect PPR from scoring settings
        const items = data.settings?.scoringSettings?.scoringItems || [];
        const recItem = items.find(s => s.statId === 53);
        if (recItem) {
            const pts = recItem.pointsOverrides?.[16] ?? recItem.points ?? 0;
            tcEspn.ppr = pts;
            tcWeights.ppr = pts;
        }

        // Parse teams
        tcEspn.teams = (data.teams || []).map(t => {
            const name = ((t.location || "") + " " + (t.nickname || "")).trim() || `Team ${t.id}`;
            const wins  = t.record?.overall?.wins  ?? 0;
            const losses= t.record?.overall?.losses ?? 0;
            const ties  = t.record?.overall?.ties   ?? 0;
            const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

            const roster = (t.roster?.entries || []).map(entry => {
                const player  = entry.playerPoolEntry?.player;
                if (!player) return null;
                const espnId  = String(player.id || "");
                const pos     = ESPN_POS[player.defaultPositionId] || "—";
                const nflTeam = ESPN_NFL_TEAM[player.proTeamId] || "FA";
                const slotId  = entry.lineupSlotId;
                const slotType = slotId === ESPN_IR_SLOT ? "ir" : slotId === ESPN_BENCH_SLOT ? "bench" : "starter";

                // Match with local stats DB
                const local = players.find(lp => lp.espnId === espnId);
                return {
                    name:      player.fullName || "Unknown",
                    pos,
                    team:      nflTeam,
                    espnId,
                    slotType,
                    rawPts:    local?.rawPts    ?? 0,
                    recSeason: local?.recSeason ?? 0,
                    g:         local?.g         ?? 0,
                    stats:     local?.stats     ?? {},
                    age:       local?.age       ?? 26,
                };
            }).filter(Boolean);

            return { id: t.id, name, record, roster };
        });

        tcEspn.loaded = true;
        setStatus(`✓ ${tcEspn.teams.length} teams · ${tcEspn.ppr === 1 ? "Full PPR" : tcEspn.ppr === 0.5 ? "Half PPR" : "No PPR"}`);

        tcBuildTeamDropdowns();
        return true;
    } catch (e) {
        setStatus("Error: " + e.message, true);
        return false;
    }
}

/* ── Build team picker dropdown contents for both sides ─────── */
function tcBuildTeamDropdowns() {
    ["t1", "t2"].forEach(side => {
        const drop = document.getElementById(`tc-team-drop-${side}`);
        if (!drop) return;
        drop.innerHTML = tcEspn.teams.map(t => `
<div class="tc-tdi" data-team-id="${t.id}" data-side="${side}">
  <span class="tc-tdi-name">${t.name}</span>
  <span class="tc-tdi-rec">${t.record}</span>
</div>`).join("");
        drop.querySelectorAll(".tc-tdi").forEach(item => {
            item.addEventListener("click", e => {
                e.stopPropagation();
                tcPickTeam(side, +item.dataset.teamId);
                drop.classList.remove("open");
                document.getElementById(`tc-team-selector-${side}`)?.classList.remove("open");
            });
        });
    });
}

/* ── Select a team for one side ─────────────────────────────── */
function tcPickTeam(side, teamId) {
    const team = tcEspn.teams.find(t => t.id === teamId);
    if (!team) return;

    tc[side].teamName = team.name;
    tc[side].roster   = team.roster;
    tc[side].selected = new Set();

    const nameEl = document.getElementById(`tc-team-name-${side}`);
    if (nameEl) nameEl.textContent = team.name;

    const recordEl = document.getElementById(`tc-team-record-${side}`);
    if (recordEl) recordEl.textContent = team.record;

    // Mark active team in dropdown
    const drop = document.getElementById(`tc-team-drop-${side}`);
    if (drop) {
        drop.querySelectorAll(".tc-tdi").forEach(el => {
            el.classList.toggle("tc-tdi--active", +el.dataset.teamId === teamId);
        });
    }

    tcRenderEspnRoster(side);
    tcRefresh();
}

/* ── Algorithm sliders ───────────────────────────────────────── */
function tcInitSliders() {
    const sliders = [
        { id:"sl-age",      key:"age",      valId:"sl-age-val" },
        { id:"sl-scarcity", key:"scarcity", valId:"sl-scarcity-val" },
        { id:"sl-sample",   key:"sample",   valId:"sl-sample-val" },
        { id:"sl-injury",   key:"injury",   valId:"sl-injury-val" },
    ];
    sliders.forEach(({ id, key, valId }) => {
        const el    = document.getElementById(id);
        const valEl = document.getElementById(valId);
        if (!el || !valEl) return;
        el.addEventListener("input", () => {
            tcWeights[key] = parseFloat(el.value);
            valEl.textContent = parseFloat(el.value).toFixed(1) + "×";
            tcRenderEspnRoster("t1");
            tcRenderEspnRoster("t2");
            tcRefresh();
        });
    });

    document.getElementById("tc-reset-btn")?.addEventListener("click", () => {
        sliders.forEach(({ id, key, valId }) => {
            tcWeights[key] = 1;
            const el    = document.getElementById(id);
            const valEl = document.getElementById(valId);
            if (el)    el.value = 1;
            if (valEl) valEl.textContent = "1.0×";
        });
        tcRenderEspnRoster("t1");
        tcRenderEspnRoster("t2");
        tcRefresh();
    });

    document.getElementById("tc-settings-btn")?.addEventListener("click", () => {
        document.getElementById("tc-settings-drawer")?.classList.toggle("hidden");
    });
}

/* ── Init trade calculator ───────────────────────────────────── */
async function initTradeCalc() {
    tcInitSliders();

    // Team selector toggle
    ["t1", "t2"].forEach(side => {
        const btn  = document.getElementById(`tc-team-selector-${side}`);
        const drop = document.getElementById(`tc-team-drop-${side}`);
        if (!btn || !drop) return;
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const isOpen = drop.classList.contains("open");
            // Close all open dropdowns first
            document.querySelectorAll(".tc-team-dropdown.open").forEach(d => d.classList.remove("open"));
            document.querySelectorAll(".tc-team-selector.open").forEach(b => b.classList.remove("open"));
            if (!isOpen) {
                drop.classList.add("open");
                btn.classList.add("open");
            }
        });
    });

    document.addEventListener("click", () => {
        document.querySelectorAll(".tc-team-dropdown.open").forEach(d => d.classList.remove("open"));
        document.querySelectorAll(".tc-team-selector.open").forEach(b => b.classList.remove("open"));
    });

    // Private league auth toggle
    document.getElementById("tc-auth-toggle")?.addEventListener("click", () => {
        const drawer = document.getElementById("tc-auth-drawer");
        if (!drawer) return;
        drawer.classList.toggle("hidden");
        const btn = document.getElementById("tc-auth-toggle");
        if (btn) btn.classList.toggle("active", !drawer.classList.contains("hidden"));
    });

    // League connect button
    document.getElementById("tc-league-connect-btn")?.addEventListener("click", async () => {
        const leagueId = document.getElementById("tc-league-id")?.value.trim();
        const season   = document.getElementById("tc-league-season")?.value.trim() || "2026";
        if (!leagueId) {
            const s = document.getElementById("tc-league-status");
            if (s) { s.textContent = "Enter a League ID"; s.className = "tc-league-status tc-status-err"; }
            return;
        }
        // Clear selections
        tc.t1.roster = []; tc.t1.selected = new Set();
        tc.t2.roster = []; tc.t2.selected = new Set();
        tcRenderEspnRoster("t1");
        tcRenderEspnRoster("t2");
        tcRefresh();
        await tcLoadEspnLeague(leagueId, season);
        // Save league ID to user prefs
        authSavePref("espnLeagueId", leagueId);
        authSavePref("espnSeason", season);
    });

    // Also allow pressing Enter in league ID field
    document.getElementById("tc-league-id")?.addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("tc-league-connect-btn")?.click();
    });
}

/* ── Page tabs ──────────────────────────────────────────────── */
let tcInited = false;
function initPageTabs() {
    document.querySelectorAll(".page-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".page-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".page-panel").forEach(p => p.classList.add("hidden"));
            tab.classList.add("active");
            const panel = tab.dataset.panel;
            document.getElementById(panel)?.classList.remove("hidden");
            if (panel === "panel-tradevalues" && !tcInited) {
                initTradeCalc();
                tcInited = true;
            }
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
    authInit();
    initAuthModal();
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
    } catch (_) { /* use empty list */ }

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

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
