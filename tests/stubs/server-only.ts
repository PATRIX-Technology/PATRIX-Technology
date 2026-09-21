// Test-only stub for the `server-only` package. In real builds Next.js
// resolves `server-only` to a module that throws if pulled into a Client
// Component bundle. Vitest runs in plain Node, so we swap in a no-op via
// vitest.config.ts's resolve.alias instead of fighting module conditions.
export {};
