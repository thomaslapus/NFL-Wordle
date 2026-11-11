#!/usr/bin/env node
"use strict";
// Fetches one player's 2025 game log and dumps the raw response.
// Usage: RAPIDAPI_KEY=your_key node db/diagnose-gamelogs.js

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

if (!RAPIDAPI_KEY) { console.error("Set RAPIDAPI_KEY"); process.exit(1); }

// Jacoby Brissett — verified Tank01/ESPN ID from your roster data
const PLAYER_ID = "2578570";
const SEASON    = 2025;

(async () => {
    const url = `https://${RAPIDAPI_HOST}/getNFLGamesForPlayer?playerID=${PLAYER_ID}&season=${SEASON}`;
    console.log("Fetching:", url, "\n");
    const res = await fetch(url, {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST },
    });
    const json = await res.json();
    console.log("=== Raw response ===");
    console.log(JSON.stringify(json, null, 2).slice(0, 3000));

    const body = json.body ?? json;
    console.log("\n=== body type:", typeof body, Array.isArray(body) ? "(array)" : "");
    if (body && typeof body === "object" && !Array.isArray(body)) {
        console.log("=== body keys:", Object.keys(body).join(", "));
        for (const [k, v] of Object.entries(body)) {
            if (Array.isArray(v) && v.length) {
                console.log(`\n=== body.${k} (array, first element keys):`, Object.keys(v[0]).join(", "));
                console.log("First element:", JSON.stringify(v[0], null, 2));
                break;
            }
        }
    } else if (Array.isArray(body) && body.length) {
        console.log("=== First game keys:", Object.keys(body[0]).join(", "));
        console.log("First game:", JSON.stringify(body[0], null, 2));
    }
})().catch(console.error);
