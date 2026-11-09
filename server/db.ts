import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url =
  process.env.DATABASE_URL ||
  "postgresql://fallback:fallback@127.0.0.1:5432/fallback";

export const db = new PrismaClient({
  datasources: {
    db: {
      url,
    },
  },
});
