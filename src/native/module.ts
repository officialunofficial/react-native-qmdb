/**
 * Native module resolution — loads the Rust-backed QMDB via Nitro Modules.
 *
 * Nitro provides direct JSI bindings (no bridge serialization).
 * Falls back to mock injection for testing.
 */

import type { NativeQMDB } from "../types";

let _nativeModule: NativeQMDB | null = null;

/**
 * Get the native QMDB module.
 *
 * Resolution order:
 * 1. Injected mock (for testing)
 * 2. Nitro HybridObject (production — works with or without Expo)
 */
export function getNativeModule(): NativeQMDB {
  if (_nativeModule) return _nativeModule;

  try {
    // Nitro Modules — works in bare RN and Expo
    const { NitroModules } = require("react-native-nitro-modules");
    const hybridObject = NitroModules.createHybridObject("QMDB");

    // Wrap the Nitro HybridObject to match our NativeQMDB interface.
    // The HybridObject returns JSON strings from C++; we parse them here.
    _nativeModule = createNitroAdapter(hybridObject);
  } catch {
    try {
      // Legacy fallback: TurboModules / Expo modules
      const { NativeModules } = require("react-native");
      _nativeModule = NativeModules.QMDB as NativeQMDB;
    } catch {
      throw new Error(
        "react-native-qmdb: Native module not found. " +
          "Ensure react-native-nitro-modules is installed and the app is rebuilt."
      );
    }
  }

  if (!_nativeModule) {
    throw new Error(
      "react-native-qmdb: Native module is null. " +
        "Did you rebuild the native app after installing?"
    );
  }

  return _nativeModule;
}

/**
 * Adapt the Nitro HybridObject (which returns JSON strings) to the NativeQMDB interface.
 * The C++ layer returns JSON strings from Rust; we parse them into typed objects.
 */
function createNitroAdapter(hybrid: any): NativeQMDB {
  function parseJson(json: string): any {
    const result = JSON.parse(json);
    if (result?.error) {
      throw new Error(result.message || "QMDB native error");
    }
    return result;
  }

  return {
    async open(config) {
      const json = hybrid.open(JSON.stringify(config));
      return parseJson(json);
    },
    async close(path) {
      parseJson(hybrid.close(path));
    },
    async destroy(path) {
      parseJson(hybrid.destroy(path));
    },
    async info(path) {
      return parseJson(hybrid.info(path));
    },
    async get(path, key) {
      const result = parseJson(hybrid.get(path, key));
      return result.value ?? null;
    },
    async update(path, key, value) {
      const result = parseJson(hybrid.update(path, key, value));
      return result.location;
    },
    async delete(path, key) {
      parseJson(hybrid.remove(path, key));
    },
    async batchUpdate(path, entries) {
      const result = parseJson(
        hybrid.batchUpdate(path, JSON.stringify(entries))
      );
      return result.locations;
    },
    async commit(path) {
      return parseJson(hybrid.commit(path));
    },
    async merkleize(path) {
      return parseJson(hybrid.merkleize(path));
    },
    async intoMutable(path) {
      return parseJson(hybrid.intoMutable(path));
    },
    async prove(path, key) {
      return parseJson(hybrid.prove(path, key));
    },
    async rangeProof(path, start, end) {
      return parseJson(hybrid.rangeProof(path, start, end));
    },
    async verify(proof, root) {
      return parseJson(hybrid.verify(JSON.stringify(proof), root));
    },
    async operationsSince(path, since, limit) {
      return parseJson(hybrid.operationsSince(path, since, limit));
    },
    async applyOperations(path, operations) {
      const json = hybrid.applyOperations(path, JSON.stringify(operations));
      return parseJson(json);
    },
  };
}

/**
 * Replace the native module (for testing).
 * @internal
 */
export function setNativeModule(mock: NativeQMDB): void {
  _nativeModule = mock;
}

/**
 * Reset the native module to null (for test cleanup).
 * @internal
 */
export function resetNativeModule(): void {
  _nativeModule = null;
}
