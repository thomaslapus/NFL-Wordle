#!/usr/bin/env bash
# Push the latest nfl.db to GitHub so Render picks it up on next deploy.
# Run from the project root: bash scripts/push-db.sh
set -e

cd "$(dirname "$0")/.."

if ! git diff --quiet data/nfl.db 2>/dev/null && git ls-files --error-unmatch data/nfl.db 2>/dev/null; then
  echo "[push-db] data/nfl.db is tracked and unchanged — nothing to push"
  exit 0
fi

git add data/nfl.db
git commit -m "chore: update nfl.db [skip ci]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
echo "[push-db] DB pushed to GitHub"
