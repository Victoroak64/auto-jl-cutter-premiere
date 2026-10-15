#!/bin/bash
# Auto J/L Cutter — macOS installer
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/auto-jl-cutter"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions"
echo ""
echo "  AUTO J/L CUTTER — macOS installer"
echo ""
if [ ! -d "$SRC" ]; then
	echo "  ERROR: 'auto-jl-cutter' folder not found next to this script. Extract the .zip first."
	read -p "  Press ENTER to close."; exit 1
fi
if pgrep -x "Adobe Premiere Pro" >/dev/null 2>&1; then
	echo "  HEADS UP: Premiere is running. Quit it (Cmd+Q) and reopen after installing."
	echo ""
fi
echo "  [1/3] Allowing unsigned extensions..."
for v in 9 10 11 12 13 14 15; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null; done
echo "  [2/3] Installing..."
mkdir -p "$DEST"
rm -rf "$DEST/auto-jl-cutter"
cp -R "$SRC" "$DEST/"
echo "  [3/3] Verifying..."
MISSING=0
for f in CSXS/manifest.xml client/index.html client/js/main.js client/js/planner.js client/js/matrix.js client/js/CSInterface.js host/main.jsx; do
	[ -f "$DEST/auto-jl-cutter/$f" ] || { echo "  missing: $f"; MISSING=1; }
done
if [ $MISSING -eq 0 ]; then echo "  INSTALLED SUCCESSFULLY → $DEST/auto-jl-cutter"; else echo "  Installed, but with files missing (see above). Please open an issue on GitHub with this output."; fi
echo ""
echo "  Open Premiere → Window → Extensions → Auto J/L Cutter"
read -p "  Press ENTER to close."
