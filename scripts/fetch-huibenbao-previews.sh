#!/bin/zsh
set -euo pipefail

output_root="${1:-/tmp/new-magic-huibenbao}"
mkdir -p "$output_root/html" "$output_root/images"

volumes=(
  "1a:6588:6593"
  "1b:6594:6599"
  "2a:6600:6605"
  "2b:6606:6611"
  "3a:6612:6617"
  "3b:6618:6623"
  "4b:6624:6629"
  "5a:6630:6635"
  "5b:6636:6641"
)

for spec in "${volumes[@]}"; do
  volume="${spec%%:*}"
  range="${spec#*:}"
  first_id="${range%%:*}"
  last_id="${range##*:}"
  mkdir -p "$output_root/images/$volume"
  unit=1

  for id in $(seq "$first_id" "$last_id"); do
    html="$output_root/html/$id.html"
    curl -L --compressed --max-time 30 "https://www.huibenbao.com/book/$id" -o "$html"

    page=1
    while IFS= read -r url; do
      curl -L --max-time 30 "$url" -o "$output_root/images/$volume/u${unit}-p${page}.jpg"
      page=$((page + 1))
    done < <(
      rg -o 'https://image\.huibenbao\.com/file/picture-books/image/[^"[:space:]]+\.jpg[^"[:space:]]*' "$html" \
        | sed 's/?x-oss-process=.*//' \
        | awk '!seen[$0]++'
    )

    unit=$((unit + 1))
  done
done
