import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.image.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();

  const [ana, bruno, carla] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Ana',
        email: 'ana@exemplo.com',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
        profile: {
          create: {
            bio: 'Desenvolvedora Fullstack e entusiasta de TypeScript.',
            location: 'São Paulo, SP',
            website: 'https://ana.dev',
            birthDate: new Date('1995-05-15'),
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        name: 'Bruno',
        email: 'bruno@exemplo.com',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
        profile: {
          create: {
            bio: 'Engenheiro de Software focado em Node.js e Bancos de Dados.',
            location: 'Rio de Janeiro, RJ',
            website: 'https://bruno.tech',
            birthDate: new Date('1992-08-20'),
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        name: 'Carla',
        email: 'carla@exemplo.com',
        avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956',
        profile: {
          create: {
            bio: 'Arquiteta de Soluções e apaixonada por modelagem de dados.',
            location: 'Belo Horizonte, MG',
            website: 'https://carla.io',
            birthDate: new Date('1990-11-10'),
          },
        },
      },
    }),
  ]);

  // Autorrelação N:N: Ana e Carla seguem Bruno.
  await prisma.follow.createMany({
    data: [
      { followerId: ana.id, followingId: bruno.id },
      { followerId: carla.id, followingId: bruno.id },
      { followerId: ana.id, followingId: carla.id },
    ],
  });

  // 1:N (autor) + N:N (tags) + 1:N (images)
  const post1 = await prisma.post.create({
    data: {
      content: 'Primeiro post usando Prisma com suporte a imagens!',
      author: { connect: { id: bruno.id } },
      tags: { connectOrCreate: [{ where: { name: 'prisma' }, create: { name: 'prisma' } }] },
      images: {
        create: [
          { url: 'https://picsum.photos/800/600?random=1', altText: 'Diagrama Prisma ORM' },
          { url: 'https://picsum.photos/800/600?random=2', altText: 'Código do Schema' },
        ],
      },
    },
  });

  const post2 = await prisma.post.create({
    data: {
      content: 'Modelando relações: 1:N, N:N e autorrelação.',
      author: { connect: { id: bruno.id } },
      tags: {
        connectOrCreate: [
          { where: { name: 'prisma' }, create: { name: 'prisma' } },
          { where: { name: 'orm' }, create: { name: 'orm' } },
        ],
      },
      images: {
        create: [
          { url: 'https://picsum.photos/800/600?random=3', altText: 'Relacionamentos em bancos relacionais' },
        ],
      },
    },
  });

  const post3 = await prisma.post.create({
    data: {
      content: 'ORM não é mágica, é só uma camada.',
      author: { connect: { id: carla.id } },
      tags: { connectOrCreate: [{ where: { name: 'orm' }, create: { name: 'orm' } }] },
    },
  });

  // Comentários (1:N Post, 1:N User)
  await prisma.comment.createMany({
    data: [
      { content: 'Excelente explicação, Bruno!', postId: post1.id, authorId: ana.id },
      { content: 'Gostei muito das imagens no post!', postId: post1.id, authorId: carla.id },
      { content: 'Concordo totalmente com isso.', postId: post3.id, authorId: bruno.id },
      { content: 'Muito bom ver o Prisma em ação.', postId: post2.id, authorId: ana.id },
    ],
  });

  // Curtidas / Likes (N:N User <-> Post)
  await prisma.like.createMany({
    data: [
      { userId: ana.id, postId: post1.id },
      { userId: carla.id, postId: post1.id },
      { userId: ana.id, postId: post2.id },
      { userId: bruno.id, postId: post3.id },
    ],
  });

  console.log('Seed concluído com sucesso: Usuários, Perfis, Follows, Posts, Tags, Imagens, Comentários e Likes!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

