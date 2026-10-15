import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// Banco SQLite só da suíte de contrato, recriado do zero a cada execução.
export default function setup(): void {
  const root = path.resolve(import.meta.dirname, '..', '..');
  const dbPath = path.join(root, 'contract.db');
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  execSync('npx prisma migrate deploy', {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  });
}
