import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";
mkdirSync("data", { recursive: true });
const file = path.resolve(`data/test-${process.pid}.db`);
writeFileSync(file, "");
const postgres = process.env.DATABASE_URL?.startsWith("postgresql:");
const schema = `test_${process.pid}`;
const url = postgres ? new URL(process.env.DATABASE_URL) : null;
if (url) url.searchParams.set("schema", schema);
const env = {
  ...process.env,
  DATABASE_URL: url?.toString() || `file:${file}`,
  NODE_ENV: "test",
};
try {
  execFileSync(
    "npx",
    [
      "prisma",
      "db",
      "push",
      "--schema",
      postgres ? "prisma/schema.prisma" : "prisma/local.prisma",
      "--skip-generate",
    ],
    { env, stdio: "inherit" },
  );
  execFileSync("npx", ["tsx", "--test", "tests/workflows.test.ts"], {
    env,
    stdio: "inherit",
  });
} finally {
  try {
    unlinkSync(file);
  } catch {}
  if (postgres) {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}
