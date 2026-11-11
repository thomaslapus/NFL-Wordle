#!/usr/bin/env bash
# Render startup: pull the latest nfl.db from the GitHub repo before the server starts.
# Runs only when GITHUB_REPO and GITHUB_TOKEN are set in the Render environment.
# Set these in Render: Dashboard → Environment:
#   GITHUB_REPO = thomaslapus/nfl-wordle
#   GITHUB_TOKEN = <personal access token with repo:read scope>

set -e

DB_PATH="data/nfl.db"
mkdir -p data

if [ -z "$GITHUB_TOKEN" ] || [ -z "$GITHUB_REPO" ]; then
  echo "[pull-db] GITHUB_REPO or GITHUB_TOKEN not set — skipping DB pull"
  exit 0
fi

# Use GitHub API to download the raw DB file.
# The DB is a binary SQLite file tracked in the repo root.
echo "[pull-db] Downloading $DB_PATH from $GITHUB_REPO …"
HTTP_STATUS=$(curl -sL \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3.raw" \
  -w "%{http_code}" \
  -o "$DB_PATH.tmp" \
  "https://api.github.com/repos/$GITHUB_REPO/contents/$DB_PATH")

if [ "$HTTP_STATUS" = "200" ]; then
  mv "$DB_PATH.tmp" "$DB_PATH"
  echo "[pull-db] DB downloaded successfully ($(du -sh $DB_PATH | cut -f1))"
else
  rm -f "$DB_PATH.tmp"
  echo "[pull-db] Download failed (HTTP $HTTP_STATUS) — using existing DB if present"
fi
