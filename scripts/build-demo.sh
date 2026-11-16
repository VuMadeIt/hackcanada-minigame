#!/usr/bin/env bash
# Static demo for GitHub Pages: no server, so the API routes and the prize desk are left out
# and the game talks to src/components/demo.ts instead.
set -euo pipefail
cd "$(dirname "$0")/.."
stash=$(mktemp -d)
restore() { mv "$stash/api" src/app/api; mv "$stash/admin" src/app/admin; rmdir "$stash"; }
mv src/app/api "$stash/api"
mv src/app/admin "$stash/admin"
trap restore EXIT
rm -rf out .next-demo
NEXT_PUBLIC_DEMO=1 NEXT_PUBLIC_BASE_PATH="${BASE_PATH-/hackcanada-minigame}" npx next build
# with a custom distDir the export lands there, not in out/
mv .next-demo out
touch out/.nojekyll
