import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/server.js';
import { createTestPrismaClient, resetDatabase } from '../helpers/testDb.js';
import { FakeImageStorage } from '../helpers/fakeImageStorage.js';
import { registerAndLogin } from '../helpers/auth.js';

const prisma: PrismaClient = createTestPrismaClient();
let imageStorage: FakeImageStorage;
let app: ReturnType<typeof createServer>;

beforeEach(async () => {
  await resetDatabase(prisma);
  imageStorage = new FakeImageStorage();
  app = createServer(prisma, imageStorage);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Ana segue Bruno; Bruno publica `count` posts ("Post 1", "Post 2", ...).
async function anaFollowsBrunoWithPosts(count: number) {
  const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
  const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
  await prisma.follow.create({ data: { followerId: ana.userId, followingId: bruno.userId } });
  for (let i = 1; i <= count; i++) {
    await prisma.post.create({ data: { content: `Post ${i}`, authorId: bruno.userId } });
  }
  return { ana, bruno };
}

function contentsIn(html: string): string[] {
  return [...html.matchAll(/Post \d+/g)].map((match) => match[0]);
}

describe('POST /posts com várias fotos (upload.array)', () => {
  it('cada arquivo passa pela ImageStorage e vira um PostImage, na ordem enviada', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    const res = await agent
      .post('/posts')
      .field('content', 'Viagem')
      .attach('images', Buffer.from('1'), { filename: 'a.png', contentType: 'image/png' })
      .attach('images', Buffer.from('2'), { filename: 'b.jpg', contentType: 'image/jpeg' })
      .attach('images', Buffer.from('3'), { filename: 'c.webp', contentType: 'image/webp' });

    expect(res.status).toBe(302);
    expect(imageStorage.uploads.map((file) => file.originalname)).toEqual(['a.png', 'b.jpg', 'c.webp']);

    const post = await prisma.post.findFirstOrThrow({
      where: { content: 'Viagem' },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    expect(post.images.map((image) => [image.order, image.url])).toEqual([
      [0, 'https://fake-bucket.test/a.png'],
      [1, 'https://fake-bucket.test/b.jpg'],
      [2, 'https://fake-bucket.test/c.webp'],
    ]);
  });

  it('post sem foto continua funcionando (0 PostImage)', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    await agent.post('/posts').type('form').send({ content: 'Só texto' });

    const post = await prisma.post.findFirstOrThrow({ where: { content: 'Só texto' }, include: { images: true } });
    expect(post.images).toHaveLength(0);
  });

  it('mais de 5 fotos: 400 (limite do upload.array) e nada é enviado ao storage', async () => {
    const { agent } = await registerAndLogin(app, prisma, 'ana@exemplo.com');

    let req = agent.post('/posts').field('content', 'Fotos demais');
    for (let i = 1; i <= 6; i++) {
      req = req.attach('images', Buffer.from(String(i)), { filename: `${i}.png`, contentType: 'image/png' });
    }
    const res = await req;

    expect(res.status).toBe(400);
    expect(imageStorage.uploads).toHaveLength(0);
    await expect(prisma.post.count()).resolves.toBe(0);
  });
});

describe('GET / (feed com contagens, likedByMe e carrossel)', () => {
  it('mostra contagens reais, o coração pintado e o carrossel quando há 2+ fotos', async () => {
    const { ana, bruno } = await anaFollowsBrunoWithPosts(0);
    const post = await prisma.post.create({
      data: {
        content: 'Post com 2 fotos',
        authorId: bruno.userId,
        images: { create: [{ url: '/uploads/1.png', order: 0 }, { url: '/uploads/2.png', order: 1 }] },
      },
    });
    await prisma.like.create({ data: { userId: ana.userId, postId: post.id } });
    await prisma.comment.create({ data: { content: 'Oi', authorId: bruno.userId, postId: post.id } });

    const res = await ana.agent.get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('data-carousel');
    expect(res.text).toContain('data-liked="true"');
    expect(res.text).toMatch(/data-like-count>1</);
    expect(res.text).toMatch(/data-comment-count>1</);
  });

  it('com 1 foto não mostra carrossel (igual ao comportamento antigo)', async () => {
    const { ana, bruno } = await anaFollowsBrunoWithPosts(0);
    await prisma.post.create({
      data: { content: 'Uma foto', authorId: bruno.userId, images: { create: [{ url: '/uploads/1.png', order: 0 }] } },
    });

    const res = await ana.agent.get('/');

    expect(res.text).toContain('/uploads/1.png');
    expect(res.text).not.toContain('data-carousel');
  });

  it('renderiza só a 1ª página (10 posts) e deixa o cursor para o scroll infinito', async () => {
    const { ana } = await anaFollowsBrunoWithPosts(12);

    const res = await ana.agent.get('/');

    expect(contentsIn(res.text)).toHaveLength(10);
    expect(res.text).toContain('Post 12'); // o mais novo primeiro
    expect(res.text).not.toContain('Post 2<');
    expect(res.text).toMatch(/data-next-cursor="\d+"/);
  });
});

describe('GET /api/feed (scroll infinito por cursor)', () => {
  it('pagina pelo cursor até acabar (nextCursor null)', async () => {
    const { ana } = await anaFollowsBrunoWithPosts(15);

    const first = await ana.agent.get('/api/feed?limit=10').set('Accept', 'application/json');
    expect(first.status).toBe(200);
    expect(first.body.count).toBe(10);
    expect(contentsIn(first.body.html)[0]).toBe('Post 15');
    expect(first.body.nextCursor).toEqual(expect.any(Number));

    const second = await ana.agent
      .get(`/api/feed?cursor=${first.body.nextCursor}&limit=10`)
      .set('Accept', 'application/json');
    expect(second.body.count).toBe(5);
    expect(contentsIn(second.body.html)).toEqual(['Post 5', 'Post 4', 'Post 3', 'Post 2', 'Post 1']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('o HTML devolvido é o mesmo cartão do feed (com os botões de curtir/comentar)', async () => {
    const { ana } = await anaFollowsBrunoWithPosts(1);

    const res = await ana.agent.get('/api/feed').set('Accept', 'application/json');

    expect(res.body.html).toContain('data-like-form');
    expect(res.body.html).toContain('data-action="toggle-comments"');
  });

  it('limit inválido: 400', async () => {
    const { ana } = await anaFollowsBrunoWithPosts(1);

    const tooBig = await ana.agent.get('/api/feed?limit=500').set('Accept', 'application/json');
    const notNumber = await ana.agent.get('/api/feed?cursor=abc').set('Accept', 'application/json');

    expect(tooBig.status).toBe(400);
    expect(notNumber.status).toBe(400);
  });

  it('sem login: 401', async () => {
    const res = await request(app).get('/api/feed').set('Accept', 'application/json');

    expect(res.status).toBe(401);
  });
});

describe('GET /posts/:id (página do post)', () => {
  it('renderiza o post com os comentários abertos', async () => {
    const { ana, bruno } = await anaFollowsBrunoWithPosts(0);
    const post = await prisma.post.create({ data: { content: 'Página do post', authorId: bruno.userId } });

    const res = await ana.agent.get(`/posts/${post.id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Página do post');
    expect(res.text).toContain('data-autoload');
  });

  it('post inexistente: 404', async () => {
    const { ana } = await anaFollowsBrunoWithPosts(0);

    const res = await ana.agent.get('/posts/999');

    expect(res.status).toBe(404);
  });
});

describe('notificação simples desde o último acesso (extra 10)', () => {
  it('conta curtidas e comentários novos nos meus posts e zera depois de ver', async () => {
    const { ana, bruno } = await anaFollowsBrunoWithPosts(0);
    const post = await prisma.post.create({ data: { content: 'Post da Ana', authorId: ana.userId } });

    await ana.agent.get('/'); // 1º acesso: marca lastSeenAt
    await bruno.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    await bruno.agent.post(`/posts/${post.id}/comments`).set('Accept', 'application/json').send({ content: 'Oi!' });
    // A própria Ana curtindo o próprio post não conta como novidade.
    await ana.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');

    const withNews = await ana.agent.get('/');
    expect(withNews.text).toContain('data-notifications');
    expect(withNews.text).toMatch(/<strong>1<\/strong> nova curtida/);
    expect(withNews.text).toMatch(/<strong>1<\/strong> novo comentário/);

    const afterSeeing = await ana.agent.get('/');
    expect(afterSeeing.text).not.toContain('data-notifications');
  });
});

describe('arquivos estáticos do cliente', () => {
  it('serve o JavaScript do feed em /static/app.js', async () => {
    const res = await request(app).get('/static/app.js');

    expect(res.status).toBe(200);
    expect(res.text).toContain('IntersectionObserver');
  });
});
