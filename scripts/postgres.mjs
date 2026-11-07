import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
mkdirSync("data", { recursive: true });
const configPath = path.resolve("data/postgres-local.json");
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, "utf8"))
  : { password: randomBytes(24).toString("hex"), port: 55432 };
if (!existsSync(configPath))
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
const databaseDir = path.resolve("data/postgres");
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "school",
  password: config.password,
  port: config.port,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1", "-k", path.resolve("data")],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='openmind'",
);
if (!result.rowCount) await pg.createDatabase("openmind");
await client.end();
const url = `postgresql://school:${config.password}@127.0.0.1:${config.port}/openmind`;
let env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
if (!env.includes("DATABASE_URL=") || /DATABASE_URL="?file:/.test(env)) {
  env = env.replace(/^DATABASE_URL=.*\n?/m, "");
  writeFileSync(
    ".env",
    `DATABASE_URL="${url}"\n${env || "PORT=3001\nAPP_ORIGIN=http://127.0.0.1:5173\n"}`,
    { mode: 0o600 },
  );
}
console.log(
  `Project-local PostgreSQL is ready on 127.0.0.1:${config.port}. Data is persisted in data/postgres. Keep this process running.`,
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
