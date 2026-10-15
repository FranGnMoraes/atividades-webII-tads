import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { TEST_DATABASE_URL } from '../globalSetup.js';

export function createTestPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: TEST_DATABASE_URL });
  return new PrismaClient({ adapter });
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  // Trabalho II: tabelas novas primeiro (elas apontam para Post/User/Comment).
  await prisma.commentLike.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.postImage.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
}
