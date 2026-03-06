#!/usr/bin/env bash
set -euo pipefail

# Build the Rust library for Android using cargo-ndk.
# Requires: cargo-ndk (cargo install cargo-ndk), Android NDK
# Usage: ./scripts/build-android.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
RUST_DIR="$ROOT_DIR/rust"
JNI_DIR="$ROOT_DIR/android/src/main/jniLibs"

echo "Building qmdb_mobile for Android..."

# Install targets if needed
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  x86_64-linux-android \
  i686-linux-android 2>/dev/null || true

# Check cargo-ndk is installed
if ! command -v cargo-ndk &> /dev/null; then
  echo "Error: cargo-ndk not found. Install with: cargo install cargo-ndk"
  exit 1
fi

# Build for each ABI
for target in arm64-v8a armeabi-v7a x86_64 x86; do
  echo "  -> $target"
  mkdir -p "$JNI_DIR/$target"
  cargo ndk -t "$target" -o "$JNI_DIR" build --release --manifest-path "$RUST_DIR/Cargo.toml"
done

echo "Done. Libraries at: $JNI_DIR"
