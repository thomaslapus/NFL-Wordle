/* ============================================================
   Games page — schedule calendar + live scores from /api/games
   ============================================================ */

// YYYYMMDD string for today — matches what the server uses
function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}
const TODAY = todayDateStr();

// ESPN CDN team logos
const ESPN_LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

// Primary team colors — dark neon: saturated, vivid, not glowing
const TEAM_COLORS = {
    ARI:"#CC0030", ATL:"#CC002C", BAL:"#5C18CC", BUF:"#003ECC",
    CAR:"#0080CC", CHI:"#CC4000", CIN:"#CC4400", CLE:"#CC3300",
    DAL:"#003EBB", DEN:"#CC4400", DET:"#0077CC", GB: "#116630",
    HOU:"#083366", IND:"#002EAA", JAX:"#007799", KC: "#CC0020",
    LAC:"#0066CC", LAR:"#0033BB", LV: "#606070", MIA:"#00AACC",
    MIN:"#5511AA", NE: "#0C2B99", NO: "#AA8822", NYG:"#002299",
    NYJ:"#0E6633", PHI:"#006666", PIT:"#DDAA00", SEA:"#112288",
    SF: "#BB0011", TB: "#CC0011", TEN:"#0C3399", WAS:"#771111",
    TBD:"#555566",
};

// Static team name + stadium lookup (used to fill gaps when API omits them)
const T = {
    ARI:["Arizona Cardinals",     "State Farm Stadium, Glendale AZ"],
    ATL:["Atlanta Falcons",        "Mercedes-Benz Stadium, Atlanta GA"],
    BAL:["Baltimore Ravens",       "M&T Bank Stadium, Baltimore MD"],
    BUF:["Buffalo Bills",          "Highmark Stadium, Orchard Park NY"],
    CAR:["Carolina Panthers",      "Bank of America Stadium, Charlotte NC"],
    CHI:["Chicago Bears",          "Soldier Field, Chicago IL"],
    CIN:["Cincinnati Bengals",     "Paycor Stadium, Cincinnati OH"],
    CLE:["Cleveland Browns",       "Huntington Bank Field, Cleveland OH"],
    DAL:["Dallas Cowboys",         "AT&T Stadium, Arlington TX"],
    DEN:["Denver Broncos",         "Empower Field at Mile High, Denver CO"],
    DET:["Detroit Lions",          "Ford Field, Detroit MI"],
    GB: ["Green Bay Packers",      "Lambeau Field, Green Bay WI"],
    HOU:["Houston Texans",         "NRG Stadium, Houston TX"],
    IND:["Indianapolis Colts",     "Lucas Oil Stadium, Indianapolis IN"],
    JAX:["Jacksonville Jaguars",   "EverBank Stadium, Jacksonville FL"],
    KC: ["Kansas City Chiefs",     "Arrowhead Stadium, Kansas City MO"],
    LAC:["Los Angeles Chargers",   "SoFi Stadium, Inglewood CA"],
    LAR:["Los Angeles Rams",       "SoFi Stadium, Inglewood CA"],
    LV: ["Las Vegas Raiders",      "Allegiant Stadium, Las Vegas NV"],
    MIA:["Miami Dolphins",         "Hard Rock Stadium, Miami Gardens FL"],
    MIN:["Minnesota Vikings",      "U.S. Bank Stadium, Minneapolis MN"],
    NE: ["New England Patriots",   "Gillette Stadium, Foxborough MA"],
    NO: ["New Orleans Saints",     "Caesars Superdome, New Orleans LA"],
    NYG:["New York Giants",        "MetLife Stadium, East Rutherford NJ"],
    NYJ:["New York Jets",          "MetLife Stadium, East Rutherford NJ"],
    PHI:["Philadelphia Eagles",    "Lincoln Financial Field, Philadelphia PA"],
    PIT:["Pittsburgh Steelers",    "Acrisure Stadium, Pittsburgh PA"],
    SEA:["Seattle Seahawks",       "Lumen Field, Seattle WA"],
    SF: ["San Francisco 49ers",    "Levi's Stadium, Santa Clara CA"],
    TB: ["Tampa Bay Buccaneers",   "Raymond James Stadium, Tampa FL"],
    TEN:["Tennessee Titans",       "Nissan Stadium, Nashville TN"],
    WAS:["Washington Commanders",  "Northwest Stadium, Landover MD"],
    TBD:["TBD", "TBD"],
};

