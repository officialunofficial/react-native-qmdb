// Context
export { QMDBProvider, useQMDBContext } from "./context";
export type { QMDBContextValue, QMDBProviderProps } from "./context";

// Hooks
export { useQMDB, useProof, useSync } from "./hooks";
export type { UseQMDBReturn, UseProofReturn, SyncStatus, UseSyncReturn } from "./hooks";

// Types
export type {
  Bounds,
  DatabaseConfig,
  DatabaseInfo,
  DatabaseState,
  Digest,
  Key,
  Location,
  NativeQMDB,
  Operation,
  Proof,
  Value,
  VerifyResult,
} from "./types";

// Utilities
export { digestsEqual, isValidDigest, toHex, fromHex, stringToHex, hexToString } from "./utils";

// Native module (for advanced use / testing)
export { createMockNativeQMDB, setNativeModule, resetNativeModule } from "./native";
