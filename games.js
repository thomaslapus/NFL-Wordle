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
    { date:"20260910", label:"Thu Sep 10",  weekType:"Regular",   weekLabel:"Week 2",  fullLabel:"Regular Season Week 2" },
    { date:"20260913", label:"Sun Sep 13",  weekType:"Regular",   weekLabel:"Week 2",  fullLabel:"Regular Season Week 2" },
    { date:"20260914", label:"Mon Sep 14",  weekType:"Regular",   weekLabel:"Week 2",  fullLabel:"Regular Season Week 2" },
    { date:"20260917", label:"Thu Sep 17",  weekType:"Regular",   weekLabel:"Week 3",  fullLabel:"Regular Season Week 3" },
    { date:"20260920", label:"Sun Sep 20",  weekType:"Regular",   weekLabel:"Week 3",  fullLabel:"Regular Season Week 3" },
    { date:"20260921", label:"Mon Sep 21",  weekType:"Regular",   weekLabel:"Week 3",  fullLabel:"Regular Season Week 3" },
    { date:"20260924", label:"Thu Sep 24",  weekType:"Regular",   weekLabel:"Week 4",  fullLabel:"Regular Season Week 4" },
    { date:"20260927", label:"Sun Sep 27",  weekType:"Regular",   weekLabel:"Week 4",  fullLabel:"Regular Season Week 4" },
    { date:"20260928", label:"Mon Sep 28",  weekType:"Regular",   weekLabel:"Week 4",  fullLabel:"Regular Season Week 4" },
    { date:"20261001", label:"Thu Oct 1",   weekType:"Regular",   weekLabel:"Week 5",  fullLabel:"Regular Season Week 5" },
    { date:"20261004", label:"Sun Oct 4",   weekType:"Regular",   weekLabel:"Week 5",  fullLabel:"Regular Season Week 5" },
    { date:"20261005", label:"Mon Oct 5",   weekType:"Regular",   weekLabel:"Week 5",  fullLabel:"Regular Season Week 5" },
    { date:"20261008", label:"Thu Oct 8",   weekType:"Regular",   weekLabel:"Week 6",  fullLabel:"Regular Season Week 6" },
    { date:"20261011", label:"Sun Oct 11",  weekType:"Regular",   weekLabel:"Week 6",  fullLabel:"Regular Season Week 6" },
    { date:"20261012", label:"Mon Oct 12",  weekType:"Regular",   weekLabel:"Week 6",  fullLabel:"Regular Season Week 6" },
    { date:"20261015", label:"Thu Oct 15",  weekType:"Regular",   weekLabel:"Week 7",  fullLabel:"Regular Season Week 7" },
    { date:"20261018", label:"Sun Oct 18",  weekType:"Regular",   weekLabel:"Week 7",  fullLabel:"Regular Season Week 7" },
    { date:"20261019", label:"Mon Oct 19",  weekType:"Regular",   weekLabel:"Week 7",  fullLabel:"Regular Season Week 7" },
    { date:"20261022", label:"Thu Oct 22",  weekType:"Regular",   weekLabel:"Week 8",  fullLabel:"Regular Season Week 8" },
    { date:"20261025", label:"Sun Oct 25",  weekType:"Regular",   weekLabel:"Week 8",  fullLabel:"Regular Season Week 8" },
    { date:"20261026", label:"Mon Oct 26",  weekType:"Regular",   weekLabel:"Week 8",  fullLabel:"Regular Season Week 8" },
    { date:"20261029", label:"Thu Oct 29",  weekType:"Regular",   weekLabel:"Week 9",  fullLabel:"Regular Season Week 9" },
    { date:"20261101", label:"Sun Nov 1",   weekType:"Regular",   weekLabel:"Week 9",  fullLabel:"Regular Season Week 9" },
    { date:"20261102", label:"Mon Nov 2",   weekType:"Regular",   weekLabel:"Week 9",  fullLabel:"Regular Season Week 9" },
    { date:"20261105", label:"Thu Nov 5",   weekType:"Regular",   weekLabel:"Week 10", fullLabel:"Regular Season Week 10" },
    { date:"20261108", label:"Sun Nov 8",   weekType:"Regular",   weekLabel:"Week 10", fullLabel:"Regular Season Week 10" },
    { date:"20261109", label:"Mon Nov 9",   weekType:"Regular",   weekLabel:"Week 10", fullLabel:"Regular Season Week 10" },
    { date:"20261112", label:"Thu Nov 12",  weekType:"Regular",   weekLabel:"Week 11", fullLabel:"Regular Season Week 11" },
    { date:"20261115", label:"Sun Nov 15",  weekType:"Regular",   weekLabel:"Week 11", fullLabel:"Regular Season Week 11" },
    { date:"20261116", label:"Mon Nov 16",  weekType:"Regular",   weekLabel:"Week 11", fullLabel:"Regular Season Week 11" },
    { date:"20261119", label:"Thu Nov 19",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261122", label:"Sun Nov 22",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261123", label:"Mon Nov 23",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261125", label:"Wed Nov 25",  weekType:"Regular",   weekLabel:"Week 12", fullLabel:"Regular Season Week 12" },
    { date:"20261126", label:"Thu Nov 26",  weekType:"Regular",   weekLabel:"Week 13", fullLabel:"Regular Season Week 13" },
    { date:"20261127", label:"Fri Nov 27",  weekType:"Regular",   weekLabel:"Week 13", fullLabel:"Regular Season Week 13" },
    { date:"20261129", label:"Sun Nov 29",  weekType:"Regular",   weekLabel:"Week 13", fullLabel:"Regular Season Week 13" },
    { date:"20261130", label:"Mon Nov 30",  weekType:"Regular",   weekLabel:"Week 13", fullLabel:"Regular Season Week 13" },
    { date:"20261203", label:"Thu Dec 3",   weekType:"Regular",   weekLabel:"Week 14", fullLabel:"Regular Season Week 14" },
    { date:"20261206", label:"Sun Dec 6",   weekType:"Regular",   weekLabel:"Week 14", fullLabel:"Regular Season Week 14" },
    { date:"20261207", label:"Mon Dec 7",   weekType:"Regular",   weekLabel:"Week 14", fullLabel:"Regular Season Week 14" },
    { date:"20261210", label:"Thu Dec 10",  weekType:"Regular",   weekLabel:"Week 15", fullLabel:"Regular Season Week 15" },
    { date:"20261213", label:"Sun Dec 13",  weekType:"Regular",   weekLabel:"Week 15", fullLabel:"Regular Season Week 15" },
    { date:"20261214", label:"Mon Dec 14",  weekType:"Regular",   weekLabel:"Week 15", fullLabel:"Regular Season Week 15" },
    { date:"20261217", label:"Thu Dec 17",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16" },
    { date:"20261219", label:"Sat Dec 19",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16" },
    { date:"20261220", label:"Sun Dec 20",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16" },
    { date:"20261221", label:"Mon Dec 21",  weekType:"Regular",   weekLabel:"Week 16", fullLabel:"Regular Season Week 16" },
    { date:"20261225", label:"Fri Dec 25",  weekType:"Regular",   weekLabel:"Week 17", fullLabel:"Regular Season Week 17" },
    { date:"20261227", label:"Sun Dec 27",  weekType:"Regular",   weekLabel:"Week 17", fullLabel:"Regular Season Week 17" },
    { date:"20261228", label:"Mon Dec 28",  weekType:"Regular",   weekLabel:"Week 17", fullLabel:"Regular Season Week 17" },
    { date:"20261231", label:"Thu Dec 31",  weekType:"Regular",   weekLabel:"Week 18", fullLabel:"Regular Season Week 18" },
    { date:"20270103", label:"Sun Jan 3",   weekType:"Regular",   weekLabel:"Week 18", fullLabel:"Regular Season Week 18" },
    { date:"20270104", label:"Mon Jan 4",   weekType:"Regular",   weekLabel:"Week 18", fullLabel:"Regular Season Week 18" },
    // Playoffs
    { date:"20270110", label:"Sun Jan 10",  weekType:"Playoffs",  weekLabel:"Wild Card",   fullLabel:"Wild Card Weekend" },
    { date:"20270117", label:"Sat Jan 17",  weekType:"Playoffs",  weekLabel:"Wild Card",   fullLabel:"Wild Card Weekend" },
    { date:"20270118", label:"Sun Jan 18",  weekType:"Playoffs",  weekLabel:"Wild Card",   fullLabel:"Wild Card Weekend" },
    { date:"20270119", label:"Mon Jan 19",  weekType:"Playoffs",  weekLabel:"Wild Card",   fullLabel:"Wild Card Weekend" },
    { date:"20270124", label:"Sat Jan 24",  weekType:"Playoffs",  weekLabel:"Divisional",  fullLabel:"Divisional Round" },
    { date:"20270125", label:"Sun Jan 25",  weekType:"Playoffs",  weekLabel:"Divisional",  fullLabel:"Divisional Round" },
    { date:"20270201", label:"Sun Feb 1",   weekType:"Playoffs",  weekLabel:"Conf. Champ", fullLabel:"Conference Championships" },
    { date:"20270207", label:"Sun Feb 7",   weekType:"Playoffs",  weekLabel:"Super Bowl",  fullLabel:"Super Bowl LXI" },
];

// ── State ─────────────────────────────────────────────────────────────────────
let activeIdx    = 0;
let liveRefreshInterval = null;

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

    document.getElementById("day-label").textContent =
        `${day.weekType} ${day.weekLabel} — ${day.label}`;
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
            grid.innerHTML = `<div class="no-games">Game data unavailable — API key not configured.</div>`;
            return;
        }

        const games = data.games ?? [];
        if (games.length === 0) {
            grid.innerHTML = `<div class="no-games">No games scheduled.</div>`;
            return;
        }

        // Chronological order by kickoff time
        const sorted = [...games].sort((a, b) => kickoffToMinutes(a.kickoff) - kickoffToMinutes(b.kickoff));
        grid.innerHTML = sorted.map(renderCard).join("");
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
    ${stadium ? `<div class="gc-footer"><div class="gc-stadium"><span class="gc-stadium-icon">🏟</span><span>${stadium}</span></div></div>` : ""}
  </div>
</div>`;
}

function renderLive(game) {
    const away = game.awayTeam ?? "TBD";
    const home = game.homeTeam ?? "TBD";
    const awayName = T[away]?.[0] ?? away;
    const homeName = T[home]?.[0] ?? home;
    const stadium  = T[home]?.[1] ?? "";
    const scoreAway = game.awayScore ?? "-";
    const scoreHome = game.homeScore ?? "-";
    const qtr  = game.quarter ? `Q${game.quarter}` : "Live";
    const clock = game.clock  ? ` · ${game.clock}` : "";
    const poss  = game.possession && game.possession !== "TBD"
        ? `<div class="gc-possession"><span class="poss-dot"></span><span>Ball: ${game.possession}</span></div>`
        : "";
    return `
<div class="game-card game-card--live">
  <div class="gc-header">
    <span class="gc-live-info">● LIVE</span>
    <span class="gc-status-badge live">Live</span>
  </div>
  <div class="gc-body">
    <div class="gc-teams">
      <div class="gc-team">
        ${logoImg(away)}
        <span class="gc-abbr">${away}</span>
        <span class="gc-name">${awayName}</span>
      </div>
      <div class="gc-center">
        <div class="gc-scores">
          <span class="gc-score live">${scoreAway}</span>
          <span class="gc-dash">–</span>
          <span class="gc-score live">${scoreHome}</span>
        </div>
        <span class="gc-live-info">${qtr}${clock}</span>
        ${poss}
      </div>
      <div class="gc-team">
        ${logoImg(home)}
        <span class="gc-abbr">${home}</span>
        <span class="gc-name">${homeName}</span>
      </div>
    </div>
    ${stadium ? `<div class="gc-footer"><div class="gc-stadium"><span class="gc-stadium-icon">🏟</span>${stadium}</div></div>` : ""}
  </div>
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
<div class="game-card game-card--final">
  <div class="gc-header">
    <span>${channel}</span>
    <span class="gc-status-badge final">Final</span>
  </div>
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
</div>`;
}

// ── Init ───────────────────────────────────────────────────────────────────────
function init() {
    buildCalendar();

    // Find today or the next upcoming date
    let defaultIdx = SCHEDULE_DATES.findIndex(d => d.date >= TODAY);
    if (defaultIdx === -1) defaultIdx = SCHEDULE_DATES.length - 1;

    showDay(defaultIdx);

    // Scroll active day into view
    setTimeout(() => {
        const active = document.querySelector(".cal-day.active, .cal-day.today");
        if (active) active.scrollIntoView({ inline: "center", behavior: "smooth" });
    }, 100);
}

document.addEventListener("DOMContentLoaded", init);
