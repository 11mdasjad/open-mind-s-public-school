import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";

const url =
  process.env.DATABASE_URL ||
  "postgresql://fallback:fallback@127.0.0.1:5432/fallback";

const parsed = new URL(url);
const certificate = parsed.searchParams.get("sslrootcert");
if (certificate) {
  for (const key of ["sslrootcert", "sslcert", "sslaccept", "sslmode"])
    parsed.searchParams.delete(key);
}

export const db = certificate ? new PrismaClient({
  adapter: new PrismaPg({
    connectionString: parsed.toString(),
    ssl: { ca: readFileSync(certificate, "utf8"), rejectUnauthorized: true },
    max: Number(parsed.searchParams.get("connection_limit") || 5),
    connectionTimeoutMillis: 20000,
  }, { schema: parsed.searchParams.get("schema") || "public" }),
}) : new PrismaClient({
  datasources: {
    db: {
      url,
    },
  },
});
