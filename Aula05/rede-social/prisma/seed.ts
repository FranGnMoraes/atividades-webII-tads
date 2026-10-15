import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from '../src/auth/passwords.js';
import { UPLOAD_DIR } from '../src/uploads/localStorage.js';

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Senha de demonstração para os 3 usuários semeados — usem "senha123" para
// testar login em qualquer um deles (ver Aula05/rede-social/README.md).
const DEMO_PASSWORD = 'senha123';

// Trabalho II: fotos de exemplo para o carrossel. São SVGs simples gravados
// em `uploads/` (a mesma pasta da LocalImageStorage), então funcionam sem
// internet e sem AWS.
async function createDemoImage(name: string, color: string, label: string): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <rect width="100%" height="100%" fill="${color}"/>
  <text x="50%" y="50%" font-family="sans-serif" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;
  await writeFile(path.join(UPLOAD_DIR, `${name}.svg`), svg);
  return `/uploads/${name}.svg`;
}

async function main() {
  // Trabalho II: as tabelas novas são limpas primeiro.
  await prisma.commentLike.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.postImage.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const [ana, bruno, carla] = await Promise.all([
    prisma.user.create({ data: { name: 'Ana', email: 'ana@exemplo.com', passwordHash } }),
    prisma.user.create({ data: { name: 'Bruno', email: 'bruno@exemplo.com', passwordHash } }),
    prisma.user.create({ data: { name: 'Carla', email: 'carla@exemplo.com', passwordHash } }),
  ]);

  // Autorrelação N:N: Ana e Carla seguem Bruno.
  await prisma.follow.createMany({
    data: [
      { followerId: ana.id, followingId: bruno.id },
      { followerId: carla.id, followingId: bruno.id },
      { followerId: ana.id, followingId: carla.id },
    ],
  });

  // 1:N (autor) + N:N (tags) numa escrita só.
  await prisma.post.create({
    data: {
      content: 'Primeiro post usando Prisma!',
      author: { connect: { id: bruno.id } },
      tags: { connectOrCreate: [{ where: { name: 'prisma' }, create: { name: 'prisma' } }] },
    },
  });

  await prisma.post.create({
    data: {
      content: 'Modelando relações: 1:N, N:N e autorrelação.',
      author: { connect: { id: bruno.id } },
      tags: {
        connectOrCreate: [
          { where: { name: 'prisma' }, create: { name: 'prisma' } },
          { where: { name: 'orm' }, create: { name: 'orm' } },
        ],
      },
    },
  });

  await prisma.post.create({
    data: {
      content: 'ORM não é mágica, é só uma camada.',
      author: { connect: { id: carla.id } },
      tags: { connectOrCreate: [{ where: { name: 'orm' }, create: { name: 'orm' } }] },
    },
  });

  // Trabalho II — dados para demonstrar curtidas, comentários, carrossel e
  // scroll infinito (a Ana segue Bruno e Carla, então vê 20+ posts e o feed
  // carrega em páginas de 10).
  // Primeiro os posts "antigos" (só texto), para os com foto ficarem no topo.
  for (let i = 1; i <= 20; i++) {
    await prisma.post.create({
      data: {
        content: `Post de exemplo nº ${i} — role a página para o scroll infinito carregar mais.`,
        author: { connect: { id: i % 2 === 0 ? bruno.id : carla.id } },
      },
    });
  }

  const praia = await createDemoImage('seed-praia', '#0e7490', 'Praia — foto 1');
  const praia2 = await createDemoImage('seed-praia-2', '#0369a1', 'Praia — foto 2');
  const praia3 = await createDemoImage('seed-praia-3', '#1d4ed8', 'Praia — foto 3');
  const cafe = await createDemoImage('seed-cafe', '#92400e', 'Café da manhã');

  const comFotos = await prisma.post.create({
    data: {
      content: 'Fim de semana na praia! (post com 3 fotos = carrossel)',
      author: { connect: { id: carla.id } },
      images: { create: [praia, praia2, praia3].map((url, order) => ({ url, order })) },
    },
  });
  await prisma.post.create({
    data: {
      content: 'Café antes da aula de Web II. (post com 1 foto)',
      author: { connect: { id: bruno.id } },
      images: { create: [{ url: cafe, order: 0 }] },
    },
  });

  await prisma.like.createMany({
    data: [
      { userId: ana.id, postId: comFotos.id },
      { userId: bruno.id, postId: comFotos.id },
    ],
  });
  const comentario = await prisma.comment.create({
    data: { content: 'Que lugar lindo!', authorId: bruno.id, postId: comFotos.id },
  });
  await prisma.comment.create({
    data: { content: 'Quero ir junto da próxima vez.', authorId: ana.id, postId: comFotos.id },
  });
  await prisma.commentLike.create({ data: { userId: carla.id, commentId: comentario.id } });

  console.log(
    `Seed concluído: 3 usuários, 25 posts (1 com 3 fotos, 1 com 1 foto), 2 tags, 3 follows, curtidas e comentários. Senha de todos: "${DEMO_PASSWORD}".`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
