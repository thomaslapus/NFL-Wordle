"use strict";

// ── Dark / Light mode toggle ──────────────────────────────────────────────────
(function () {
    const STORAGE_KEY = "theme";

    function applyTheme(t) {
        document.documentElement.setAttribute("data-theme", t);
        localStorage.setItem(STORAGE_KEY, t);
        document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
            btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
            btn.innerHTML = t === "dark" ? sunIcon() : moonIcon();
        });
    }

    function sunIcon() {
        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    }
    function moonIcon() {
        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
            btn.innerHTML = current === "dark" ? sunIcon() : moonIcon();
            btn.title = current === "dark" ? "Switch to light mode" : "Switch to dark mode";
            btn.addEventListener("click", () => {
                const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
                applyTheme(next);
            });
        });
    });
})();

// ── Global search overlay ─────────────────────────────────────────────────────
(function () {
    let overlay = null;
    let searchTimer = null;

    function buildOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement("div");
        overlay.id = "gsearch-overlay";
        overlay.innerHTML = `
            <div id="gsearch-box">
                <div id="gsearch-row">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input id="gsearch-input" type="text" placeholder="Search players or teams…" autocomplete="off" spellcheck="false">
                    <button id="gsearch-close" aria-label="Close">✕</button>
                </div>
                <div id="gsearch-results"></div>
            </div>
        `;

        overlay.addEventListener("mousedown", e => {
            if (e.target === overlay) closeSearch();
        });
        overlay.querySelector("#gsearch-close").addEventListener("click", closeSearch);
        overlay.querySelector("#gsearch-input").addEventListener("input", e => {
            clearTimeout(searchTimer);
            const q = e.target.value.trim();
            if (q.length < 2) { overlay.querySelector("#gsearch-results").innerHTML = ""; return; }
            searchTimer = setTimeout(() => doSearch(q), 200);
        });
        overlay.querySelector("#gsearch-input").addEventListener("keydown", e => {
            if (e.key === "Escape") closeSearch();
        });
        document.body.appendChild(overlay);
        return overlay;
    }

    async function doSearch(q) {
        const res = overlay.querySelector("#gsearch-results");
        res.innerHTML = `<div class="gs-loading">Searching…</div>`;
        try {
            const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            const items = r.ok ? await r.json() : [];
            if (!items.length) { res.innerHTML = `<div class="gs-empty">No results for "${q}"</div>`; return; }
            res.innerHTML = items.map(item => {
                if (item.type === "player") {
                    const team = item.team || "";
                    const logo = team ? `https://a.espncdn.com/i/teamlogos/nfl/500/${team.toLowerCase()}.png` : "";
                    const headshot = item.espnId ? `https://a.espncdn.com/i/headshots/nfl/players/full/${item.espnId}.png` : "";
                    return `<div class="gs-result" data-type="player" data-name="${encodeURIComponent(item.name)}" data-team="${team}">
                        ${headshot ? `<img class="gs-headshot" src="${headshot}" onerror="this.style.display='none'" alt="">` : `<div class="gs-headshot-blank"></div>`}
                        <div class="gs-info">
                            <span class="gs-name">${item.name}</span>
                            <span class="gs-meta">${item.pos || ""} · ${team}</span>
                        </div>
                        ${logo ? `<img class="gs-logo" src="${logo}" onerror="this.style.display='none'" alt="${team}">` : ""}
                    </div>`;
                } else {
                    const logo = item.abbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${item.abbr.toLowerCase()}.png` : "";
                    return `<div class="gs-result" data-type="team" data-abbr="${item.abbr}">
                        ${logo ? `<img class="gs-logo gs-logo-lg" src="${logo}" onerror="this.style.display='none'" alt="${item.abbr}">` : ""}
                        <div class="gs-info">
                            <span class="gs-name">${item.name}</span>
                            <span class="gs-meta">Team · ${item.abbr}</span>
                        </div>
                    </div>`;
                }
            }).join("");

            res.querySelectorAll(".gs-result").forEach(el => {
                el.addEventListener("click", () => {
                    const type = el.dataset.type;
                    if (type === "player") {
                        const name = decodeURIComponent(el.dataset.name);
                        window.location.href = `/stats.html?player=${encodeURIComponent(name)}`;
                    } else {
                        window.location.href = `/stats.html?team=${encodeURIComponent(el.dataset.abbr)}`;
                    }
                    closeSearch();
                });
            });
        } catch (_) {
            res.innerHTML = `<div class="gs-empty">Search unavailable</div>`;
        }
    }

    function openSearch() {
        const ov = buildOverlay();
        ov.classList.add("gs-open");
        setTimeout(() => ov.querySelector("#gsearch-input").focus(), 50);
    }

    function closeSearch() {
        if (overlay) {
            overlay.classList.remove("gs-open");
            overlay.querySelector("#gsearch-input").value = "";
            overlay.querySelector("#gsearch-results").innerHTML = "";
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".gsearch-btn").forEach(btn => {
            btn.addEventListener("click", openSearch);
        });
        document.addEventListener("keydown", e => {
            if ((e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) && !e.target.matches("input,textarea")) {
                e.preventDefault();
                openSearch();
            }
        });
    });
})();

// ── Data freshness pill ───────────────────────────────────────────────────────
(function () {
    document.addEventListener("DOMContentLoaded", async () => {
        const main = document.querySelector("main");
        if (!main) return;

        const wrap = document.createElement("div");
        wrap.id = "freshness-wrap";
        main.insertBefore(wrap, main.firstChild);

        try {
            const data = await fetch("/api/data-freshness").then(r => r.json());
            const { dataWeek, currentWeek, upToDate } = data;
            if (!dataWeek) return;

            const pill = document.createElement("div");
            pill.id = "freshness-pill";

            if (upToDate) {
                pill.className = "fresh";
                pill.innerHTML = `<span class="fp-dot"></span>Stats current through Wk ${dataWeek}`;
            } else {
                const behind = currentWeek - dataWeek;
                pill.className = "stale";
                pill.innerHTML = `<span class="fp-dot"></span>Stats through Wk ${dataWeek} &nbsp;·&nbsp; Wk ${currentWeek - 1} pending`;
            }

            wrap.appendChild(pill);
        } catch (_) {}
    });
})();