// ── Schedule dates — calendar structure only, no game data ────────────────────
// Game matchup data comes from the server via /api/games?date=YYYYMMDD.
const SCHEDULE_DATES = [
    // Preseason
    { date:"20260806", label:"Thu Aug 6",   weekType:"Preseason", weekLabel:"HOF",     fullLabel:"Hall of Fame Game" },
    { date:"20260813", label:"Thu Aug 13",  weekType:"Preseason", weekLabel:"PS Wk 1", fullLabel:"Preseason Week 1" },
    { date:"20260814", label:"Fri Aug 14",  weekType:"Preseason", weekLabel:"PS Wk 1", fullLabel:"Preseason Week 1" },
    { date:"20260815", label:"Sat Aug 15",  weekType:"Preseason", weekLabel:"PS Wk 1", fullLabel:"Preseason Week 1" },
    { date:"20260820", label:"Thu Aug 20",  weekType:"Preseason", weekLabel:"PS Wk 2", fullLabel:"Preseason Week 2" },
    { date:"20260821", label:"Fri Aug 21",  weekType:"Preseason", weekLabel:"PS Wk 2", fullLabel:"Preseason Week 2" },
    { date:"20260822", label:"Sat Aug 22",  weekType:"Preseason", weekLabel:"PS Wk 2", fullLabel:"Preseason Week 2" },
    { date:"20260823", label:"Sun Aug 23",  weekType:"Preseason", weekLabel:"PS Wk 2", fullLabel:"Preseason Week 2" },
    { date:"20260827", label:"Thu Aug 27",  weekType:"Preseason", weekLabel:"PS Wk 3", fullLabel:"Preseason Week 3" },
    { date:"20260828", label:"Fri Aug 28",  weekType:"Preseason", weekLabel:"PS Wk 3", fullLabel:"Preseason Week 3" },
    { date:"20260829", label:"Sat Aug 29",  weekType:"Preseason", weekLabel:"PS Wk 3", fullLabel:"Preseason Week 3" },
    // Regular Season
    { date:"20260909", label:"Wed Sep 9",   weekType:"Regular",   weekLabel:"Week 1",  fullLabel:"Regular Season Week 1" },
    { date:"20260910", label:"Thu Sep 10",  weekType:"Regular",   weekLabel:"Week 1",  fullLabel:"Regular Season Week 1" },
    { date:"20260913", label:"Sun Sep 13",  weekType:"Regular",   weekLabel:"Week 1",  fullLabel:"Regular Season Week 1" },
    { date:"20260914", label:"Mon Sep 14",  weekType:"Regular",   weekLabel:"Week 1",  fullLabel:"Regular Season Week 1" },
    { date:"20260917", label:"Thu Sep 17",  weekType:"Regular",   weekLabel:"Week 2",  fullLabel:"Regular Season Week 2" },
    { date:"20260920", label:"Sun Sep 20",  weekType:"Regular",   weekLabel:"Week 2",  fullLabel:"Regular Season Week 2" },
    { date:"20260921", label:"Mon Sep 21",  weekType:"Regular",   weekLabel:"Week 2",  fullLabel:"Regular Season Week 2" },
    { date:"20260924", label:"Thu Sep 24",  weekType:"Regular",   weekLabel:"Week 3",  fullLabel:"Regular Season Week 3" },
    { date:"20260927", label:"Sun Sep 27",  weekType:"Regular",   weekLabel:"Week 3",  fullLabel:"Regular Season Week 3" },
    { date:"20260928", label:"Mon Sep 28",  weekType:"Regular",   weekLabel:"Week 3",  fullLabel:"Regular Season Week 3" },
    { date:"20261001", label:"Thu Oct 1",   weekType:"Regular",   weekLabel:"Week 4",  fullLabel:"Regular Season Week 4" },
    { date:"20261004", label:"Sun Oct 4",   weekType:"Regular",   weekLabel:"Week 4",  fullLabel:"Regular Season Week 4" },
    { date:"20261005", label:"Mon Oct 5",   weekType:"Regular",   weekLabel:"Week 4",  fullLabel:"Regular Season Week 4" },
    { date:"20261008", label:"Thu Oct 8",   weekType:"Regular",   weekLabel:"Week 5",  fullLabel:"Regular Season Week 5" },
    { date:"20261011", label:"Sun Oct 11",  weekType:"Regular",   weekLabel:"Week 5",  fullLabel:"Regular Season Week 5" },
    { date:"20261012", label:"Mon Oct 12",  weekType:"Regular",   weekLabel:"Week 5",  fullLabel:"Regular Season Week 5" },
    { date:"20261015", label:"Thu Oct 15",  weekType:"Regular",   weekLabel:"Week 6",  fullLabel:"Regular Season Week 6" },
    { date:"20261018", label:"Sun Oct 18",  weekType:"Regular",   weekLabel:"Week 6",  fullLabel:"Regular Season Week 6" },
    { date:"20261019", label:"Mon Oct 19",  weekType:"Regular",   weekLabel:"Week 6",  fullLabel:"Regular Season Week 6" },
    { date:"20261022", label:"Thu Oct 22",  weekType:"Regular",   weekLabel:"Week 7",  fullLabel:"Regular Season Week 7" },
    { date:"20261025", label:"Sun Oct 25",  weekType:"Regular",   weekLabel:"Week 7",  fullLabel:"Regular Season Week 7" },
    { date:"20261026", label:"Mon Oct 26",  weekType:"Regular",   weekLabel:"Week 7",  fullLabel:"Regular Season Week 7" },
    { date:"20261029", label:"Thu Oct 29",  weekType:"Regular",   weekLabel:"Week 8",  fullLabel:"Regular Season Week 8" },
    { date:"20261101", label:"Sun Nov 1",   weekType:"Regular",   weekLabel:"Week 8",  fullLabel:"Regular Season Week 8" },
    { date:"20261102", label:"Mon Nov 2",   weekType:"Regular",   weekLabel:"Week 8",  fullLabel:"Regular Season Week 8" },
    { date:"20261105", label:"Thu Nov 5",   weekType:"Regular",   weekLabel:"Week 9",  fullLabel:"Regular Season Week 9" },
    { date:"20261108", label:"Sun Nov 8",   weekType:"Regular",   weekLabel:"Week 9",  fullLabel:"Regular Season Week 9" },
    { date:"20261109", label:"Mon Nov 9",   weekType:"Regular",   weekLabel:"Week 9",  fullLabel:"Regular Season Week 9" },
    { date:"20261112", label:"Thu Nov 12",  weekType:"Regular",   weekLabel:"Week 10", fullLabel:"Regular Season Week 10" },
    { date:"20261115", label:"Sun Nov 15",  weekType:"Regular",   weekLabel:"Week 10", fullLabel:"Regular Season Week 10" },
    { date:"20261116", label:"Mon Nov 16",  weekType:"Regular",   weekLabel:"Week 10", fullLabel:"Regular Season Week 10" },
    { date:"20261119", label:"Thu Nov 19",  weekType:"Regular",   weekLabel:"Week 11", fullLabel:"Regular Season Week 11" },
    { date:"20261122", label:"Sun Nov 22",  weekType:"Regular",   weekLabel:"Week 11", fullLabel:"Regular Season Week 11" },
    { date:"20261123", label:"Mon Nov 23",  weekType:"Regular",   weekLabel:"Week 11", fullLabel:"Regular Season Week 11" },
    { date:"20261125", label:"Wed Nov 25",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261126", label:"Thu Nov 26",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12", holiday:"Thanksgiving" },
    { date:"20261127", label:"Fri Nov 27",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261129", label:"Sun Nov 29",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261130", label:"Mon Nov 30",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261203", label:"Thu Dec 3",   weekType:"Regular",   weekLabel:"Week 13", fullLabel:"Regular Season Week 13" },
    { date:"20261206", label:"Sun Dec 6",   weekType:"Regular",   weekLabel:"Week 13", fullLabel:"Regular Season Week 13" },
    { date:"20261207", label:"Mon Dec 7",   weekType:"Regular",   weekLabel:"Week 13", fullLabel:"Regular Season Week 13" },
    { date:"20261210", label:"Thu Dec 10",  weekType:"Regular",   weekLabel:"Week 14", fullLabel:"Regular Season Week 14" },
    { date:"20261213", label:"Sun Dec 13",  weekType:"Regular",   weekLabel:"Week 14", fullLabel:"Regular Season Week 14" },
    { date:"20261214", label:"Mon Dec 14",  weekType:"Regular",   weekLabel:"Week 14", fullLabel:"Regular Season Week 14" },
    { date:"20261217", label:"Thu Dec 17",  weekType:"Regular",   weekLabel:"Week 15", fullLabel:"Regular Season Week 15" },
    { date:"20261219", label:"Sat Dec 19",  weekType:"Regular",   weekLabel:"Week 15", fullLabel:"Regular Season Week 15" },
    { date:"20261220", label:"Sun Dec 20",  weekType:"Regular",   weekLabel:"Week 15", fullLabel:"Regular Season Week 15" },
    { date:"20261221", label:"Mon Dec 21",  weekType:"Regular",   weekLabel:"Week 15", fullLabel:"Regular Season Week 15" },
    { date:"20261224", label:"Thu Dec 24",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16" },
    { date:"20261225", label:"Fri Dec 25",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16", holiday:"Christmas" },
    { date:"20261227", label:"Sun Dec 27",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16" },
    { date:"20261228", label:"Mon Dec 28",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16" },
    { date:"20261231", label:"Thu Dec 31",  weekType:"Regular",   weekLabel:"Week 17", fullLabel:"Regular Season Week 17" },
    { date:"20270103", label:"Sun Jan 3",   weekType:"Regular",   weekLabel:"Week 17", fullLabel:"Regular Season Week 17" },
    { date:"20270104", label:"Mon Jan 4",   weekType:"Regular",   weekLabel:"Week 17", fullLabel:"Regular Season Week 17" },
    { date:"20270110", label:"Sun Jan 10",  weekType:"Regular",   weekLabel:"Week 18", fullLabel:"Regular Season Week 18" },
    { date:"20270111", label:"Mon Jan 11",  weekType:"Regular",   weekLabel:"Week 18", fullLabel:"Regular Season Week 18" },
    // Playoffs
    { date:"20270117", label:"Sat Jan 17",  weekType:"Playoffs",  weekLabel:"TBD",         fullLabel:"Wild Card Weekend" },
    { date:"20270118", label:"Sun Jan 18",  weekType:"Playoffs",  weekLabel:"TBD",         fullLabel:"Wild Card Weekend" },
    { date:"20270119", label:"Mon Jan 19",  weekType:"Playoffs",  weekLabel:"TBD",         fullLabel:"Wild Card Weekend" },
    { date:"20270124", label:"Sat Jan 24",  weekType:"Playoffs",  weekLabel:"TBD",         fullLabel:"Divisional Round" },
    { date:"20270125", label:"Sun Jan 25",  weekType:"Playoffs",  weekLabel:"TBD",         fullLabel:"Divisional Round" },
    { date:"20270201", label:"Sun Feb 1",   weekType:"Playoffs",  weekLabel:"TBD",         fullLabel:"Conference Championships" },
    { date:"20270214", label:"Sun Feb 14",  weekType:"Playoffs",  weekLabel:"Super Bowl",  fullLabel:"Super Bowl LXI" },
];

// ── State ─────────────────────────────────────────────────────────────────────
let activeIdx    = 0;
let liveRefreshInterval = null;
const expandedGameIDs = new Set();
const boxscoreCache   = new Map();
let gameTeamStats = {};

async function loadGameTeamStats() {
    try {
        const r = await fetch("/api/team-stats");
        if (!r.ok) return;
        const data = await r.json();
        gameTeamStats = {};
        for (const t of (Array.isArray(data) ? data : [])) {
            if (t.abbr) gameTeamStats[t.abbr] = t;
        }
    } catch (_) {}
}

// Pre-game win probability using each team's current win percentage.
// Simple logit-style model: win% difference → probability.
function preGameWinProb(away, home) {
    const at = gameTeamStats[away];
    const ht = gameTeamStats[home];
    if (!at && !ht) return null;
    const awayW = at ? (+(at.won||0) / Math.max(1, +(at.won||0) + +(at.lost||0) + +(at.tied||0))) : 0.5;
    const homeW = ht ? (+(ht.won||0) / Math.max(1, +(ht.won||0) + +(ht.lost||0) + +(ht.tied||0))) : 0.5;
    // Home-field advantage worth ~3 pts ≈ ~7% win probability
    const homeAdj = homeW + 0.07 * (1 - homeW * 2 + homeW);
    const total   = awayW + homeAdj;
    if (total === 0) return { away: 0.5, home: 0.5 };
    const h = Math.max(0.05, Math.min(0.95, homeAdj / total));
    return { away: +(1 - h).toFixed(3), home: +h.toFixed(3) };
}

function preGameWinProbBar(game) {
    const away = game.awayTeam ?? "TBD";
    const home = game.homeTeam ?? "TBD";
    const prob = preGameWinProb(away, home);
    if (!prob) return "";
    const aC = TEAM_COLORS[away] || "#4080CC";
    const hC = TEAM_COLORS[home] || "#CC4040";
    const splitPct = (prob.away * 100).toFixed(1);
    return `<div class="gc-winprob">
  <span class="gc-wp-label">${Math.round(prob.away * 100)}%</span>
  <div class="gc-wp-bar" style="background:linear-gradient(to right,${aC} calc(${splitPct}% - 4px),${hC} calc(${splitPct}% + 4px))"></div>
  <span class="gc-wp-label">${Math.round(prob.home * 100)}%</span>
</div>`;
}

function parseQtr(q) {
    if (!q) return 1;
    const n = String(q).replace(/^(\d+)(?:st|nd|rd|th)$/i, "$1");
    const num = parseInt(n, 10);
    return isNaN(num) ? (String(q).toUpperCase().startsWith("OT") ? 5 : 1) : num;
}

function winProbBar(game) {
    const scoreAway = +(game.awayScore || 0);
    const scoreHome = +(game.homeScore || 0);
    const diff = scoreHome - scoreAway;
    const qtr = parseQtr(game.quarter);
    const clockStr = game.clock || "15:00";
    const [mStr, sStr] = clockStr.split(":");
    const secsLeft = (+(mStr||15)) * 60 + (+(sStr||0));
    const totalGameSecs = 3600;
    const secsElapsed = Math.min((qtr - 1) * 900 + (900 - secsLeft), totalGameSecs);
    const timeWeight = Math.min(secsElapsed / totalGameSecs, 1);
    const maxDiff = 28;
    const rawProb = 0.5 + (diff / maxDiff) * 0.5 * timeWeight;
    const homeProb = Math.max(0.03, Math.min(0.97, rawProb));
    const awayProb = 1 - homeProb;
    const away = game.awayTeam ?? "TBD";
    const home = game.homeTeam ?? "TBD";
    const aC = TEAM_COLORS[away] || "#4080CC";
    const hC = TEAM_COLORS[home] || "#CC4040";
    const splitPct = (awayProb * 100).toFixed(1);
    return `<div class="gc-winprob">
  <span class="gc-wp-label">${Math.round(awayProb * 100)}%</span>
  <div class="gc-wp-bar" style="background:linear-gradient(to right,${aC} calc(${splitPct}% - 4px),${hC} calc(${splitPct}% + 4px))"></div>
  <span class="gc-wp-label">${Math.round(homeProb * 100)}%</span>
</div>`;
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function buildCalendar() {
    const track = document.getElementById("cal-track");
    if (!track) return;
    track.innerHTML = "";

    const BTN_W = 82;  // fixed button width in px
    const GAP   = 2;   // gap between every adjacent item in px
    const spanPx = n => n * BTN_W + (n - 1) * GAP;

    // Group dates into seasons → weeks
    const seasons = [];
    let curSeason = null, curWeek = null;
    SCHEDULE_DATES.forEach((day, i) => {
        if (!curSeason || curSeason.type !== day.weekType) {
            curSeason = { type: day.weekType, count: 0, weeks: [] };
            seasons.push(curSeason);
            curWeek = null;
        }
        curSeason.count++;
        if (!curWeek || curWeek.label !== day.weekLabel) {
            curWeek = { label: day.weekLabel, count: 0 };
            curSeason.weeks.push(curWeek);
        }
        curWeek.count++;
    });

    const inner = document.createElement("div");
    inner.className = "cal-inner";

    // ── Row 1: season + week labels ──────────────────────────────────────────
    const labelsRow = document.createElement("div");
    labelsRow.className = "cal-labels-row";

    for (const season of seasons) {
        const slot = document.createElement("div");
        slot.className = "cal-season-slot";
        slot.style.width = spanPx(season.count) + "px";

        const sl = document.createElement("div");
        sl.className = "cal-season-label";
        sl.textContent = season.type === "Regular" ? "Regular Season" : season.type;
        slot.appendChild(sl);

        const wRow = document.createElement("div");
        wRow.className = "cal-week-labels";

        for (const week of season.weeks) {
            const wl = document.createElement("div");
            wl.className = "cal-week-label";
            wl.style.width = spanPx(week.count) + "px";
            wl.textContent = week.label.replace(/^PS Wk /, "Week ");
            wRow.appendChild(wl);
        }

        slot.appendChild(wRow);
        labelsRow.appendChild(slot);
    }

    // ── Row 2: date buttons ──────────────────────────────────────────────────
    const datesRow = document.createElement("div");
    datesRow.className = "cal-dates-row";

    SCHEDULE_DATES.forEach((day, i) => {
        const btn = document.createElement("button");
        btn.className = "cal-day";
        btn.dataset.idx = i;
        btn.style.width = BTN_W + "px";

        if (day.date < TODAY)        btn.classList.add("past");
        else if (day.date === TODAY)  btn.classList.add("today");
        else                          btn.classList.add("future");

        if (day.weekType === "Playoffs") {
            btn.innerHTML = `<span class="cal-week-type post">${day.weekLabel}</span><span class="cal-day-label">${day.label}</span>`;
        } else if (day.holiday) {
            btn.innerHTML = `<span class="cal-week-type post">${day.holiday}</span><span class="cal-day-label">${day.label}</span>`;
        } else {
            btn.innerHTML = `<span class="cal-day-label">${day.label}</span>`;
        }

        btn.addEventListener("click", () => showDay(i));
        datesRow.appendChild(btn);
    });

    inner.appendChild(labelsRow);
    inner.appendChild(datesRow);
    track.appendChild(inner);
}

// ── Show a day — fetch games from server, render ──────────────────────────────
async function showDay(idx) {
    activeIdx = idx;

    document.querySelectorAll(".cal-day").forEach(el => {
        el.classList.toggle("active", +el.dataset.idx === idx);
    });

    const day = SCHEDULE_DATES[idx];

    const weekId = day.weekLabel === "TBD" ? day.fullLabel
                  : day.weekType === "Regular"  ? `Regular Season ${day.weekLabel}`
                  : day.weekType === "Playoffs" ? day.weekLabel
                  : day.fullLabel;
    const holidaySuffix = day.holiday ? ` · ${day.holiday}` : "";
    document.getElementById("day-label").textContent = `${weekId} — ${day.label}${holidaySuffix}`;
    document.getElementById("day-badge").textContent =
        day.date === TODAY ? "Today" : day.date < TODAY ? "Final" : "Upcoming";

    const grid = document.getElementById("games-grid");
    grid.innerHTML = `<div class="games-loading">Loading games…</div>`;

    // Stop any existing live-refresh loop
    if (liveRefreshInterval) { clearInterval(liveRefreshInterval); liveRefreshInterval = null; }

    await renderGamesForDate(day.date, grid);

    // If viewing today, auto-refresh every 60 s (poller keeps server cache fresh)
    if (day.date === TODAY) {
        liveRefreshInterval = setInterval(() => renderGamesForDate(day.date, grid), 60_000);
    }
}

// Format "1:00p ET" or "1:00pm ET" → "1:00pm ET"
function formatKickoff(t) {
    if (!t) return "";
    // Replace trailing single 'p'/'a' (not already followed by 'm') with 'pm'/'am'
    return String(t).replace(/(\d)(p|a)(?!m)(\s|$)/gi, (_, d, ap, tail) => `${d}${ap.toLowerCase()}m${tail}`);
}

function kickoffToMinutes(t) {
    if (!t) return 9999;
    // Match both "1:00pm" and "1:00p" formats
    const m = String(t).match(/(\d+):(\d+)\s*(am|pm|a|p)\b/i);
    if (!m) return 9999;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const ap = m[3][0].toLowerCase();
    if (ap === "p" && h !== 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return h * 60 + min;
}

async function renderGamesForDate(dateStr, grid) {
    try {
        const res  = await fetch(`/api/games?date=${dateStr}`);
        const data = await res.json();

        if (!res.ok || data.status === "no-key") {
            const msg = data.status === "no-key"
                ? "Game data unavailable — API key not configured."
                : "Score updates temporarily paused (API limit reached). Scores will resume automatically.";
            grid.innerHTML = `<div class="no-games">${msg}</div>`;
            return;
        }

        const games = data.games ?? [];
        if (games.length === 0) {
            grid.innerHTML = `<div class="no-games">No games scheduled.</div>`;
            return;
        }

        // Live first, then upcoming, then final — within each group sorted by kickoff time
        const STATUS_ORDER = { live: 0, upcoming: 1, final: 2 };
        const sorted = [...games].sort((a, b) => {
            const sd = (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);
            return sd !== 0 ? sd : kickoffToMinutes(a.kickoff) - kickoffToMinutes(b.kickoff);
        });
        grid.innerHTML = sorted.map(renderCard).join("");

        // Restore expanded state that survived the re-render (move to top in order).
        // Check both live and final cards — a live game can become final between refreshes.
        for (const gid of expandedGameIDs) {
            const card = grid.querySelector(`.game-card--live[data-gameid="${gid}"], .game-card--final[data-gameid="${gid}"]`);
            if (card) {
                card.classList.add("game-card--expanded");
                const alreadyExpanded = [...grid.querySelectorAll(".game-card--expanded")].filter(c => c !== card);
                if (alreadyExpanded.length === 0) grid.prepend(card);
                else alreadyExpanded[alreadyExpanded.length - 1].after(card);
            }
        }
    } catch (err) {
        grid.innerHTML = `<div class="no-games">Failed to load game data.</div>`;
        console.error("Games fetch error:", err);
    }
}

// ── Card rendering ─────────────────────────────────────────────────────────────
function renderCard(game) {
    if (game.status === "final")    return renderFinal(game);
    if (game.status === "live")     return renderLive(game);
    return renderUpcoming(game);
}

function logoImg(abbr) {
    if (!abbr || abbr === "TBD")
        return `<div class="gc-logo" style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:1.4rem">🏈</div>`;
    return `<img class="gc-logo" src="${ESPN_LOGO(abbr)}" alt="${abbr}" onerror="this.style.display='none'">`;
}

function renderUpcoming(game) {
    const away = game.awayTeam ?? "TBD";
    const home = game.homeTeam ?? "TBD";
    const awayName = T[away]?.[0] ?? away;
    const homeName = T[home]?.[0] ?? home;
    const stadium  = T[home]?.[1] ?? "";
    const channel  = game.channel ? ` · ${game.channel}` : "";
    const wpBar    = preGameWinProbBar(game);
    return `
<div class="game-card">
  <div class="gc-header">
    <span>${formatKickoff(game.kickoff)}${channel}</span>
    <span class="gc-status-badge upcoming">Upcoming</span>
  </div>
  <div class="gc-body">
    <div class="gc-teams">
      <div class="gc-team">
        ${logoImg(away)}
        <span class="gc-abbr">${away}</span>
        <span class="gc-name">${awayName}</span>
        <span class="gc-record">${game.awayRecord || ""}</span>
      </div>
      <div class="gc-center">
        <span class="gc-vs">@</span>
      </div>
      <div class="gc-team">
        ${logoImg(home)}
        <span class="gc-abbr">${home}</span>
        <span class="gc-name">${homeName}</span>
        <span class="gc-record">${game.homeRecord || ""}</span>
      </div>
    </div>
    ${wpBar}
    ${stadium ? `<div class="gc-footer"><div class="gc-stadium"><span class="gc-stadium-icon">🏟</span><span>${stadium}</span></div></div>` : ""}
  </div>
</div>`;
}

function ordinal(n) {
    const i = parseInt(n);
    if (i === 1) return "1st";
    if (i === 2) return "2nd";
    if (i === 3) return "3rd";
    return `${i}th`;
}

function buildFieldLine(yardLine, possession, homeTeam, awayTeam) {
    const aC = TEAM_COLORS[awayTeam] || "#4080CC";
    const hC = TEAM_COLORS[homeTeam] || "#CC4040";

    // Parse ball position — only when we have actual yardLine data
    let ballX = null;
    if (yardLine) {
        ballX = 60; // fallback if parsing fails
        const m = String(yardLine).match(/([A-Za-z]+)\s*(\d+)/);
        if (m) {
            const team = m[1].toUpperCase(), yard = parseInt(m[2]);
            if (team === awayTeam)      ballX = 10 + yard;
            else if (team === homeTeam) ballX = 110 - yard;
        } else {
            const n = parseInt(yardLine);
            if (!isNaN(n)) ballX = 10 + n;
        }
        ballX = Math.max(10, Math.min(110, ballX));
    }

    // Color split: when we know where the ball is use it; otherwise 50/50
    const splitX   = ballX ?? 60;
    const splitPct = (splitX / 120) * 100;

    // Hash marks at every 10 yards with yard-line labels
    const yardLabels = [10,20,30,40,50,60,70,80,90,100,110];
    const hashes = yardLabels.map(x => {
        const pct = (x / 120 * 100).toFixed(2);
        const col = x <= splitX ? aC : hC;
        const dist = x <= 60 ? (x - 10) : (110 - x);
        const label = dist === 0 ? "" : (dist === 50 ? "50" : String(dist));
        return `<div class="gc-fl-hash" style="left:${pct}%;background:${col}"><span class="gc-fl-yard">${label}</span></div>`;
    }).join("");

    // Only render ball SVG when we have real position data
    const ballHtml = ballX !== null ? `<div class="gc-fl-ball" style="left:${splitPct.toFixed(2)}%">
        <svg class="gc-fl-ball-svg" viewBox="0 0 20 12" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="10" cy="6" rx="9" ry="5" fill="#d07828" stroke="#1a0800" stroke-width="0.7"/>
            <line x1="1.5" y1="6" x2="18.5" y2="6" stroke="#fff" stroke-width="1" opacity="0.8"/>
            <line x1="8" y1="2.5" x2="8" y2="9.5" stroke="#fff" stroke-width="0.8" opacity="0.65"/>
            <line x1="10" y1="1.4" x2="10" y2="10.6" stroke="#fff" stroke-width="0.8" opacity="0.65"/>
            <line x1="12" y1="2.5" x2="12" y2="9.5" stroke="#fff" stroke-width="0.8" opacity="0.65"/>
        </svg>
    </div>` : "";

    const awayLabel = `<span class="gc-fl-endzone gc-fl-endzone--away" style="color:${aC}">${awayTeam}</span>`;
    const homeLabel = `<span class="gc-fl-endzone gc-fl-endzone--home" style="color:${hC}">${homeTeam}</span>`;

    return `<div class="gc-field-line-wrap">
        <div class="gc-fl-teams">${awayLabel}${homeLabel}</div>
        <div class="gc-fl-bar" style="background:linear-gradient(to right,${aC} calc(${splitPct.toFixed(1)}% - 4px),${hC} calc(${splitPct.toFixed(1)}% + 4px))">
            ${hashes}
            ${ballHtml}
        </div>
    </div>`;
}

const ICON_CHART = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><rect x="2" y="11" width="3" height="7" rx="1"/><rect x="8.5" y="6" width="3" height="12" rx="1"/><rect x="15" y="8.5" width="3" height="9.5" rx="1"/></svg>`;
const ICON_FOOTBALL = `<svg viewBox="0 0 20 14" width="18" height="13" fill="none"><ellipse cx="10" cy="7" rx="9" ry="5.5" fill="#c8742a" stroke="#1a0a00" stroke-width="0.8"/><line x1="2" y1="7" x2="18" y2="7" stroke="#fff" stroke-width="1" opacity="0.7"/><line x1="8.5" y1="3" x2="8.5" y2="11" stroke="#fff" stroke-width="0.8" opacity="0.55"/><line x1="10" y1="2" x2="10" y2="12" stroke="#fff" stroke-width="0.8" opacity="0.55"/><line x1="11.5" y1="3" x2="11.5" y2="11" stroke="#fff" stroke-width="0.8" opacity="0.55"/></svg>`;

function buildStatGroup(label, rows) {
    if (!rows.length) return "";
    const hdrs = rows[0].cols.map(c => `<th>${c.l}</th>`).join("");
    const trs  = rows.map(r => {
        const cells = r.cols.map(c => `<td>${c.v}</td>`).join("");
        return `<tr><td class="gc-st-name">${r.name}</td>${cells}</tr>`;
    }).join("");
    return `<div class="gc-stat-grp">
  <div class="gc-stat-grp-lbl">${label}</div>
  <table class="gc-stat-tbl"><thead><tr><th></th>${hdrs}</tr></thead><tbody>${trs}</tbody></table>
</div>`;
}

function buildOffenseStats(players) {
    const s = str => (str !== undefined && str !== null && str !== "") ? str : "—";
    let html = "";

    const passers = players.filter(p => p.Passing);
    if (passers.length) {
        html += buildStatGroup("Passing", passers.map(p => ({
            name: p.name,
            cols: [
                { l:"C/A",  v:`${s(p.Passing.passCompletions)}/${s(p.Passing.passAttempts)}` },
                { l:"YDS",  v: s(p.Passing.passYds) },
                { l:"TD",   v: s(p.Passing.passTD) },
                { l:"INT",  v: s(p.Passing.int) },
                { l:"RTG",  v: s(p.Passing.rtg) },
            ]
        })));
    }

    const rushers = players.filter(p => p.Rushing);
    if (rushers.length) {
        html += buildStatGroup("Rushing", rushers.map(p => ({
            name: p.name,
            cols: [
                { l:"CAR",  v: s(p.Rushing.carries) },
                { l:"YDS",  v: s(p.Rushing.rushYds) },
                { l:"AVG",  v: s(p.Rushing.rushAvg) },
                { l:"TD",   v: s(p.Rushing.rushTD) },
                { l:"LNG",  v: s(p.Rushing.longRush) },
            ]
        })));
    }

    const receivers = players.filter(p => p.Receiving);
    if (receivers.length) {
        html += buildStatGroup("Receiving", receivers.map(p => ({
            name: p.name,
            cols: [
                { l:"REC",  v: s(p.Receiving.receptions) },
                { l:"TGT",  v: s(p.Receiving.targets) },
                { l:"YDS",  v: s(p.Receiving.recYds) },
                { l:"TD",   v: s(p.Receiving.recTD) },
                { l:"LNG",  v: s(p.Receiving.longRec) },
            ]
        })));
    }

    const kickers = players.filter(p => p.Kicking);
    if (kickers.length) {
        html += buildStatGroup("Kicking", kickers.map(p => ({
            name: p.name,
            cols: [
                { l:"FG",  v: s(p.Kicking.fgMade) !== "—"
                    ? `${s(p.Kicking.fgMade)}/${s(p.Kicking.fgAttempts)}`
                    : s(p.Kicking.fgMade) },
                { l:"XP",  v: s(p.Kicking.xpMade) },
                { l:"PTS", v: s(p.Kicking.kickPts ?? p.Kicking.totalPts) },
            ]
        })));
    }

    return html || `<div class="gc-stats-empty">No offensive stats yet</div>`;
}

function buildDefenseStats(players) {
    const s = str => (str !== undefined && str !== null && str !== "") ? str : "—";
    const defenders = players.filter(p => p.Defense);
    if (!defenders.length) return `<div class="gc-stats-empty">No defensive stats yet</div>`;
    return buildStatGroup("Defense", defenders.map(p => ({
        name: p.name,
        cols: [
            { l:"TCKL", v: s(p.Defense.totalTackles) },
            { l:"SACK", v: s(p.Defense.sacks) },
            { l:"TFL",  v: s(p.Defense.tfl) },
            { l:"INT",  v: s(p.Defense.int) },
            { l:"PD",   v: s(p.Defense.passDeflections) },
        ]
    })));
}

function buildStatsPanel(game, awayAbbr, homeAbbr, hidden = true) {
    const players = Array.isArray(game.playerStats) ? game.playerStats : [];
    const awayP = players.filter(p => p.team === awayAbbr);
    const homeP = players.filter(p => p.team === homeAbbr);

    const aC = TEAM_COLORS[awayAbbr] || "#4080CC";
    const hC = TEAM_COLORS[homeAbbr] || "#CC4040";

    const col = (teamPlayers, abbr, color) => `
      <div class="gc-stats-col">
        <div class="gc-stats-col-hdr" style="color:${color}">${abbr}</div>
        <div class="gc-stats-col-scroll">
          <div data-sp-content="off">${buildOffenseStats(teamPlayers)}</div>
          <div data-sp-content="def" style="display:none">${buildDefenseStats(teamPlayers)}</div>
        </div>
      </div>`;

    return `<div class="gc-stats-panel" data-panel="stats"${hidden ? ' style="display:none"' : ''}>
  <div class="gc-stats-bar">
    <button class="gc-sp-tab active" data-sp-side="off">Offense</button>
    <button class="gc-sp-tab" data-sp-side="def">Defense</button>
  </div>
  <div class="gc-stats-cols">
    ${col(awayP, awayAbbr, aC)}
    <div class="gc-stats-sep"></div>
    ${col(homeP, homeAbbr, hC)}
  </div>
</div>`;
}

// Parse yard line + possession from a lastPlay text string when direct fields are missing.
// Returns { yardLine, possession } — both may be null if parsing fails.
function parseLastPlay(text, away, home) {
    if (!text) return { yardLine: null, possession: null };
    const teams = [away, home].filter(Boolean).map(t => t.toUpperCase());

    // Look for "to the TEAM YD" patterns, e.g. "to the KC 25" or "at the SF 40"
    const m = text.match(/\bat\s+the\s+([A-Z]{2,3})\s+(\d+)\b/i)
           || text.match(/\bto\s+the\s+([A-Z]{2,3})\s+(\d+)\b/i)
           || text.match(/\bon\s+the\s+([A-Z]{2,3})\s+(\d+)\b/i);
    const yardLine = m ? `${m[1].toUpperCase()} ${m[2]}` : null;

    // Possession: first team abbreviation in parenthetical clock "(2:15) TEAM" or "<TEAM> rush/pass/sacked"
    let possession = null;
    const pMatch = text.match(/^\([^)]*\)\s+([A-Z]{2,3})[-\s]/);
    if (pMatch && teams.includes(pMatch[1].toUpperCase())) {
        possession = pMatch[1].toUpperCase();
    } else {
        // Try to find which team is mentioned first as a possessing actor
        for (const t of teams) {
            const re = new RegExp(`\\b${t}\\b`, "i");
            if (re.test(text)) { possession = t; break; }
        }
    }
    return { yardLine, possession };
}

function renderLive(game) {
    const away = game.awayTeam ?? "TBD";
    const home = game.homeTeam ?? "TBD";
    const awayName = T[away]?.[0] ?? away;
    const homeName = T[home]?.[0] ?? home;
    const stadium  = T[home]?.[1] ?? "";
    const scoreAway = game.awayScore ?? "-";
    const scoreHome = game.homeScore ?? "-";
    const qtrNum = parseQtr(game.quarter);
    const qtr    = game.quarter ? (qtrNum >= 5 ? "OT" : `Q${qtrNum}`) : "";
    const clock  = game.clock  ? game.clock : "";
    const qtrClock = qtr && clock ? `${qtr} · ${clock}` : (qtr || clock || "Live");

    // Use direct fields first; fall back to parsing lastPlay
    let yardLine  = game.yardLine  || null;
    let rawPoss   = game.possession && game.possession !== "TBD" ? game.possession.toUpperCase() : null;
    if ((!yardLine || !rawPoss) && game.lastPlay) {
        const parsed = parseLastPlay(game.lastPlay, away, home);
        if (!yardLine  && parsed.yardLine)  yardLine = parsed.yardLine;
        if (!rawPoss   && parsed.possession) rawPoss  = parsed.possession;
    }

    const poss        = rawPoss;
    const awayHasBall = poss && (poss === away.toUpperCase() || poss === awayName.toUpperCase());
    const homeHasBall = poss && (poss === home.toUpperCase() || poss === homeName.toUpperCase());

    const fieldLine = buildFieldLine(yardLine, poss, home, away);
    const downDist = (game.down && game.yardsToGo)
        ? `${ordinal(game.down)} &amp; ${game.yardsToGo}${game.yardLine ? ` · ${game.yardLine}` : ""}`
        : (game.yardLine ? `At ${game.yardLine}` : "");
    const lastPlayHtml = buildPlayLog(game, away, home);
    const stadiumFooter = stadium
        ? `<div class="gc-footer"><div class="gc-stadium"><span class="gc-stadium-icon">🏟</span><span>${stadium}</span></div></div>`
        : "";
    const stadiumHeader = stadium
        ? `<span class="gc-header-stadium"><span class="gc-stadium-icon">🏟</span>${stadium}</span>`
        : "";

    return `
<div class="game-card game-card--live" data-gameid="${game.gameID}">
  <div class="gc-header">
    <span class="gc-live-info">● LIVE${qtr ? ` · ${qtr}` : ""}</span>
    ${stadiumHeader}
    <span class="gc-status-badge live">Live</span>
  </div>
  <div class="gc-live-summary">
    <div class="gc-body">
      <div class="gc-teams">
        <div class="gc-team ${awayHasBall ? "gc-team--has-ball" : ""}">
          <div class="gc-logo-wrap">
            ${logoImg(away)}
          </div>
          <span class="gc-abbr">${away}</span>
          <span class="gc-name">${awayName}</span>
          ${game.awayRecord ? `<span class="gc-record">${game.awayRecord}</span>` : ""}
        </div>
        <div class="gc-center">
          <div class="gc-scores">
            <span class="gc-score live">${scoreAway}</span>
            <span class="gc-dash">–</span>
            <span class="gc-score live">${scoreHome}</span>
          </div>
          <span class="gc-live-info">${qtrClock}</span>
        </div>
        <div class="gc-team ${homeHasBall ? "gc-team--has-ball" : ""}">
          <div class="gc-logo-wrap">
            ${logoImg(home)}
          </div>
          <span class="gc-abbr">${home}</span>
          <span class="gc-name">${homeName}</span>
          ${game.homeRecord ? `<span class="gc-record">${game.homeRecord}</span>` : ""}
        </div>
      </div>
      ${stadiumFooter}
    </div>
    ${winProbBar(game)}
  </div>
  <div class="gc-live-detail">
    <div class="gc-score-bar">
      <div class="gc-sb-team ${awayHasBall ? "gc-sb-team--has-ball" : ""}">
        <div class="gc-logo-wrap">${logoImg(away)}</div>
        <span class="gc-sb-abbr">${away}</span>
      </div>
      <span class="gc-sb-score">${scoreAway}</span>
      <div class="gc-sb-clock">
        <span class="gc-sb-qtr">${qtrClock}</span>
        ${downDist ? `<span class="gc-sb-down">${downDist}</span>` : ""}
      </div>
      <span class="gc-sb-score">${scoreHome}</span>
      <div class="gc-sb-team ${homeHasBall ? "gc-sb-team--has-ball" : ""}">
        <div class="gc-logo-wrap">${logoImg(home)}</div>
        <span class="gc-sb-abbr">${home}</span>
      </div>
      <button class="gc-view-toggle" data-active="plays" title="View Stats" aria-label="View Stats">${ICON_CHART}</button>
    </div>
    ${fieldLine}
    <div data-panel="plays">${lastPlayHtml}</div>
    ${buildStatsPanel(game, away, home)}
    ${buildLineScoreTable(game)}
  </div>
</div>`;
}

function buildPlayLog(game, awayAbbr, homeAbbr) {
    const scoreTypeIcon = { TD: "⬡", FG: "◆", SF: "▲", PAT: "○" };
    const teamColor = t => TEAM_COLORS[t] || "#888";

    // Scoring plays section
    let scoringHtml = "";
    if (Array.isArray(game.scoringPlays) && game.scoringPlays.length > 0) {
        const rows = game.scoringPlays.map((s, i) => {
            const isAway  = s.team === awayAbbr;
            const icon    = scoreTypeIcon[s.scoreType] || "⬡";
            const color   = teamColor(s.team);
            const period  = s.period ? s.period.replace(/^Q/, "") : "";
            const clock   = s.time || "";
            const label   = period && clock ? `Q${period} ${clock}` : (period ? `Q${period}` : "");
            const scoreStr= s.awayScore !== "" && s.homeScore !== ""
                ? `${s.awayScore}–${s.homeScore}`
                : "";
            return `<div class="gc-sp-row ${isAway ? "gc-sp-row--away" : "gc-sp-row--home"}">
  <div class="gc-sp-dot" style="background:${color};box-shadow:0 0 6px ${color}55"></div>
  <div class="gc-sp-body">
    <span class="gc-sp-type" style="color:${color}">${s.scoreType}</span>
    <span class="gc-sp-desc">${s.desc}</span>
    <span class="gc-sp-meta">${label}${scoreStr ? ` · <b>${scoreStr}</b>` : ""}</span>
  </div>
</div>`;
        }).join("");
        scoringHtml = `<div class="gc-play-section">
  <div class="gc-play-section-label">Scoring</div>
  <div class="gc-scoring-plays">${rows}</div>
</div>`;
    }

    // Recent plays section
    let recentHtml = "";
    const recent = game.recentPlays;
    if (Array.isArray(recent) && recent.length > 0) {
        const rows = recent.map(p => {
            const meta = [p.down, p.period && p.clock ? `Q${p.period.replace(/^Q/,"")} ${p.clock}` : ""].filter(Boolean).join(" · ");
            return `<div class="gc-rp-row">
  <span class="gc-rp-meta">${meta}</span>
  <span class="gc-rp-play">${p.play}</span>
</div>`;
        }).join("");
        recentHtml = `<div class="gc-play-section">
  <div class="gc-play-section-label">Recent Plays</div>
  <div class="gc-recent-plays">${rows}</div>
</div>`;
    } else if (!scoringHtml) {
        recentHtml = `<div class="gc-play-empty">Play data updates every ~2 min</div>`;
    }

    return `<div class="gc-play-log">${scoringHtml}${recentHtml}</div>`;
}

function buildLineScoreTable(game) {
    const ls = game.lineScore;
    if (!ls) return "";
    const qtrNum = parseQtr(game.quarter);
    const quarters = qtrNum >= 5
        ? ["Q1","Q2","Q3","Q4","OT"]
        : ["Q1","Q2","Q3","Q4"].slice(0, Math.max(qtrNum, 1));
    const cols = quarters.map(q => `<th class="gc-ls-q">${q}</th>`).join("") + "<th class='gc-ls-t'>T</th>";
    const awayRow = quarters.map(q => `<td>${ls.away?.[q] ?? ""}</td>`).join("") + `<td class="gc-ls-total">${game.awayScore ?? ""}</td>`;
    const homeRow = quarters.map(q => `<td>${ls.home?.[q] ?? ""}</td>`).join("") + `<td class="gc-ls-total">${game.homeScore ?? ""}</td>`;
    const away = game.awayTeam ?? "TBD";
    const home = game.homeTeam ?? "TBD";
    return `<div class="gc-linescore">
  <table class="gc-ls-table">
    <thead><tr><th class="gc-ls-team"></th>${cols}</tr></thead>
    <tbody>
      <tr><td class="gc-ls-team">${away}</td>${awayRow}</tr>
      <tr><td class="gc-ls-team">${home}</td>${homeRow}</tr>
    </tbody>
  </table>
</div>`;
}

function renderFinal(game) {
    const away = game.awayTeam ?? "TBD";
    const home = game.homeTeam ?? "TBD";
    const awayName = T[away]?.[0] ?? away;
    const homeName = T[home]?.[0] ?? home;
    const stadium  = T[home]?.[1] ?? "";
    const channel  = game.channel || "";
    const scoreAway = game.awayScore ?? 0;
    const scoreHome = game.homeScore ?? 0;
    const homeWon   = scoreHome > scoreAway;
    const awayWon   = scoreAway > scoreHome;

    return `
<div class="game-card game-card--final" data-gameid="${game.gameID ?? ""}" data-away="${away}" data-home="${home}">
  <div class="gc-header">
    <span>${channel}</span>
    <span class="gc-status-badge final">Final</span>
  </div>
  <div class="gc-final-summary">
    <div class="gc-body">
      <div class="gc-teams">
        <div class="gc-team ${awayWon ? "win-side" : homeWon ? "loss-side" : ""}">
          ${logoImg(away)}
          <span class="gc-abbr">${away}</span>
          <span class="gc-name">${awayName}</span>
          <span class="gc-record ${awayWon ? "winner" : ""}">${game.awayRecord || ""}</span>
        </div>
        <div class="gc-center">
          <div class="gc-scores">
            <span class="gc-score ${awayWon ? "winner" : homeWon ? "loser" : ""}">${scoreAway}</span>
            <span class="gc-dash">–</span>
            <span class="gc-score ${homeWon ? "winner" : awayWon ? "loser" : ""}">${scoreHome}</span>
          </div>
        </div>
        <div class="gc-team ${homeWon ? "win-side" : awayWon ? "loss-side" : ""}">
          ${logoImg(home)}
          <span class="gc-abbr">${home}</span>
          <span class="gc-name">${homeName}</span>
          <span class="gc-record ${homeWon ? "winner" : ""}">${game.homeRecord || ""}</span>
        </div>
      </div>
      ${stadium ? `<div class="gc-footer"><div class="gc-stadium"><span class="gc-stadium-icon">🏟</span>${stadium}</div></div>` : ""}
    </div>
  </div>
  <div class="gc-final-detail">
    <div class="gc-score-bar">
      <div class="gc-sb-team">${logoImg(away)}</div>
      <span class="gc-sb-score ${awayWon ? "winner" : homeWon ? "loser" : ""}">${scoreAway}</span>
      <div class="gc-sb-clock"><span class="gc-sb-final-label">Final</span></div>
      <span class="gc-sb-score ${homeWon ? "winner" : awayWon ? "loser" : ""}">${scoreHome}</span>
      <div class="gc-sb-team">${logoImg(home)}</div>
    </div>
    <div class="gc-bs-loading">Loading stats…</div>
  </div>
</div>`;
}

// ── Expandable live cards ─────────────────────────────────────────────────────
function setupLiveCardToggle() {
    document.getElementById("games-grid").addEventListener("click", e => {
        // Final card click — delegate to async handler, skip tab buttons (handled inline)
        const finalCard = e.target.closest(".game-card--final");
        if (finalCard) {
            if (e.target.closest(".gc-sp-tab")) return; // stats sub-tab clicks handled by injectFinalStats
            expandFinalCard(finalCard);
            return;
        }

        // Stats/Plays view toggle button (chart ↔ football)
        const toggleBtn = e.target.closest(".gc-view-toggle");
        if (toggleBtn) {
            e.stopPropagation();
            const card = toggleBtn.closest(".game-card--live");
            if (!card) return;
            const nowActive = toggleBtn.dataset.active === "plays" ? "stats" : "plays";
            toggleBtn.dataset.active = nowActive;
            toggleBtn.innerHTML = nowActive === "stats" ? ICON_FOOTBALL : ICON_CHART;
            toggleBtn.title = nowActive === "stats" ? "Back to Plays" : "View Stats";
            card.querySelectorAll("[data-panel]").forEach(panel => {
                panel.style.display = panel.dataset.panel === nowActive ? "" : "none";
            });
            return;
        }

        // Stats offense/defense sub-tabs
        const spTab = e.target.closest(".gc-sp-tab");
        if (spTab) {
            e.stopPropagation();
            const panel = spTab.closest(".gc-stats-panel");
            if (!panel) return;
            const side = spTab.dataset.spSide;
            panel.querySelectorAll(".gc-sp-tab").forEach(t => t.classList.toggle("active", t.dataset.spSide === side));
            panel.querySelectorAll("[data-sp-content]").forEach(c => {
                c.style.display = c.dataset.spContent === side ? "" : "none";
            });
            return;
        }

        // Live card click
        const card = e.target.closest(".game-card--live");
        if (!card) return;
        const gameId = card.dataset.gameid;
        if (!gameId) return;
        const grid = document.getElementById("games-grid");
        const isNowExpanded = card.classList.toggle("game-card--expanded");
        if (isNowExpanded) {
            expandedGameIDs.add(gameId);
            const alreadyExpanded = [...grid.querySelectorAll(".game-card--expanded")].filter(c => c !== card);
            if (alreadyExpanded.length === 0) grid.prepend(card);
            else alreadyExpanded[alreadyExpanded.length - 1].after(card);
        } else {
            expandedGameIDs.delete(gameId);
        }
    });
}

// ── Expandable final cards ────────────────────────────────────────────────────
async function expandFinalCard(card) {
    const gameId = card.dataset.gameid;
    if (!gameId) return;

    const grid = document.getElementById("games-grid");
    const isNowExpanded = card.classList.toggle("game-card--expanded");

    if (!isNowExpanded) return;

    const alreadyExpanded = [...grid.querySelectorAll(".game-card--expanded")].filter(c => c !== card);
    if (alreadyExpanded.length === 0) grid.prepend(card);
    else alreadyExpanded[alreadyExpanded.length - 1].after(card);

    // Already rendered stats panel — don't re-fetch
    if (card.querySelector(".gc-stats-panel")) return;

    const loadingEl = card.querySelector(".gc-bs-loading");

    // Use cache if available
    if (boxscoreCache.has(gameId)) {
        injectFinalStats(card, boxscoreCache.get(gameId));
        return;
    }

    try {
        const res  = await fetch(`/api/game-boxscore?gameID=${gameId}`);
        const data = await res.json();
        boxscoreCache.set(gameId, data);
        if (card.classList.contains("game-card--expanded")) {
            injectFinalStats(card, data);
        }
    } catch (err) {
        if (loadingEl) loadingEl.textContent = "Stats unavailable.";
        console.error("Boxscore fetch error:", err);
    }
}

function injectFinalStats(card, data) {
    const loadingEl = card.querySelector(".gc-bs-loading");
    const detail    = card.querySelector(".gc-final-detail");
    if (!detail) return;

    const away = data.away || card.dataset.away || "";
    const home = data.home || card.dataset.home || "";

    const statsHtml = buildStatsPanel(data, away, home, false);
    if (loadingEl) {
        loadingEl.outerHTML = statsHtml;
    } else {
        detail.insertAdjacentHTML("beforeend", statsHtml);
    }

    // Wire up the freshly-injected offense/defense tab clicks
    const panel = detail.querySelector(".gc-stats-panel");
    if (panel) {
        panel.querySelectorAll(".gc-sp-tab").forEach(tab => {
            tab.addEventListener("click", e => {
                e.stopPropagation();
                const side = tab.dataset.spSide;
                panel.querySelectorAll(".gc-sp-tab").forEach(t => t.classList.toggle("active", t.dataset.spSide === side));
                panel.querySelectorAll("[data-sp-content]").forEach(c => {
                    c.style.display = c.dataset.spContent === side ? "" : "none";
                });
            });
        });
    }
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
    loadGameTeamStats();
    buildCalendar();
    setupLiveCardToggle();

    let defaultIdx = SCHEDULE_DATES.findIndex(d => d.date >= TODAY);
    if (defaultIdx === -1) defaultIdx = SCHEDULE_DATES.length - 1;

    showDay(defaultIdx);

    // Scroll active day into view
    setTimeout(() => {
        const active = document.querySelector(".cal-day.active, .cal-day.today");
        if (active) active.scrollIntoView({ inline: "center", behavior: "smooth" });
    }, 100);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

// ── Keyboard navigation ────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = activeIdx + (e.key === "ArrowRight" ? 1 : -1);
        if (next >= 0 && next < SCHEDULE_DATES.length) {
            showDay(next);
            setTimeout(() => {
                const active = document.querySelector(".cal-day.active");
                if (active) active.scrollIntoView({ inline: "center", behavior: "smooth" });
            }, 50);
        }
    }
});
