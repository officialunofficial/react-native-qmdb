# react-native-qmdb

Authenticated Merkle database for React Native — cryptographic proofs over local state, powered by [QMDB](https://arxiv.org/abs/2501.05262) + [Commonware](https://commonware.xyz).

## What is this?

QMDB (Quick Merkle Database) layers a Merkle Mountain Range over an append-only key-value log. This library brings that to React Native, giving your mobile app:

- **Verifiable local state** — cryptographic proofs that data hasn't been tampered with
- **Trustless sync** — verify server responses against a known Merkle root
- **Offline-first** — append operations locally, prove consistency when reconnecting
- **Historical proofs** — prove any value ever associated with a key

The heavy lifting (SHA-256 hashing, MMR construction, proof generation) runs in Rust via a native module. The React layer provides idiomatic hooks for React 19.

## Install

```bash
npm install react-native-qmdb
```

## Quick Start

```tsx
import { QMDBProvider, useQMDB, useProof } from 'react-native-qmdb';

function App() {
  return (
    <QMDBProvider>
      <MyComponent />
    </QMDBProvider>
  );
}

function MyComponent() {
  const db = useQMDB();
  const { prove, verify } = useProof();

  async function example() {
    // Open database
    await db.open({ path: '/data/mydb', create: true });

    // Write data
    await db.startTransaction();
    await db.set('user:alice', 'fid:1234');
    const root = await db.commitAndMerkleize();

    // Generate and verify a proof
    const proof = await prove('user:alice');
    const result = await verify(proof, root);
    console.log(result.valid); // true
  }

  return <Button onPress={example} title="Run" />;
}
```

## Architecture

```
React 19 Hooks (useQMDB, useProof, useSync)
    ↓
QMDBProvider (context + useSyncExternalStore)
    ↓
Native Module Interface (NativeQMDB)
    ↓
Rust cdylib (commonware-storage, no_std)
    ↓
Platform filesystem (iOS/Android)
```

## API

### Hooks

| Hook | Purpose |
|------|---------|
| `useQMDB()` | Primary CRUD + state machine operations |
| `useProof()` | Generate and verify Merkle proofs |
| `useSync()` | Push/pull sync with remote QMDB instances |

### State Machine

```
init() → Clean
Clean → into_mutable() → Mutable
Mutable → commit() → Unmerkleized+Durable
Unmerkleized+Durable → merkleize() → Clean
```

## Development

```bash
npm install
npm test          # Run vitest
npm run typecheck # TypeScript check
cd rust && cargo test  # Rust tests
```

## License

MIT
