#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."

release=Pikafish-2026-09-06
commit=4c17cee11f888ae1d48a9494f2e2239f019f0a1f
archive=Pikafish.2026-09-06.7z
archive_sha=41952bbfe2520faceb5902c69e6ab4845cc999841d2b49a95cc1be7867a25e5b
network_sha=7d13d73569a9b571ba0eb20cf1596247bc2a42738967e61afef6482b231e900e

if [[ $(git -C upstream/Pikafish rev-parse HEAD) != "$commit" ]]; then
  printf 'Update the pinned NNUE release to match the Pikafish submodule.\n' >&2
  exit 1
fi

temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
curl --fail --location --silent --show-error --retry 3 --max-time 180 \
  "https://github.com/official-pikafish/Pikafish/releases/download/$release/$archive" \
  --output "$temp_dir/$archive"
printf '%s  %s\n' "$archive_sha" "$temp_dir/$archive" | sha256sum --check
mkdir -p vendor
7z e -bd -y "-o$temp_dir" "$temp_dir/$archive" pikafish.nnue NNUE-License.md
printf '%s  %s\n' "$network_sha" "$temp_dir/pikafish.nnue" | sha256sum --check
mv "$temp_dir/pikafish.nnue" "$temp_dir/NNUE-License.md" vendor/
