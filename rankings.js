"use strict";

const ESPN_LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
const CONF_FULL = { AFC: "American Football Conference", NFC: "National Football Conference" };

let allRankings = [];
let storedPrev = {};

function loadPrev() {
    try { storedPrev = JSON.parse(localStorage.getItem("pr_prev_wk") || "{}"); } catch { storedPrev = {}; }
}

function saveCurrent(rankings) {
    const snap = {};
    rankings.forEach(r => { snap[r.abbr] = r.rank; });
    localStorage.setItem("pr_prev_wk", JSON.stringify(snap));
}

function moveBadge(abbr, rank) {
    const prev = storedPrev[abbr];
    if (!prev) return `<span class="rank-move same">—</span>`;
    const diff = prev - rank;
    if (diff > 0) return `<span class="rank-move up">▲${diff}</span>`;
    if (diff < 0) return `<span class="rank-move down">▼${Math.abs(diff)}</span>`;
    return `<span class="rank-move same">—</span>`;
}

function renderRankings(conf) {
    const wrap = document.getElementById("rankings-wrap");
    let list = conf === "all" ? allRankings
        : allRankings.filter(r => r.conference === CONF_FULL[conf] || r.conference === conf);

    // Re-rank within filtered set
    list = list.map((r, i) => ({ ...r, dispRank: i + 1 }));

    const maxPower = list[0]?.power ?? 1;

    let html = `<div class="rankings-list">`;
    let lastZone = null;

    list.forEach((r, i) => {
        const g = r.won + r.lost + r.tied;
        const rec = g ? `${r.won}-${r.lost}${r.tied ? `-${r.tied}` : ""}` : "0-0";
        const pct = (r.pct * 100).toFixed(1) + "%";
        const barW = maxPower > 0 ? Math.round((r.power / maxPower) * 100) : 0;
        const isTop3 = i < 3;

        // Zone dividers
        let zoneLabel = i < 1 ? "Elite" : i < 4 ? "Contenders" : i < 10 ? "Playoff Field" : i < 16 ? "Bubble" : "Rebuilding";
        if (zoneLabel !== lastZone) {
            if (i > 0) html += `<div class="rank-divider">${zoneLabel}</div>`;
            lastZone = zoneLabel;
        }

        html += `
        <div class="rank-row${isTop3 ? " top3" : ""}">
            <div class="rank-num">${r.dispRank}</div>
            ${moveBadge(r.abbr, r.rank)}
            <div class="rank-team">
                <img class="rank-logo" src="${ESPN_LOGO(r.abbr)}" alt="${r.abbr}" loading="lazy">
                <div>
                    <div class="rank-name">${r.name}</div>
                    <div class="rank-conf">${r.division.split(" ")[0]} ${r.conference === "American Football Conference" ? "AFC" : "NFC"} ${r.division.split(" ")[1] ?? ""}</div>
                </div>
            </div>
            <div class="rank-record">${rec}</div>
            <div class="rank-scoring">
                <span class="rank-ppg">${r.ppg ? r.ppg.toFixed(1) + " ppg" : "—"}</span>
                <span class="rank-papg">${r.papg ? r.papg.toFixed(1) + " pa" : "—"}</span>
            </div>
            <div class="rank-bar-wrap">
                <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${barW}%"></div></div>
                <div class="rank-score-label">Power: ${(r.power * 100).toFixed(1)}</div>
            </div>
        </div>`;
    });

    html += `</div>`;
    wrap.innerHTML = html;
}

async function init() {
    loadPrev();
    const wrap = document.getElementById("rankings-wrap");

    try {
        const res = await fetch("/api/power-rankings?season=2026");
        if (!res.ok) throw new Error(await res.text());
        allRankings = await res.json();
        saveCurrent(allRankings);
        renderRankings("all");
    } catch (err) {
        wrap.innerHTML = `<div style="padding:24px;color:var(--text-dim)">Failed to load rankings: ${err.message}</div>`;
    }

    document.getElementById("conf-tabs").addEventListener("click", e => {
        const tab = e.target.closest(".conf-tab");
        if (!tab) return;
        document.querySelectorAll(".conf-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        renderRankings(tab.dataset.conf);
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
