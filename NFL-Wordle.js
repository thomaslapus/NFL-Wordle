// ============================================================
// NFL Wordle — Client-side game logic
// ============================================================

let playerData = [];

// DOM references — grabbed once at the top so we don't query the DOM repeatedly
const loadingMessage = document.getElementById("loading-message");
const errorMessage   = document.getElementById("error-message");
const input          = document.getElementById("input");
const suggestions    = document.getElementById("suggestions");

// Was: hardcoded hex strings repeated inside each comparison function
// Now: named constants at the top — change the color in one place if needed
const COLOR_GREEN = "#4caf6d"; // exact match  (mirrors CSS --accent)
const COLOR_GOLD  = "#e6b821"; // close match  (mirrors CSS --gold)

let guessCount = 0;

// Stores each guess as [name, team, position, age, number]
// Index 0 = guess 1, index 7 = guess 8
let guessesArray = [
    ["","","","",""], ["","","","",""], ["","","","",""], ["","","","",""],
    ["","","","",""], ["","","","",""], ["","","","",""], ["","","","",""]
];

// Was: answer mixed into guessesArray[0] alongside real guesses — confusing and caused index bugs
// Now: stored in its own dedicated object, never in guessesArray
let answer = { name: "", team: "", position: "", age: 0, number: 0 };

// Position groups used for yellow "same group" comparisons
const positions = [
    ["QB","RB","WR","TE","OL"], // Offense
    ["DL","LB","DB"],            // Defense
    ["K","P"]                    // Special Teams
];

// Divisions used for yellow "same division" comparisons
const divisions = [
    ["CHI","GB","DET","MIN"],  // NFC North
    ["ATL","CAR","NO","TB"],   // NFC South
    ["DAL","PHI","NYG","WAS"], // NFC East
    ["SF","LAR","ARI","SEA"],  // NFC West
    ["CLE","BAL","PIT","CIN"], // AFC North
    ["IND","JAX","HOU","TEN"], // AFC South
    ["BUF","MIA","NE","NYJ"],  // AFC East
    ["DEN","KC","LV","LAC"]    // AFC West
];

// ============================================================
// Data loading
// ============================================================

getPlayerData();

// Was: XMLHttpRequest with a separate responseRecieveHandler callback, calling Sleeper API directly
// Now: async/await fetch from our own server; two requests run in parallel via Promise.all
//      /api/players  → cached player list for autocomplete
//      /api/daily-player → today's answer, picked server-side so everyone gets the same player
async function getPlayerData() {
    try {
        const [playersRes, dailyRes] = await Promise.all([
            fetch("/api/players"),
            fetch("/api/daily-player")
        ]);

        // fetch() does NOT throw on 4xx/5xx — we must check .ok manually
        if (!playersRes.ok || !dailyRes.ok) throw new Error("Server error loading game data");

        playerData = await playersRes.json();
        const daily = await dailyRes.json();

        // Populate the answer object from the server's daily player
        answer.name     = daily.full_name;
        answer.team     = daily.team;
        answer.position = simplifyPosition(daily.position);
        answer.age      = daily.age;
        answer.number   = daily.number;

        loadingMessage.classList.add("hidden-loading");
        startGame();
    } catch (err) {
        console.error("Failed to load game data:", err);
        loadingMessage.classList.add("hidden-loading");
        errorMessage.classList.remove("hidden-error");
    }
}

// ============================================================
// Stats — localStorage
// ============================================================

// Was: no stats tracking at all
// Now: persists played/wins/streak/maxStreak/lastPlayed in the browser's localStorage
//
// localStorage vs cookies:
//   localStorage  — stores data in the browser, never sent to the server, persists until cleared,
//                   simple key/value strings, ~5MB limit. Right for this use case.
//   cookies       — sent to the server with every request, expire on a set date, smaller size limit.
//                   Right for things like login sessions that the server needs to see.
// Since your server doesn't need to know the user's stats, localStorage is the correct choice.

function loadStats() {
    // Returns a default object if the key has never been set (first visit)
    const saved = localStorage.getItem("nflWordle_stats");
    return saved
        ? JSON.parse(saved)
        : { played: 0, wins: 0, streak: 0, maxStreak: 0, lastPlayed: "" };
}

function saveStats(stats) {
    // JSON.stringify converts the object to a string because localStorage only stores strings
    localStorage.setItem("nflWordle_stats", JSON.stringify(stats));
}

// Called once per game end. won=true → win, won=false → loss
function updateStats(won) {
    const stats = loadStats();
    const today = new Date().toISOString().slice(0, 10); // "2026-06-15"

    // Guard: only count one game per calendar day so a page refresh doesn't
    // log a second result for the same puzzle
    if (stats.lastPlayed !== today) {
        stats.played++;
        if (won) {
            stats.wins++;
            stats.streak++;
            // Math.max keeps the highest streak ever seen
            stats.maxStreak = Math.max(stats.streak, stats.maxStreak);
        } else {
            stats.streak = 0; // a loss always resets the streak to 0
        }
        stats.lastPlayed = today;
        saveStats(stats);
    }

    renderStats(stats);
}

