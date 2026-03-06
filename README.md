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
| Fast, verifiable message sync | Operation log replays with cryptographic consistency — detect dropped or altered messages |
| Tamper-evident audit trail | Append-only log with Merkle commitments that anyone can independently verify |
| Peer-to-peer state without a trusted server | Both sides verify against the same root — no coordinator needed |
| Proof that a user did (or didn't do) something | Historical proofs over any key at any point in time |
| Verified API responses | Server publishes a root commitment, client verifies every response against it |

## Examples

### Chat Sync

Sync messages between devices, detect if the server dropped or reordered anything:

```tsx
import { QMDBProvider, useQMDB, useProof, useSync } from 'react-native-qmdb';

function ChatScreen({ conversationId }: { conversationId: string }) {
  const db = useQMDB();
  const { verify } = useProof();
  const { push, pull, status, lastSyncedLocation } = useSync();

  // Send a message — append to the local log with a Merkle commitment
  async function sendMessage(text: string) {
    const id = `${conversationId}:${Date.now()}`;
    const message = JSON.stringify({ text, sender: 'me', ts: Date.now() });

    await db.startTransaction();
    await db.set(id, message);
    const root = await db.commitAndMerkleize();

    // Push the new operations to the server along with the root
    await push(lastSyncedLocation ?? 0, async (ops) => {
      await fetch(`/api/chat/${conversationId}/sync`, {
        method: 'POST',
        body: JSON.stringify({ operations: ops, root }),
      });
    });
  }

  // Pull new messages — verify the server didn't tamper with the history
  async function pullMessages() {
    await pull(async (since, limit) => {
      const res = await fetch(
        `/api/chat/${conversationId}/sync?since=${since}&limit=${limit}`
      );
      const { operations, root: serverRoot } = await res.json();

      // If we already have state, verify the server's root is consistent
      if (db.root) {
        const result = await verify(
          { operations, nodes: [serverRoot], range: { start: since, end: since + operations.length } },
          serverRoot
        );
        if (!result.valid) throw new Error('Server history is inconsistent — possible tampering');
      }

      return operations;
    });
  }

  return (
    <View>
      <Text>Sync: {status}</Text>
      <MessageList />
      <ComposeBar onSend={sendMessage} />
      <Button title="Refresh" onPress={pullMessages} />
    </View>
  );
}
```

### Tamper-Evident Audit Log

Every action the user takes gets a cryptographic receipt. Useful for fintech, healthcare, or any app where "I didn't do that" is a legal question:

```tsx
function AuditLog() {
  const db = useQMDB();
  const { prove } = useProof();

  // Record an action — the root becomes an unforgeable receipt
  async function recordAction(action: string, details: string) {
    const id = `audit:${Date.now()}`;
    const entry = JSON.stringify({ action, details, ts: Date.now() });

    await db.startTransaction();
    await db.set(id, entry);
    const root = await db.commitAndMerkleize();

    // Anchor the root externally — server, blockchain, whatever
    // Anyone with this root can later verify any proof you produce
    await fetch('/api/audit/anchor', {
      method: 'POST',
      body: JSON.stringify({ root, id }),
    });

    return { root, id };
  }

  // Generate a portable proof that a specific action occurred
  // Hand this to an auditor, regulator, or counterparty
  async function exportProof(id: string) {
    const proof = await prove(id);
    // proof + root = independently verifiable evidence
    return { proof, root: db.root };
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

### Collaborative State (P2P)

Two users share a list over any transport — BLE, WebRTC, local WiFi. No server decides who's right; the Merkle root does:

```tsx
function SharedList() {
  const db = useQMDB();
  const { verify } = useProof();
  const { push, pull } = useSync();

  // Add an item and broadcast your latest state
  async function addItem(name: string) {
    await db.startTransaction();
    await db.set(`item:${Date.now()}`, name);
    const root = await db.commitAndMerkleize();

    // Send your new ops to the peer (BLE, WebRTC, etc.)
    await push(0, async (ops) => {
      peer.send({ operations: ops, root });
    });
  }

  // Receive ops from a peer — verify before applying
  async function onPeerData(data: { operations: Operation[]; root: string }) {
    // Verify the peer's claimed state is internally consistent
    const check = await verify(
      { operations: data.operations, nodes: [data.root], range: { start: 0, end: data.operations.length } },
      data.root
    );

    if (!check.valid) {
      console.warn('Peer sent inconsistent data — ignoring');
      return;
    }

    // Verified — safe to merge into our local state
    await db.startTransaction();
    await pull(async () => data.operations);
    await db.commitAndMerkleize();
  }
}
```

### Verified API Responses

Your server commits to a Merkle root. Your app verifies every response against it — a compromised CDN or MITM can't serve fake data:

```tsx
function useVerifiedAPI(endpoint: string) {
  const db = useQMDB();
  const { prove, verify } = useProof();

  // Fetch data and verify it matches the server's published commitment
  async function fetchVerified<T>(path: string): Promise<T> {
    const res = await fetch(`${endpoint}${path}`);
    const { data, proof, root } = await res.json();

    // Verify the server's proof — does this data actually belong to this root?
    const result = await verify(proof, root);
    if (!result.valid) {
      throw new Error(`Verification failed for ${path} — data may be tampered`);
    }

    // Cache locally so we can re-verify offline
    await db.startTransaction();
    await db.set(`api:${path}`, JSON.stringify(data));
    await db.commitAndMerkleize();

    return data as T;
  }

  // Re-verify cached data offline against our local root
  async function readCached<T>(path: string): Promise<T | null> {
    const cached = await db.get(`api:${path}`);
    if (!cached) return null;

    const proof = await prove(`api:${path}`);
    const result = await verify(proof, db.root!);
    if (!result.valid) return null; // tampered — discard

    return JSON.parse(cached) as T;
  }

  return { fetchVerified, readCached };
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
