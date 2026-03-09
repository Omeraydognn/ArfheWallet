/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

// ─── Buffer polyfill fix for ethers.js ─────────────────────────
// In jsdom/vitest, the `buffer` npm polyfill replaces globalThis.Buffer
// which causes ethers.js sha256 to fail (expects Uint8Array, gets Buffer).
// Fix: ensure globalThis.Buffer is the native Node.js Buffer.
import { Buffer as NodeBuffer } from 'node:buffer';
globalThis.Buffer = NodeBuffer;

// ─── Chrome Extension API Mock ─────────────────────────────────
// Mock chrome.storage for tests that use StorageManager
const chromeStorageMock = {
  local: {
    _store: {} as Record<string, any>,
    get: vi.fn((keys: string[], callback: (result: Record<string, any>) => void) => {
      const result: Record<string, any> = {};
      for (const key of keys) {
        if (key in chromeStorageMock.local._store) {
          result[key] = chromeStorageMock.local._store[key];
        }
      }
      callback(result);
    }),
    set: vi.fn((items: Record<string, any>, callback?: () => void) => {
      Object.assign(chromeStorageMock.local._store, items);
      callback?.();
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      const keyArr = Array.isArray(keys) ? keys : [keys];
      for (const key of keyArr) {
        delete chromeStorageMock.local._store[key];
      }
      callback?.();
    }),
  },
  session: {
    _store: {} as Record<string, any>,
    get: vi.fn((keys: string[], callback: (result: Record<string, any>) => void) => {
      const result: Record<string, any> = {};
      for (const key of keys) {
        if (key in chromeStorageMock.session._store) {
          result[key] = chromeStorageMock.session._store[key];
        }
      }
      callback(result);
    }),
    set: vi.fn((items: Record<string, any>, callback?: () => void) => {
      Object.assign(chromeStorageMock.session._store, items);
      callback?.();
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      const keyArr = Array.isArray(keys) ? keys : [keys];
      for (const key of keyArr) {
        delete chromeStorageMock.session._store[key];
      }
      callback?.();
    }),
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Chrome runtime mock for test environment
(globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
  storage: chromeStorageMock,
  runtime: {
    id: 'test-extension-id',
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
  },
};

// ─── Reset mocks between tests ─────────────────────────────────
beforeEach(() => {
  chromeStorageMock.local._store = {};
  chromeStorageMock.session._store = {};
});

// ─── Web Crypto polyfill (jsdom has limited support) ────────────
// jsdom now ships with a functional crypto.subtle, but if needed:
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
