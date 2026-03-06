# react-native-qmdb

## Overview

React Native library providing an authenticated Merkle database (QMDB) via Rust native module + React 19 hooks. Uses Nitro Modules for the JS-to-native bridge (works with bare RN and Expo).

## Architecture

```
src/types/            TypeScript type definitions (database types, native module interface)
src/native/           Native module resolution (Nitro HybridObject) + mock for testing
src/context/          QMDBProvider React context using useSyncExternalStore
src/hooks/            useQMDB, useProof, useSync hooks
src/utils/            Hex encoding, digest comparison
src/__tests__/        Vitest tests (TDD, organized by layer)
src/QMDB.nitro.ts    Nitro spec — Nitrogen generates C++ bindings from this

cpp/HybridQMDB.hpp   C++ HybridObject — calls Rust extern "C" FFI directly via JSI
cpp/OnLoad.cpp        Registers HybridObject in NitroModules registry

rust/src/ffi.rs       C FFI exports (extern "C" functions)
rust/src/state.rs     Instance management, state machine, in-memory store
rust/src/error.rs     Error types with JSON serialization

ios/QMDBBridge.h      C header for Rust FFI (shared by iOS and Android)
ios/                  Pre-built Rust static library destination

android/              CMake + Gradle build config for linking Rust + Nitro

scripts/              Cross-compilation scripts for iOS/Android
.github/workflows/    CI (TypeScript tests + Rust tests + cross-compile checks)
```

## Commands

```bash
npm test              # Vitest (53 JS tests)
npm run test:watch    # Vitest watch mode
npm run typecheck     # tsc --noEmit
npm run build         # tsup -> dist/

cd rust && cargo test    # Rust tests (9 tests)
cd rust && cargo clippy  # Lint
cd rust && cargo fmt     # Format

./scripts/build-ios.sh      # Cross-compile Rust for iOS
./scripts/build-android.sh  # Cross-compile Rust for Android (requires cargo-ndk)
```

## Key Patterns

- All hooks require `<QMDBProvider>` ancestor
- State machine: Clean -> Mutable -> commit -> UnmerkleizedDurable -> merkleize -> Clean
- Native module is injected via `nativeModule` prop (testing) or auto-resolved (production)
- Mock native module uses in-memory Map, not real QMDB
- Tests use `createMockNativeQMDB()` injected via `QMDBProvider nativeModule={mock}`

## Native Bridge (Nitro Modules)

- **No Expo dependency** — works in bare React Native and Expo projects
- C++ HybridObject (HybridQMDB) calls Rust `extern "C"` functions directly
- Nitro provides JSI bindings — no bridge serialization at JS boundary
- JSON serialization only at C++ <-> Rust FFI boundary (serde_json)
- `get()` is sync (runs on JS thread) for zero-overhead reads
- All mutating operations are async
- Registration via `HybridObjectRegistry` in OnLoad.cpp
- JS resolves via `NitroModules.createHybridObject("QMDB")`

## Conventions

- React 19: useSyncExternalStore for reactive state, no useEffect for subscriptions
- TDD: tests written alongside implementation, organized by layer
- All async operations cross the native bridge
- Hex-encoded strings for keys/values/digests at the JS boundary
- The Rust layer owns all cryptographic operations
