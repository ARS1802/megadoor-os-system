#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
SOURCE_SVG="$SCRIPT_DIR/megadoor-icon.svg"
OUTPUT_DIR="${1:-$SCRIPT_DIR}"
OUTPUT_ICO="$OUTPUT_DIR/megadoor-icon.ico"
OUTPUT_SVG="$OUTPUT_DIR/megadoor-icon.svg"
SIZES=(16 24 32 48 64 128 256)

fail() {
  printf 'Erro: %s\n' "$1" >&2
  exit 1
}

command -v inkscape >/dev/null 2>&1 || fail "Inkscape não está disponível."

if command -v magick >/dev/null 2>&1; then
  IMAGEMAGICK=(magick)
elif command -v convert >/dev/null 2>&1; then
  IMAGEMAGICK=(convert)
else
  fail "ImageMagick não está disponível (magick ou convert)."
fi

[[ -f "$SOURCE_SVG" ]] || fail "SVG canônico não encontrado: $SOURCE_SVG"

mapfile -t COLORS < <(grep -Eo '#[0-9A-Fa-f]{6}' "$SOURCE_SVG" | tr '[:lower:]' '[:upper:]' | sort -u)
[[ "${#COLORS[@]}" -le 2 ]] || fail "O ícone excede o limite de duas cores."

WORK_DIR="$(mktemp -d)"
trap 'rm -rf -- "$WORK_DIR"' EXIT

declare -a PNG_FILES=()

for size in "${SIZES[@]}"; do
  raw_png="$WORK_DIR/megadoor-${size}-raw.png"
  clean_png="$WORK_DIR/megadoor-${size}.png"

  inkscape "$SOURCE_SVG" \
    --export-type=png \
    --export-filename="$raw_png" \
    --export-width="$size" \
    --export-height="$size" \
    --export-background-opacity=0 >/dev/null

  "${IMAGEMAGICK[@]}" "$raw_png" \
    -strip \
    -depth 8 \
    -define png:exclude-chunks=date,time \
    "PNG32:$clean_png"

  actual_dimensions="$(identify -format '%wx%h' "$clean_png")"
  [[ "$actual_dimensions" == "${size}x${size}" ]] || \
    fail "Dimensão inesperada para ${size}px: $actual_dimensions"

  PNG_FILES+=("$clean_png")
done

mkdir -p -- "$OUTPUT_DIR"
"${IMAGEMAGICK[@]}" "${PNG_FILES[@]}" -strip "$OUTPUT_ICO"
if [[ "$OUTPUT_SVG" != "$SOURCE_SVG" ]]; then
  cp -- "$SOURCE_SVG" "$OUTPUT_SVG"
fi

mapfile -t ICO_DIMENSIONS < <(identify -format '%wx%h\n' "$OUTPUT_ICO")

for size in "${SIZES[@]}"; do
  printf '%s\n' "${ICO_DIMENSIONS[@]}" | grep -Fxq "${size}x${size}" || \
    fail "O ICO não contém a resolução ${size}x${size}."
done

printf 'Ícone criado: %s\n' "$OUTPUT_ICO"
printf 'SHA-256: '
sha256sum "$OUTPUT_ICO" | awk '{print $1}'
