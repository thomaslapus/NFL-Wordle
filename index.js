"use strict";

const ESPN_LOGO     = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbr||"nfl").toLowerCase()}.png`;
const ESPN_HEADSHOT = id   => id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : "";

function n(v) { const x = parseFloat(v); return isFinite(x) ? x : 0; }

// ── Top Performers ────────────────────────────────────────────────────────────
async function loadTopPerformers() {
    const wrap = document.getElementById("top-performers");
    if (!wrap) return;

    try {
        const res  = await fetch("/api/top-performers?season=2026");
        if (!res.ok) { wrap.closest(".home-section")?.remove(); return; }
        const data = await res.json();

        const groups = [
            { title: "Passing", players: data.passers,   stat: p => `${n(p.passYds).toLocaleString()} yds`,   sub: p => `${n(p.passTDs)} TD` },
            { title: "Rushing", players: data.rushers,   stat: p => `${n(p.rushYds).toLocaleString()} yds`,   sub: p => `${n(p.rushTDs)} TD` },
            { title: "Receiving", players: data.receivers, stat: p => `${n(p.recYds).toLocaleString()} yds`, sub: p => `${n(p.recs)} rec` },
        ];

        wrap.innerHTML = groups.map(g => `
            <div class="perf-group">
                <div class="perf-group-title">${g.title}</div>
                ${(g.players || []).map((p, i) => `
                    <div class="perf-row">
                        <span class="perf-rank">${i + 1}</span>
                        <img class="perf-headshot" src="${ESPN_HEADSHOT(p.espnId)}" alt="${p.name}"
                             onerror="this.src='${ESPN_LOGO(p.team)}'">
                        <div class="perf-info">
                            <span class="perf-name">${p.name}</span>
                            <span class="perf-meta">${p.pos} · ${p.team}</span>
                        </div>
                        <div class="perf-stat">
                            <span class="perf-num">${g.stat(p)}</span>
                            <span class="perf-sub">${g.sub(p)}</span>
                        </div>
                    </div>`).join("")}
            </div>`).join("");
    } catch {
        wrap.closest(".home-section")?.remove();
    }
}

// ── Standings Snapshot ────────────────────────────────────────────────────────
async function loadStandingsSnapshot() {
    const wrap = document.getElementById("standings-snap");
    if (!wrap) return;

    try {
        const res  = await fetch("/api/standings?v=" + Math.floor(Date.now() / 60000));
        if (!res.ok) { wrap.closest(".home-section")?.remove(); return; }
        const data = await res.json();

        // Top team per division, grouped by conference
        const confs = { AFC: {}, NFC: {} };
        for (const t of data) {
            const confShort = t.conference.startsWith("American") ? "AFC" : "NFC";
            const div = t.division;
            if (!confs[confShort][div]) confs[confShort][div] = t;
        }

        const teamLine = t => {
            const g = t.won + t.lost + t.tied;
            const rec = `${t.won}-${t.lost}${t.tied ? `-${t.tied}` : ""}`;
            return `<div class="snap-team">
                <img class="snap-logo" src="${ESPN_LOGO(t.abbr)}" alt="${t.abbr}">
                <span class="snap-name">${t.abbr}</span>
                <span class="snap-rec">${rec}</span>
                ${t.ppg ? `<span class="snap-ppg">${n(t.ppg).toFixed(1)} ppg</span>` : ""}
            </div>`;
        };

        const confHtml = (name, divMap) => {
            const divs = ["East", "North", "South", "West"];
            return `<div class="snap-conf">
                <div class="snap-conf-label">${name}</div>
                ${divs.map(d => divMap[d] ? teamLine(divMap[d]) : "").join("")}
            </div>`;
        };

        wrap.innerHTML = confHtml("AFC", confs.AFC) + confHtml("NFC", confs.NFC);
    } catch {
        wrap.closest(".home-section")?.remove();
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
    loadTopPerformers();
    loadStandingsSnapshot();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
