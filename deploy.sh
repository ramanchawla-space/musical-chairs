#!/usr/bin/env bash
# Build and publish to GitHub Pages (gh-pages branch of ramanchawla-space/musical-chairs).
# Live at https://ramanchawla-space.github.io/musical-chairs/
set -euo pipefail
cd "$(dirname "$0")"
REPO="https://github.com/ramanchawla-space/musical-chairs.git"

npm run build
STAGE="$(mktemp -d)"
cp -R dist/. "$STAGE/"
touch "$STAGE/.nojekyll"
cd "$STAGE"
git init -q
git config user.name "Raman Chawla"
git config user.email "ramanfromoz@gmail.com"
git add -A
git commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git branch -M gh-pages
git remote add origin "$REPO"
git push -qf origin gh-pages
rm -rf "$STAGE"
echo "Done — https://ramanchawla-space.github.io/musical-chairs/ (allow ~1 min for the CDN)"
