#!/usr/bin/env bash
# Builds the release package from src/ (validates everything first).
# Usage: scripts/build.sh   →  dist/Auto-JL-Cutter-v<version>.zip
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# folder name Premiere sees inside extensions/
EXT="auto-jl-cutter"

VERSION=$(grep -o 'ExtensionBundleVersion="[^"]*"' src/CSXS/manifest.xml | head -1 | cut -d'"' -f2)
[ -n "$VERSION" ] || { echo "ERROR: couldn't read the version from manifest.xml"; exit 1; }
PKG="Auto-JL-Cutter-v${VERSION}"
OUT="dist/${PKG}"
echo "Building ${PKG}..."

echo "  JavaScript syntax..."
for f in src/client/js/*.js; do node --check "$f" >/dev/null || { echo "  syntax ERROR: $f"; exit 1; }; done
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp src/host/main.jsx "$TMP/host.js" && node --check "$TMP/host.js" >/dev/null || { echo "  syntax ERROR: host/main.jsx"; exit 1; }

echo "  ExtendScript is ES3 (incl. reserved words as property names)..."
node scripts/check-es3.js src/host/main.jsx >/dev/null || { node scripts/check-es3.js src/host/main.jsx; exit 1; }

echo "  manifest.xml..."
python3 -c "import xml.etree.ElementTree as ET; ET.parse('src/CSXS/manifest.xml')" || { echo "  ERROR: invalid manifest.xml"; exit 1; }

echo "  required files..."
for f in CSXS/manifest.xml client/index.html client/js/main.js client/js/planner.js client/js/matrix.js client/js/CSInterface.js host/main.jsx; do
	[ -f "src/$f" ] || { echo "  ERROR: missing src/$f"; exit 1; }
done

echo "  panel ids and host functions..."
for id in $(grep -oE '\$\("[a-z-]+"\)' src/client/js/main.js | sed -E 's/.*"(.*)".*/\1/' | sort -u); do
	grep -q "id=\"$id\"" src/client/index.html || { echo "  ERROR: id '$id' used in main.js but missing in index.html"; exit 1; }
done
for fn in $(grep -oE 'host\("jl_[a-zA-Z]+"' src/client/js/main.js | sed -E 's/host\("//;s/"//' | sort -u); do
	grep -q "^function $fn" src/host/main.jsx || { echo "  ERROR: host function '$fn' missing in host/main.jsx"; exit 1; }
done

echo "  planner tests..."
node test/planner.test.js >/dev/null || { node test/planner.test.js; exit 1; }

echo "  Windows installer line endings (CRLF)..."
grep -q $'\r' scripts/install-windows.bat || { echo "  ERROR: install-windows.bat must use CRLF line endings"; exit 1; }

# --- assemble ---
rm -rf "$OUT" "dist/${PKG}.zip"
mkdir -p "$OUT/$EXT"
cp -R src/. "$OUT/$EXT/"
rm -f "$OUT/$EXT/.debug"            # remote-debug port: never ship it
find "$OUT" -name .DS_Store -delete
cp scripts/install-mac.command "$OUT/INSTALL-mac.command"
cp scripts/install-windows.bat "$OUT/INSTALL-windows.bat"
cp docs/COMECE-AQUI.html "$OUT/COMECE-AQUI.html"
cp docs/START-HERE.html "$OUT/START-HERE.html"
chmod +x "$OUT/INSTALL-mac.command"

( cd dist && zip -rq "${PKG}.zip" "$PKG" -x "*.DS_Store" )
echo ""
echo "OK: dist/${PKG}.zip"
ls -lh "dist/${PKG}.zip"
