import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const parsedUrl = new URL(connectionString);
  const schema =
    process.env.SCHEDULE_DB_SCHEMA?.trim() ||
    parsedUrl.searchParams.get("schema")?.trim() ||
    undefined;

  // `schema` is a Prisma URL extension, not a native node-postgres option.
  // Remove it from the pg connection string and pass it to PrismaPg explicitly.
  parsedUrl.searchParams.delete("schema");

  const connection = { connectionString: parsedUrl.toString() };
  const adapter = schema
    ? new PrismaPg(connection, { schema })
    : new PrismaPg(connection);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
