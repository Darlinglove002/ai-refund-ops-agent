import "server-only";

// Re-exported with the server-only guard so accidentally importing this
// from a Client Component fails loudly at build time. Non-Next scripts
// (evals/run.ts) import ./serviceClient directly instead.
export { createServiceClient } from "./serviceClient";
