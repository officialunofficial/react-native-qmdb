# react-native-qmdb

## Overview

React Native library providing an authenticated Merkle database (QMDB) via Rust native module + React 19 hooks.

## Architecture

- `src/types/` — TypeScript type definitions (database types, native module interface)
- `src/native/` — Native module resolution + mock for testing
- `src/context/` — QMDBProvider React context using useSyncExternalStore
- `src/hooks/` — useQMDB, useProof, useSync hooks
- `src/utils/` — Hex encoding, digest comparison
- `src/__tests__/` — Vitest tests (TDD, organized by layer)
- `rust/` — Rust cdylib that wraps commonware-storage for mobile FFI

## Commands

```bash
npm test              # Vitest
npm run test:watch    # Vitest watch mode
npm run test:coverage # With coverage
npm run typecheck     # tsc --noEmit
npm run build         # tsup → dist/
cd rust && cargo test # Rust tests
```

## Key Patterns

- All hooks require `<QMDBProvider>` ancestor
- State machine: Clean → Mutable → commit → merkleize → Clean
- Native module is injected via `nativeModule` prop (testing) or auto-resolved (production)
- Mock native module uses in-memory Map, not real QMDB
- Tests use `createMockNativeQMDB()` injected via `QMDBProvider nativeModule={mock}`

## Conventions

- React 19: useSyncExternalStore for reactive state, no useEffect for subscriptions
- TDD: tests written alongside implementation, organized by layer
- All async operations cross the native bridge — no sync native calls
- Hex-encoded strings for keys/values/digests at the JS boundary
- The Rust layer owns all cryptographic operations
