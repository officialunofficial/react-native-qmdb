/**
 * Native module resolution — loads the platform-specific Rust FFI bridge.
 *
 * In React Native, this resolves to the TurboModule/Expo native module.
 * In tests, this is replaced by the mock via setup.ts.
 */

import type { NativeQMDB } from "../types";

let _nativeModule: NativeQMDB | null = null;

/**
 * Get the native QMDB module. Throws if not available (e.g., running in
 * a non-RN environment without a mock).
 */
export function getNativeModule(): NativeQMDB {
  if (_nativeModule) return _nativeModule;

  try {
    // Expo modules
    const mod = require("expo-modules-core");
    _nativeModule = mod.requireNativeModule("QMDB") as NativeQMDB;
  } catch {
    try {
      // TurboModules fallback
      const { NativeModules } = require("react-native");
      _nativeModule = NativeModules.QMDB as NativeQMDB;
    } catch {
      throw new Error(
        "react-native-qmdb: Native module not found. " +
          "Ensure the library is properly linked and rebuilt."
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
