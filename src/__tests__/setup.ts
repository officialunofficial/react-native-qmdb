/**
 * Vitest global setup — install the mock native module before all tests.
 */

import { beforeEach } from "vitest";
import { createMockNativeQMDB, resetMockInstances } from "../native/mock";
import { setNativeModule, resetNativeModule } from "../native/module";

const mockModule = createMockNativeQMDB();
setNativeModule(mockModule);

beforeEach(() => {
  resetMockInstances();
});

afterAll(() => {
  resetNativeModule();
});
