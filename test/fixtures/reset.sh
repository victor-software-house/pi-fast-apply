#!/usr/bin/env bash
# reset.sh — copy all morph_edit test fixtures to /tmp/morph-test/
#
# Usage:
#   bash test/fixtures/reset.sh           # copy everything
#   bash test/fixtures/reset.sh ts/tiny   # copy one file (relative to fixtures/)
#
# After running, /tmp/morph-test/ mirrors the fixture tree exactly.
# Re-run at any time to discard in-place morph edits and start fresh.

set -euo pipefail

FIXTURES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/tmp/morph-test"

# ---------------------------------------------------------------------------
# Single-file mode
# ---------------------------------------------------------------------------
if [[ $# -ge 1 ]]; then
  src="$FIXTURES_DIR/$1"
  dst="$TARGET_DIR/$1"
  if [[ ! -f "$src" ]]; then
    echo "Error: fixture not found: $src" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "Reset: $dst"
  exit 0
fi

# ---------------------------------------------------------------------------
# Full reset
# ---------------------------------------------------------------------------
mkdir -p "$TARGET_DIR"

total=0
while IFS= read -r -d '' src; do
  rel="${src#"$FIXTURES_DIR/"}"
  # Skip this script and the README
  [[ "$rel" == "reset.sh" || "$rel" == "README.md" ]] && continue
  dst="$TARGET_DIR/$rel"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  total=$((total + 1))
done < <(find "$FIXTURES_DIR" -type f -print0)

echo ""
echo "Fixture reset complete — $total files → $TARGET_DIR"
echo ""

# Print manifest
find "$TARGET_DIR" -type f | sort | while read -r f; do
  rel="${f#"$TARGET_DIR/"}"
  size=$(wc -c < "$f" | tr -d ' ')
  lines=$(wc -l < "$f" | tr -d ' ')
  printf "  %-42s  %6d bytes  %4d lines\n" "$rel" "$size" "$lines"
done
