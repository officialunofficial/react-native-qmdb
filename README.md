# react-native-qmdb

Authenticated Merkle database for React Native — cryptographic proofs over local state, powered by [QMDB](https://arxiv.org/abs/2501.05262) + [Commonware](https://commonware.xyz).

## Why Use This?

Mobile apps trust their servers implicitly. Your app fetches data, displays it, and hopes nothing was tampered with in between. **react-native-qmdb** eliminates that trust assumption.

QMDB (Quick Merkle Database) layers a Merkle Mountain Range over an append-only key-value log. Every write produces a cryptographic commitment. Every read can be independently verified. This gives your React Native app properties that were previously only available to blockchain nodes:

- **Verifiable local state** — prove that data hasn't been tampered with, even offline
- **Trustless sync** — verify server responses against a known Merkle root instead of trusting the server
- **Tamper-evident storage** — any modification to historical data invalidates the proof chain
- **Offline-first with integrity** — append operations locally, prove consistency when reconnecting
- **Auditable history** — prove any value ever associated with a key, not just the current one

And it's fast. QMDB achieves 2.28M state updates/sec with ~2.3 bytes/entry memory overhead and O(1) merkleization (zero disk reads to compute roots). The Rust core compiles to a native module — no JS crypto overhead.

### When is this useful?

**When you need to prove what happened, not just store it.** If your app only needs a local cache, use SQLite or MMKV. If you need any of the following, QMDB is the right tool:

| You need... | Why QMDB helps |
|---|---|
| Users to verify they got the right data from your server | Proof verification against a shared root |
| Tamper-evident audit logs on device | Append-only log with Merkle commitments |
| Conflict-free sync between devices | Operation logs with cryptographic consistency checks |
| Regulatory compliance for data integrity | Provable, timestamped operation history |
| Users to prove ownership or actions | Historical proofs over any key at any point in time |
| Peer-to-peer state exchange without a trusted server | Both sides verify against the same root |

## Examples

### Verified Settings Sync

Ensure a user's settings weren't modified in transit between devices or by a compromised server:

```tsx
import { QMDBProvider, useQMDB, useProof, useSync } from 'react-native-qmdb';

function SettingsScreen() {
  const db = useQMDB();
  const { prove, verify } = useProof();
  const { push, pull, status } = useSync();

  // Save a setting with cryptographic commitment
  async function saveSetting(key: string, value: string) {
    await db.startTransaction();
    await db.set(`settings:${key}`, value);
    const root = await db.commitAndMerkleize();
    // root is a SHA-256 digest — pin it, share it, compare it
    console.log('New state root:', root);
  }

  // Sync settings to another device and verify integrity
  async function syncToCloud() {
    await push(0, async (ops) => {
      await fetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ operations: ops, root: db.root }),
      });
    });
  }

  // Pull settings from cloud and verify nothing was altered
  async function syncFromCloud() {
    await pull(async (since, limit) => {
      const res = await fetch(`/api/sync?since=${since}&limit=${limit}`);
      const { operations, root: serverRoot } = await res.json();

      // Verify the server's state matches what we expect
      const proof = await prove('settings:theme');
      const result = await verify(proof, serverRoot);
      if (!result.valid) throw new Error('Server state is inconsistent');

      return operations;
    });
  }

  return (
    <View>
      <Text>Sync: {status}</Text>
      <Button title="Dark Mode" onPress={() => saveSetting('theme', 'dark')} />
      <Button title="Push" onPress={syncToCloud} />
      <Button title="Pull" onPress={syncFromCloud} />
    </View>
  );
}
```

### Tamper-Evident Audit Log

Record user actions with cryptographic guarantees — useful for fintech, healthcare, or any regulated app:

```tsx
function AuditLog() {
  const db = useQMDB();
  const { prove } = useProof();

  async function recordAction(action: string, details: string) {
    const timestamp = Date.now().toString();
    const entry = JSON.stringify({ action, details, timestamp });

    await db.startTransaction();
    await db.set(`audit:${timestamp}`, entry);
    const root = await db.commitAndMerkleize();

    // Store root externally (server, blockchain, etc.) for independent verification
    await fetch('/api/audit/anchor', {
      method: 'POST',
      body: JSON.stringify({ root, timestamp }),
    });
  }

  // Generate a proof that a specific action occurred
  async function proveAction(timestamp: string) {
    const proof = await prove(`audit:${timestamp}`);
    // This proof can be verified by anyone with the anchored root
    return proof;
  }

  return (
    <View>
      <Button
        title="Record Transfer"
        onPress={() => recordAction('transfer', '100 USDC to 0xabc...')}
      />
    </View>
  );
}
```

### Peer-to-Peer Data Exchange

Two devices can exchange state and independently verify consistency — no trusted server required:

```tsx
function P2PSync() {
  const db = useQMDB();
  const { verify } = useProof();
  const { pull } = useSync();

  // Receive state from a peer over any transport (BLE, WebRTC, local network)
  async function receiveFromPeer(peerData: {
    operations: Operation[];
    proof: Proof;
    root: string;
  }) {
    // Verify the peer's proof against their claimed root
    const result = await verify(peerData.proof, peerData.root);

    if (!result.valid) {
      console.warn('Peer data failed verification — rejecting');
      return;
    }

    // Safe to apply — cryptographically verified
    await db.startTransaction();
    await pull(async () => peerData.operations);
    await db.commitAndMerkleize();
  }
}
```

### Verified Cache Layer

Replace a plain cache with one that detects server-side data corruption:

```tsx
function useVerifiedFetch(endpoint: string) {
  const db = useQMDB();
  const { prove, verify } = useProof();
  const [data, setData] = useState(null);

  async function fetchAndCache() {
    const res = await fetch(endpoint);
    const { payload, root: serverRoot } = await res.json();

    // Cache locally with Merkle commitment
    await db.startTransaction();
    await db.set(`cache:${endpoint}`, JSON.stringify(payload));
    const localRoot = await db.commitAndMerkleize();

    setData(payload);
  }

  // On subsequent reads, verify the cache hasn't been tampered with
  async function readFromCache() {
    const cached = await db.get(`cache:${endpoint}`);
    if (!cached) return null;

    const proof = await prove(`cache:${endpoint}`);
    const result = await verify(proof, db.root!);

    if (!result.valid) {
      // Cache was tampered with — refetch
      console.warn('Cache integrity check failed');
      await fetchAndCache();
      return;
    }

    setData(JSON.parse(cached));
  }

  return { data, fetch: fetchAndCache, readFromCache };
}
```

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
    await db.open({ path: '/data/mydb', create: true });

    await db.startTransaction();
    await db.set('user:alice', 'fid:1234');
    const root = await db.commitAndMerkleize();

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
    |
QMDBProvider (context + useSyncExternalStore)
    |
Native Module Interface (NativeQMDB)
    |
Rust cdylib (commonware-storage, no_std)
    |
Platform filesystem (iOS/Android)
```

## API

### Hooks

| Hook | Purpose |
|------|---------|
| `useQMDB()` | Open/close, get/set/remove, transactions, state |
| `useProof()` | Generate and verify Merkle proofs |
| `useSync()` | Push/pull sync with remote QMDB instances |

### `useQMDB()`

```ts
const {
  root,           // Current Merkle root (null if not merkleized)
  isOpen,         // Whether the database is open
  state,          // 'clean' | 'mutable' | 'unmerkleized_durable' | 'merkleized_nondurable' | null
  activeKeys,     // Number of active keys
  operationCount, // Total operations in the log

  open,               // (config) => Promise<void>
  close,              // () => Promise<void>
  get,                // (key) => Promise<string | null>
  set,                // (key, value) => Promise<void>
  remove,             // (key) => Promise<void>
  startTransaction,   // () => Promise<void> — transitions to mutable
  commitAndMerkleize, // () => Promise<string> — commit + merkleize, returns new root
} = useQMDB();
```

### `useProof()`

```ts
const {
  prove,      // (key) => Promise<Proof>
  rangeProof, // (start, end) => Promise<Proof>
  verify,     // (proof, root) => Promise<VerifyResult>
  lastResult, // Last verification result
  isPending,  // Whether any proof operation is in progress
} = useProof();
```

### `useSync()`

```ts
const {
  status,              // 'idle' | 'syncing' | 'synced' | 'error'
  error,               // Error message if status is 'error'
  lastSyncedLocation,  // Last synced operation location

  push, // (since, sender) => Promise<void> — push local ops via sender callback
  pull, // (fetcher, limit?) => Promise<void> — pull remote ops via fetcher callback
} = useSync();
```

### State Machine

```
open() -----> Clean
                |
         startTransaction()
                |
              Mutable -----> commit() -----> Unmerkleized+Durable
                                                      |
                                                 merkleize()
                                                      |
                                                    Clean
```

`commitAndMerkleize()` combines the last two steps into a single call.

## Development

```bash
npm install
npm test          # Run vitest (53 tests)
npm run typecheck # TypeScript check
cd rust && cargo test  # Rust tests
```

## Performance

QMDB's Rust core delivers:

- **2.28M state updates/sec** on commodity hardware
- **~2.3 bytes/entry** memory overhead
- **O(1) merkleization** — no disk reads to compute roots, regardless of database size
- **6x faster** than RocksDB for authenticated state operations

The native module bridge adds minimal overhead — JSON serialization for structured data, direct C FFI for the hot path.

## License

MIT
