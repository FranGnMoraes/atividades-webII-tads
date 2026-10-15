import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// "As setas apontam para dentro" — conferido automaticamente.
// Lê os imports de cada arquivo de domínio e de aplicação e falha se algum
// deles depender de infraestrutura ou de uma camada de fora.
const SRC = path.resolve(import.meta.dirname, '..', '..', 'src');

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesIn(full) : [full];
  });
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

const FORBIDDEN = [/^express/, /^@prisma\//, /^nodemailer/, /^better-sqlite3/, /^dotenv/, /(^|\/)adapters\//, /(^|\/)channels\//, /(^|\/)main\//];

describe('direção das dependências', () => {
  it.each(['domain', 'application'])('src/%s não importa infraestrutura nem camadas de fora', (layer) => {
    const violations = filesIn(path.join(SRC, layer)).flatMap((file) =>
      importsOf(file)
        .filter((imported) => FORBIDDEN.some((pattern) => pattern.test(imported)))
        .map((imported) => `${path.relative(SRC, file)} → ${imported}`),
    );

    expect(violations).toEqual([]);
  });

  it('o domínio não importa nem a camada de aplicação', () => {
    const violations = filesIn(path.join(SRC, 'domain')).flatMap((file) =>
      importsOf(file).filter((imported) => imported.includes('application/')),
    );

    expect(violations).toEqual([]);
  });

  it('só o composition root lê process.env', () => {
    const readers = filesIn(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('process.env'))
      .map((file) => path.relative(SRC, file));

    expect(readers).toEqual([path.join('main', 'compositionRoot.ts')]);
  });

  it('o Prisma Client só aparece nos adaptadores Prisma', () => {
    const users = filesIn(SRC)
      .filter((file) => importsOf(file).some((imported) => imported.startsWith('@prisma/')))
      .map((file) => path.relative(SRC, file).split(path.sep).slice(0, 2).join('/'));

    expect(new Set(users)).toEqual(new Set(['adapters/prisma']));
  });
});
