import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
mkdirSync("data", { recursive: true });
const schema = readFileSync("prisma/schema.prisma", "utf8").replace(
  'provider = "postgresql"',
  'provider = "sqlite"',
);
writeFileSync("prisma/local.prisma", schema);
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    'DATABASE_URL="file:../data/school.db"\nPORT=3001\nAPP_ORIGIN=http://127.0.0.1:5173\n',
  );
if (!existsSync("data/school.db")) writeFileSync("data/school.db", "");
for (const args of [["generate"], ["db", "push"]])
  execFileSync("npx", ["prisma", ...args, "--schema", "prisma/local.prisma"], {
    stdio: "inherit",
  });
