#!/usr/bin/env bash
set -euo pipefail

# Build the Rust library for iOS (device + simulator) and create a universal xcframework.
# Usage: ./scripts/build-ios.sh [--release]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
RUST_DIR="$ROOT_DIR/rust"
IOS_DIR="$ROOT_DIR/ios"

PROFILE="release"
CARGO_FLAG="--release"

echo "Building qmdb_mobile for iOS..."

# Install targets if needed
rustup target add aarch64-apple-ios aarch64-apple-ios-sim 2>/dev/null || true

# Build for device (arm64)
echo "  -> aarch64-apple-ios (device)"
cargo build --manifest-path "$RUST_DIR/Cargo.toml" --target aarch64-apple-ios $CARGO_FLAG

# Build for simulator (arm64)
echo "  -> aarch64-apple-ios-sim (simulator)"
cargo build --manifest-path "$RUST_DIR/Cargo.toml" --target aarch64-apple-ios-sim $CARGO_FLAG

# Copy static library to ios/ directory
DEVICE_LIB="$RUST_DIR/target/aarch64-apple-ios/$PROFILE/libqmdb_mobile.a"
SIM_LIB="$RUST_DIR/target/aarch64-apple-ios-sim/$PROFILE/libqmdb_mobile.a"

if [ -f "$DEVICE_LIB" ]; then
  cp "$DEVICE_LIB" "$IOS_DIR/libqmdb_mobile.a"
  echo "  -> Copied device library to ios/libqmdb_mobile.a"
fi

# Create XCFramework (optional, for distribution)
XCFW_DIR="$ROOT_DIR/build/QMDBMobile.xcframework"
rm -rf "$XCFW_DIR"

if [ -f "$DEVICE_LIB" ] && [ -f "$SIM_LIB" ]; then
  xcodebuild -create-xcframework \
    -library "$DEVICE_LIB" -headers "$IOS_DIR" \
    -library "$SIM_LIB" -headers "$IOS_DIR" \
    -output "$XCFW_DIR" 2>/dev/null || true
  echo "  -> Created XCFramework at build/QMDBMobile.xcframework"
fi

echo "Done."
