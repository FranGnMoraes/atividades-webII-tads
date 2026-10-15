import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/server.js';
import { createTestPrismaClient, resetDatabase } from '../helpers/testDb.js';
import { FakeImageStorage } from '../helpers/fakeImageStorage.js';
import { registerAndLogin } from '../helpers/auth.js';

const prisma: PrismaClient = createTestPrismaClient();
const app = createServer(prisma, new FakeImageStorage());

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createPost(authorId: number, content = 'Post de teste') {
  return prisma.post.create({ data: { content, authorId } });
}

describe('POST /posts/:id/like (curtida em post, alterna)', () => {
  it('curte e devolve a contagem atualizada em JSON (fetch)', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await ana.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: true, likeCount: 1 });
  });

  it('curtir de novo DESCURTE (não duplica)', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    await ana.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const res = await ana.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');

    expect(res.body).toEqual({ liked: false, likeCount: 0 });
    await expect(prisma.like.count()).resolves.toBe(0);
  });

  it('conta as curtidas de pessoas diferentes', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);

    await ana.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');
    const res = await bruno.agent.post(`/posts/${post.id}/like`).set('Accept', 'application/json');

    expect(res.body).toEqual({ liked: true, likeCount: 2 });
  });

  it('o userId vem da SESSÃO, mesmo que o corpo mande outro', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);

    await bruno.agent
      .post(`/posts/${post.id}/like`)
      .set('Accept', 'application/json')
      .send({ userId: ana.userId });

    const like = await prisma.like.findFirstOrThrow();
    expect(like.userId).toBe(bruno.userId);
  });

  it('sem login via fetch: 401 em JSON (e nada é gravado)', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await request(app).post(`/posts/${post.id}/like`).set('Accept', 'application/json');

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    await expect(prisma.like.count()).resolves.toBe(0);
  });

  it('sem login via formulário: redireciona para /login', async () => {
    const res = await request(app).post('/posts/1/like');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('post inexistente: 404', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/posts/999/like').set('Accept', 'application/json');

    expect(res.status).toBe(404);
  });

  it('sem JavaScript (form comum): curte e volta para a página de origem', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await ana.agent.post(`/posts/${post.id}/like`).set('Referer', `/posts/${post.id}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/posts/${post.id}`);
    await expect(prisma.like.count()).resolves.toBe(1);
  });
});

describe('POST /comments/:id/like (curtida em comentário, alterna)', () => {
  async function createComment(authorId: number) {
    const post = await createPost(authorId);
    return prisma.comment.create({ data: { content: 'Comentário', authorId, postId: post.id } });
  }

  it('curte e descurte um comentário', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const comment = await createComment(ana.userId);

    const first = await ana.agent.post(`/comments/${comment.id}/like`).set('Accept', 'application/json');
    const second = await ana.agent.post(`/comments/${comment.id}/like`).set('Accept', 'application/json');

    expect(first.body).toEqual({ liked: true, likeCount: 1 });
    expect(second.body).toEqual({ liked: false, likeCount: 0 });
  });

  it('sem login: 401', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const comment = await createComment(ana.userId);

    const res = await request(app).post(`/comments/${comment.id}/like`).set('Accept', 'application/json');

    expect(res.status).toBe(401);
  });

  it('comentário inexistente: 404', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/comments/999/like').set('Accept', 'application/json');

    expect(res.status).toBe(404);
  });
});
