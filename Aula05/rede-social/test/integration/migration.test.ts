import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

// Trabalho II — prova de que a migration NÃO perde as fotos antigas.
//
// Monta um banco em memória só com a migration inicial (o "banco em
// produção", com a coluna Post.imageUrl preenchida), insere posts com e sem
// foto e então roda a migration do Trabalho II por cima — exatamente o que o
// `prisma migrate deploy` faria num banco que já tem dados.
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '..', '..', 'prisma', 'migrations');

function migrationSql(nameContains: string): string {
  const folder = readdirSync(MIGRATIONS_DIR).find((name) => name.includes(nameContains));
  if (!folder) {
    throw new Error(`migration "${nameContains}" não encontrada`);
  }
  return readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8');
}

describe('migration Post.imageUrl → PostImage (data migration)', () => {
  it('cada post que tinha imageUrl continua com a mesma foto, na posição 0', () => {
    const db = new Database(':memory:');
    db.exec(migrationSql('_init'));

    db.exec(`
      INSERT INTO "User" ("id", "name", "email", "passwordHash") VALUES (1, 'Ana', 'ana@exemplo.com', 'hash');
      INSERT INTO "Post" ("id", "content", "imageUrl", "authorId") VALUES
        (1, 'Com foto', '/uploads/foto-antiga.png', 1),
        (2, 'Sem foto', NULL, 1);
    `);

    db.exec(migrationSql('trabalho2'));

    const images = db.prepare('SELECT "url", "order", "postId" FROM "PostImage" ORDER BY "postId"').all();
    expect(images).toEqual([{ url: '/uploads/foto-antiga.png', order: 0, postId: 1 }]);

    const posts = db.prepare('SELECT "id", "content" FROM "Post" ORDER BY "id"').all();
    expect(posts).toEqual([
      { id: 1, content: 'Com foto' },
      { id: 2, content: 'Sem foto' },
    ]);

    const postColumns = db.prepare('PRAGMA table_info("Post")').all() as { name: string }[];
    expect(postColumns.map((column) => column.name)).not.toContain('imageUrl');

    db.close();
  });
});
