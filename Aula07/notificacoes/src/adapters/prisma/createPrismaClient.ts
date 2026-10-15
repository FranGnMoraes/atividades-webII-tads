import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// Cria o Prisma Client para um banco SQLite. Recebe a URL pronta: quem lê
// DATABASE_URL do ambiente é só o composition root.
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
}
