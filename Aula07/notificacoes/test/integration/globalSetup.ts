import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// Banco SQLite só dos testes de integração dos adaptadores Prisma.
export const TEST_DB_URL = `file:${path.resolve(import.meta.dirname, '..', '..', 'test.db')}`;

export default function setup(): void {
  const dbPath = TEST_DB_URL.replace('file:', '');
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '..', '..'),
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });
}
