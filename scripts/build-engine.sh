#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."

target=$1
link_flags=
case "$target" in
  linux-x64) arch=x86-64; compiler=gcc; link_flags=-static-libstdc++ ;;
  linux-arm64) arch=armv8; compiler=gcc; link_flags=-static-libstdc++ ;;
  darwin-x64) arch=x86-64; compiler=clang ;;
  darwin-arm64) arch=apple-silicon; compiler=clang ;;
  win32-x64) arch=x86-64; compiler=clang ;;
  *) printf 'Unsupported build target %s\n' "$target" >&2; exit 1 ;;
esac

executable=pikafish
if [[ $target == win32-x64 ]]; then executable=pikafish.exe; fi
source_dir=upstream/Pikafish/src
cp vendor/pikafish.nnue "$source_dir/"
make -C "$source_dir" -j "${BUILD_JOBS:-3}" build "ARCH=$arch" "COMP=$compiler" "EXE=$executable" "EXTRALDFLAGS=$link_flags"
make -C "$source_dir" strip "ARCH=$arch" "COMP=$compiler" "EXE=$executable"
mkdir -p "vendor/$target"
cp "$source_dir/$executable" "vendor/$target/$executable"
