#!/bin/sh
set -e
cd "$(dirname "$0")"
npm run check
npm run build
REMOTE=$(git remote get-url origin)
REV=$(git rev-parse --short HEAD)
TMP=$(mktemp -d)
cp -R dist/. "$TMP"/
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "Publish $REV"
git push -f "$REMOTE" gh-pages
cd "$OLDPWD"
rm -rf "$TMP"
echo "Published $REV to gh-pages."