// Writes the stats values into the #stats-bar DOM elements
function renderStats(stats) {
    document.getElementById("stat-played").textContent    = stats.played;
    document.getElementById("stat-winpct").textContent    =
        stats.played > 0 ? Math.round(stats.wins / stats.played * 100) + "%" : "0%";
    document.getElementById("stat-streak").textContent    = stats.streak;
    document.getElementById("stat-maxstreak").textContent = stats.maxStreak;
}

// ============================================================
// Countdown timer
// ============================================================

// Was: no countdown
// Now: shows hours:minutes:seconds until midnight UTC, when the daily player resets.
//      setInterval re-runs tick() every 1000ms (1 second) so the display stays current.
function startCountdown() {
    const el = document.getElementById("countdown");

    function pad(n) { return String(n).padStart(2, "0"); }

    function tick() {
        const now      = Date.now();
        const tomorrow = new Date();
        tomorrow.setUTCHours(24, 0, 0, 0); // next midnight in UTC
        const diff = tomorrow - now;

        const h = Math.floor(diff / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        const s = Math.floor((diff % 60_000) / 1_000);

        el.textContent = `Next puzzle: ${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    tick();                    // run immediately so there's no 1-second blank
    setInterval(tick, 1_000); // then update every second
}

// ============================================================
// Position helper
// ============================================================

// Collapses API position codes into simpler groups for display + comparison
function simplifyPosition(position) {
    if (position === "DE" || position === "DT" || position === "NT") return "DL";
    if (position === "CB" || position === "S"  || position === "FS" || position === "SS") return "DB";
    return position;
}

// ============================================================
// Game start
// ============================================================

function startGame() {
    input.disabled = false;
    guessCount     = 0;
    input.value    = "";
    suggestions.innerHTML = "";
    suggestions.classList.add("hidden-suggestions");

    // Was: only reset rows 2–7, missed rows 1 and 8; .classList.add() was a no-op since the class
    //      was already there; text content was reset but background colors were not
    // Now: loops all 8 rows via data-guess attribute, clears text + background + animation classes
    for (let i = 1; i <= 8; i++) {
        const row = document.querySelector(`[data-guess="${i}"]`);
        row.classList.add("hidden-row" + i);   // ensure row is hidden
        row.classList.remove("row-reveal");    // remove reveal animation from previous game
        Array.from(row.children).forEach(cell => {
            cell.textContent = "";
            cell.style.backgroundColor = "";   // reset green/gold from previous game
            cell.style.animationDelay  = "";
            cell.classList.remove("win-cell");
        });
    }

    // Set the puzzle date display (e.g. "Saturday, June 15")
    document.getElementById("puzzle-date").textContent =
        new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    startCountdown();
    renderStats(loadStats()); // show persisted stats immediately on load
}

// ============================================================
// Input — autocomplete
// ============================================================

// Fires on every keystroke — filters player list and rebuilds the suggestion dropdown
input.addEventListener("input", () => {
    const value = input.value.toLowerCase();
    suggestions.innerHTML = "";

    if (!value) {
        suggestions.classList.add("hidden-suggestions");
        return;
    }

    // Was: .map(row => row).filter(...) — the .map() was a pointless copy that did nothing
    // Now: .filter() directly; .slice(0, 10) caps results at 10 so the dropdown stays manageable
    const filtered = playerData
        .filter(p => p.full_name.toLowerCase().includes(value))
        .slice(0, 10);

    filtered.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item.full_name;
        li.addEventListener("click", () => {
            input.value = item.full_name;
            inputEntered(input.value);
        });
        suggestions.appendChild(li);
    });

    suggestions.classList.toggle("hidden-suggestions", filtered.length === 0);
});

// Was: a new keydown listener added inside filtered.forEach on every keystroke —
//      after typing a few chars, dozens of stacked listeners would all fire at once when Enter was pressed
// Now: one listener, outside the loop, always submits whatever text is currently in the input
input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && input.value.trim()) {
        inputEntered(input.value.trim());
    }
});

// ============================================================
// Guess submission
// ============================================================

function inputEntered(name) {
    guessCount++;
    insertGuessesArray(name);  // store the guessed player's data
    unhideRows();              // reveal the row with slide-in animation
    winCondition(name);        // apply colors + check win/lose
    input.value = "";
    suggestions.classList.add("hidden-suggestions");
}

// ============================================================
// Guess storage
// ============================================================

function insertGuessesArray(currName) {
    // Was: for loop with default index=0 if player not found — silently used wrong player as fallback
    // Now: Array.find() returns undefined if not found; we log a warning instead of silently failing
    const player = playerData.find(p => p.full_name === currName);
    if (!player) {
        console.warn("Player not found in dataset:", currName);
        return;
    }
    // Store at guessCount-1 because guessCount was already incremented in inputEntered
    guessesArray[guessCount - 1] = [
        player.full_name,
        player.team,
        simplifyPosition(player.position), // simplify so comparison functions work correctly
        player.age,
        player.number
    ];
}

// ============================================================
// Row reveal + animation
// ============================================================

function unhideRows() {
    // Was: switch statement with 8 nearly-identical cases (80 lines)
    // Now: uses data-guess attribute to find the right row regardless of which hidden class is present
    const row = document.querySelector(`[data-guess="${guessCount}"]`);
    row.classList.remove("hidden-row" + guessCount); // make row visible

    Array.from(row.children).forEach((cell, i) => {
        cell.textContent = guessesArray[guessCount - 1][i];
    });

    // requestAnimationFrame defers the class addition by one render tick so the browser
    // paints the now-visible row before starting the animation — without this the
    // animation sometimes doesn't trigger because the element was display:none before
    requestAnimationFrame(() => row.classList.add("row-reveal"));
}

// ============================================================
// Color comparison functions
// ============================================================

function playerCompare() {
    // Was: four separate lines, one per column
    // Now: array of functions mapped to columns 1–4 via forEach
    const row    = document.querySelector(`[data-guess="${guessCount}"]`);
    const checks = [inDivision, inPositionGroup, inAgeRange, inNumberRange];
    checks.forEach((fn, i) => {
        row.children[i + 1].style.backgroundColor = fn();
    });
}

// Returns COLOR_GREEN (exact), COLOR_GOLD (same division), or "" (no match)
function inDivision() {
    const guessTeam = guessesArray[guessCount - 1][1];
    if (guessTeam === answer.team) return COLOR_GREEN;
    // for...of is cleaner than a C-style for loop for array iteration
    for (const div of divisions) {
        if (div.includes(guessTeam) && div.includes(answer.team)) return COLOR_GOLD;
    }
    return "";
}

function inPositionGroup() {
    const guessPos = guessesArray[guessCount - 1][2];
    if (guessPos === answer.position) return COLOR_GREEN;
    for (const group of positions) {
        if (group.includes(guessPos) && group.includes(answer.position)) return COLOR_GOLD;
    }
    return "";
}

function inAgeRange() {
    const guessAge = guessesArray[guessCount - 1][3];
    if (guessAge === answer.age) return COLOR_GREEN;
    if (Math.abs(guessAge - answer.age) <= 5) return COLOR_GOLD;
    return "";
}

function inNumberRange() {
    const guessNum = guessesArray[guessCount - 1][4];
    if (guessNum === answer.number) return COLOR_GREEN;
    if (Math.abs(guessNum - answer.number) <= 10) return COLOR_GOLD;
    return "";
}

// ============================================================
// Win / Lose conditions
// ============================================================

function winCondition(currName) {
    const row = document.querySelector(`[data-guess="${guessCount}"]`);

    if (currName === answer.name) {
        // Win: color all cells green with a staggered pulse animation per column
        Array.from(row.children).forEach((cell, i) => {
            cell.style.backgroundColor = COLOR_GREEN;
            // animationDelay staggers each cell: 0s, 0.07s, 0.14s, 0.21s, 0.28s
            // The 0.3s base offset lets the row-reveal animation finish first
            cell.style.animationDelay = `${0.3 + i * 0.07}s`;
            cell.classList.add("win-cell");
        });

        updateStats(true); // record win in localStorage

        // Delay the modal so the animation plays before the overlay appears
        setTimeout(() => showResult(
            "You Win! 🎉",
            `You got it in ${guessCount} ${guessCount === 1 ? "guess" : "guesses"}.`
        ), 700);

        input.disabled = true;

    } else if (guessCount >= 8) {
        // Lose: color the last row, shake the board, reveal the answer
        playerCompare();

        // Was: no lose animation
        // Now: .shake CSS class plays a horizontal shake keyframe on the gamebox
        const gamebox = document.querySelector(".gamebox");
        gamebox.classList.add("shake");
        // Remove the class after the animation so it can be re-triggered if needed
        setTimeout(() => gamebox.classList.remove("shake"), 600);

        updateStats(false); // record loss in localStorage

        setTimeout(() => showResult("Game Over", `The answer was ${answer.name}.`), 750);

        input.disabled = true;

    } else {
        // Normal incorrect guess — just color the row
        playerCompare();
    }
}

// ============================================================
// Result modal
// ============================================================

const resultModal   = document.getElementById("result-modal");
const resultTitle   = document.getElementById("result-title");
const resultMessage = document.getElementById("result-message");
const resultClose   = document.getElementById("result-close");

function showResult(title, message) {
    resultTitle.textContent   = title;
    resultMessage.textContent = message;
    resultModal.classList.remove("hidden-modal");
}

resultClose.addEventListener("click", () => {
    resultModal.classList.add("hidden-modal");
});

// ============================================================
// How to Play modal
// ============================================================

// Was: triggered by clicking <img id="question-mark"> in a separate left panel
// Now: triggered by #how-to-play-btn in the navbar; closed by ✕ button inside the modal
const howToPlayBtn   = document.getElementById("how-to-play-btn");
const howToPlayBox   = document.getElementById("how-to-play-box");
const howToPlayClose = document.getElementById("how-to-play-close");

howToPlayBtn.addEventListener("click", () => {
    howToPlayBox.classList.toggle("hidden-how-to-play");
});

howToPlayClose.addEventListener("click", () => {
    howToPlayBox.classList.add("hidden-how-to-play");
});
