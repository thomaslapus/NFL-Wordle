"use strict";

const CONF_FULL = {
    AFC: "American Football Conference",
    NFC: "National Football Conference",
};
const DIVISIONS = ["East", "North", "South", "West"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function winPct(t) {
    const g = t.won + t.lost + t.tied;
    return g ? (t.won + t.tied * 0.5) / g : 0;
}

function pctStr(t) {
    const g = t.won + t.lost + t.tied;
    if (!g) return ".000";
    return ((t.won + t.tied * 0.5) / g).toFixed(3).replace(/^0/, "");
}

// Primary: winning %, Secondary: PPG, Tertiary: PA (lower = better)
function teamSort(a, b) {
    const d = winPct(b) - winPct(a);
    if (Math.abs(d) > 1e-9) return d;
    const ppgD = (b.ppg ?? 0) - (a.ppg ?? 0);
    if (Math.abs(ppgD) > 1e-9) return ppgD;
    return (a.papg ?? 99) - (b.papg ?? 99);
}

// ── NFL Playoff Algorithm ─────────────────────────────────────────────────────
// 7 seeds per conference:
//   Seeds 1-4 → division winners ranked by record
//   Seeds 5-7 → wild cards: best 3 non-division-winners by record
//   Seed 1 gets a bye week
function computePlayoffs(allTeams) {
    const result = new Map(); // abbr → { seed, type: 'div'|'wc', conf, bye }

    for (const confKey of ["AFC", "NFC"]) {
        const confFull  = CONF_FULL[confKey];
        const confTeams = allTeams.filter(t => t.conference === confFull);

        // Best team in each division
        const divWinners = DIVISIONS.map(div => {
            const sorted = confTeams.filter(t => t.division === div).sort(teamSort);
            return sorted[0] ?? null;
        }).filter(Boolean);

        // Rank division winners → seeds 1-4
        divWinners.sort(teamSort);
        divWinners.forEach((t, i) => {
            result.set(t.abbr, {
                seed: i + 1,
                type: "div",
                conf: confKey,
                bye: i === 0,        // seed 1 gets bye
            });
        });

        // Wild cards: everyone else in conference, sorted
        const divWinnerSet = new Set(divWinners.map(t => t.abbr));
        confTeams
            .filter(t => !divWinnerSet.has(t.abbr))
            .sort(teamSort)
            .slice(0, 3)
            .forEach((t, i) => {
                result.set(t.abbr, { seed: 5 + i, type: "wc", conf: confKey, bye: false });
            });
    }

    return result;
}

// ── Badge HTML ────────────────────────────────────────────────────────────────
function seedBadge(info) {
    if (!info) return "";
    return `<span class="seed-badge seed-${info.seed}">${info.seed}</span>`;
}

// ── Row status class ──────────────────────────────────────────────────────────
function rowClass(info) {
    if (!info) return "row-out";
    return `row-playoff row-seed${info.seed}`;
}

function sosFmt(v) {
    if (v == null) return "—";
    return (v * 100).toFixed(1);
}

// ── Build a table row ─────────────────────────────────────────────────────────
function buildRow(team, playoffMap, showConf = false, rank = 0) {
    const info = playoffMap.get(team.abbr);
    const tr   = document.createElement("tr");
    tr.className = rowClass(info);

    const confLabel = showConf
        ? `<span class="team-conf">${team.conference === CONF_FULL.AFC ? "AFC" : "NFC"}</span>`
        : "";

    const rankCell = rank > 0 ? `<td class="col-rank">${rank}</td>` : "";

    tr.innerHTML = `
        ${rankCell}
        <td class="col-team">
          <div class="team-cell">
            <img class="team-logo" src="${team.logo_url || ""}" alt="${team.abbr}" loading="lazy" onerror="this.style.display='none'">
            <span class="team-name">${team.name}</span>
            <span class="team-abbr">${team.abbr}</span>
            ${confLabel}
            ${seedBadge(info)}
          </div>
        </td>
        <td class="col-w">${team.won}</td>
        <td class="col-l">${team.lost}</td>
        <td class="col-t">${team.tied}</td>
        <td class="col-pct">${pctStr(team)}</td>
        <td class="col-ppg">${team.ppg != null ? Number(team.ppg).toFixed(1) : "—"}</td>
        <td class="col-papg">${team.papg != null ? Number(team.papg).toFixed(1) : "—"}</td>
        <td class="col-sos">${sosFmt(team.sos_played)}</td>
        <td class="col-sos-rem">${sosFmt(team.sos_remaining)}</td>
    `;
    return tr;
}

function tableShell(showRank = false) {
    const t = document.createElement("table");
    t.className = "standings-table";
    const rankCol = showRank ? '<th class="col-rank">#</th>' : "";
    t.innerHTML = `
        <thead>
          <tr>
            ${rankCol}
            <th class="col-team">Team</th>
            <th>W</th><th>L</th><th>T</th>
            <th>PCT</th><th>PF</th><th>PA</th>
            <th class="col-sos" title="Strength of Schedule — games played">SOS</th>
            <th class="col-sos" title="Strength of Schedule — remaining games">SOS★</th>
          </tr>
        </thead>
        <tbody></tbody>
    `;
    return t;
}

// ── Render: one division block ────────────────────────────────────────────────
function renderDivision(divTeams, divLabel, playoffMap) {
    const block = document.createElement("div");
    block.className = "div-block";

    const title = document.createElement("div");
    title.className = "div-title";
    title.textContent = divLabel;
    block.appendChild(title);

    const table  = tableShell(false);
    const tbody  = table.querySelector("tbody");
    const sorted = [...divTeams].sort(teamSort);

    sorted.forEach((team, i) => {
        const tr = buildRow(team, playoffMap);
        if (i === 0) tr.classList.add("div-leader");
        tbody.appendChild(tr);
    });

    block.appendChild(table);
    return block;
}

// ── Render: AFC or NFC conference view ────────────────────────────────────────
function renderConference(confKey, allTeams, playoffMap) {
    const confFull = CONF_FULL[confKey];
    const section  = document.createElement("div");
    section.className = "conf-section";
    section.dataset.conf = confKey;

    DIVISIONS.forEach(div => {
        const divTeams = allTeams.filter(t => t.conference === confFull && t.division === div);
        if (!divTeams.length) return;
        section.appendChild(renderDivision(divTeams, `${confKey} ${div}`, playoffMap));
    });

    return section;
}

// ── Render: NFL tab — all 32 teams sorted by record ──────────────────────────
function renderNFL(allTeams, playoffMap) {
    const section = document.createElement("div");
    section.className = "conf-section nfl-section";
    section.dataset.conf = "NFL";

    const block = document.createElement("div");
    block.className = "div-block";

    const title = document.createElement("div");
    title.className = "div-title";
    title.textContent = "All Teams";
    block.appendChild(title);

    const table = tableShell(true);
    const tbody = table.querySelector("tbody");

    [...allTeams].sort(teamSort).forEach((team, i) => {
        tbody.appendChild(buildRow(team, playoffMap, false, i + 1));
    });

    block.appendChild(table);
    section.appendChild(block);
    return section;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    const body = document.getElementById("standings-body");

    let teams;
    try {
        const res = await fetch("/api/standings?v=" + Math.floor(Date.now() / 60000));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        teams = await res.json();
    } catch (err) {
        body.innerHTML = `<div class="loading-msg">Failed to load standings: ${err.message}</div>`;
        return;
    }

    const playoffMap = computePlayoffs(teams);
    body.innerHTML   = "";

    // Build all three sections
    const nflSection = renderNFL(teams, playoffMap);          // shown first by default
    const afcSection = renderConference("AFC", teams, playoffMap);
    const nfcSection = renderConference("NFC", teams, playoffMap);

    afcSection.classList.add("hidden");
    nfcSection.classList.add("hidden");

    body.appendChild(nflSection);
    body.appendChild(afcSection);
    body.appendChild(nfcSection);

    // Tab switching
    document.querySelectorAll(".conf-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            const conf = btn.dataset.conf;
            document.querySelectorAll(".conf-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".conf-section").forEach(s => {
                s.classList.toggle("hidden", s.dataset.conf !== conf);
            });
        });
    });
}

init();
