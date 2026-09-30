// Copies the running local Supabase URL/keys into .env.local (keys can change on each `supabase start`).
// Usage: npm run env:local
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const status = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8" })
    .split("\n")
    .map((l) => l.match(/^(\w+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const want = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};
if (Object.values(want).some((v) => !v)) throw new Error("Local Supabase is not running (npx supabase start).");

const file = ".env.local";
let env = existsSync(file) ? readFileSync(file, "utf8") : readFileSync(".env.example", "utf8");
for (const [k, v] of Object.entries(want)) {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
}
writeFileSync(file, env);
console.log("Updated .env.local with local Supabase URL and keys. Restart `npm run dev`.");
