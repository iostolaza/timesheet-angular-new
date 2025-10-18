// src/polyfills.ts
import 'zone.js';  // Angular defaults

// Amplify v6 shims (required for global/process in ESM)
(window as any).global = window;
globalThis.Buffer = globalThis.Buffer || (typeof Buffer !== 'undefined' ? Buffer : undefined);
(window as any).process = { env: { DEBUG: undefined }, version: '' };