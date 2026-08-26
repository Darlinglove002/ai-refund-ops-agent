// One-command local setup: starts the local Supabase stack (Postgres +
// API, via Docker) — which applies supabase/migrations and supabase/
// seed.sql automatically — then writes the resulting local URL/keys into
// .env.local. Requires Docker Desktop running; everything else is
// downloaded and configured by the Supabase CLI itself.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env.local");
const envExamplePath = path.join(root, ".env.example");

function run(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" });
}

console.log("Starting local Supabase stack (this pulls Docker images on first run — can take a few minutes)...\n");
try {
  console.log(run("npx --yes supabase start"));
} catch (err) {
  console.error("\nFailed to start Supabase locally. Is Docker Desktop installed and running?");
  console.error(err.message);
  process.exit(1);
}

const statusOutput = run("npx --yes supabase status -o json");
const jsonStart = statusOutput.indexOf("{");
const status = JSON.parse(statusOutput.slice(jsonStart));

const existingEnv = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
  : existsSync(envExamplePath)
    ? readFileSync(envExamplePath, "utf8")
    : "";

// Prefers an existing .env.local value (so a saved key survives re-running
// this script), then falls back to the current process environment — e.g.
// a GitHub Actions secret exported as ANTHROPIC_API_KEY, so CI can run
// this exact same setup path instead of a parallel one nobody's testing.
function getExisting(key) {
  const match = existingEnv.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (match && match[1].trim()) return match[1].trim();
  return process.env[key] ?? "";
}

const anthropicKey = getExisting("ANTHROPIC_API_KEY");

const content = `# Written by scripts/setup-local.mjs — points at the local Supabase stack.
# Re-run \`npm run setup\` any time to refresh these (e.g. after \`supabase stop\`).
NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}

# Not provided by Supabase — get one from console.anthropic.com
ANTHROPIC_API_KEY=${anthropicKey}
`;

writeFileSync(envPath, content);

console.log(`\n.env.local written, pointing at the local stack (${status.API_URL}).`);
console.log(`Supabase Studio (a local DB/table browser): ${status.STUDIO_URL}`);
if (!anthropicKey) {
  console.log("\nStill needed: add your ANTHROPIC_API_KEY to .env.local before running the agent.");
}
console.log("\nRun `npm run dev` to start the app.");
