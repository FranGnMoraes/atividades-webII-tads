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

async function createPost(authorId: number) {
  return prisma.post.create({ data: { content: 'Post de teste', authorId } });
}

describe('POST /posts/:id/comments (criar comentário)', () => {
  it('cria via fetch e devolve o comentário pronto para a tela (201)', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await ana.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: '  Que legal!  ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      content: 'Que legal!',
      postId: post.id,
      author: { id: ana.userId, name: 'Ana' },
      likeCount: 0,
      likedByMe: false,
      isMine: true,
    });
  });

  it('o authorId vem da SESSÃO, mesmo que o corpo mande outro', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);

    await bruno.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Fingindo ser a Ana', authorId: ana.userId });

    const comment = await prisma.comment.findFirstOrThrow();
    expect(comment.authorId).toBe(bruno.userId);
  });

  it('pelo formulário da página do post (sem JS): redireciona de volta para o post', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await ana.agent.post(`/posts/${post.id}/comments`).type('form').send({ content: 'Pelo form' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/posts/${post.id}`);
  });

  it('comentário vazio: 400', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await ana.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: '   ' });

    expect(res.status).toBe(400);
    await expect(prisma.comment.count()).resolves.toBe(0);
  });

  it('comentário com mais de 500 caracteres: 400', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await ana.agent
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'a'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('sem login: 401', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);

    const res = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Accept', 'application/json')
      .send({ content: 'Sem sessão' });

    expect(res.status).toBe(401);
  });

  it('post inexistente: 404', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/posts/999/comments').set('Accept', 'application/json').send({ content: 'Oi' });

    expect(res.status).toBe(404);
  });
});

describe('GET /posts/:id/comments (listar)', () => {
  it('lista com autor, contagem de curtidas e o que é meu / o que eu curti', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);
    const doBruno = await prisma.comment.create({ data: { content: 'Do Bruno', authorId: bruno.userId, postId: post.id } });
    await prisma.commentLike.create({ data: { userId: ana.userId, commentId: doBruno.id } });

    const res = await ana.agent.get(`/posts/${post.id}/comments`).set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      content: 'Do Bruno',
      author: { name: 'Bruno' },
      likeCount: 1,
      likedByMe: true,
      isMine: false,
    });
  });

  it('ordena pelos mais curtidos (extra 9); empate fica por data', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);
    await prisma.comment.create({ data: { content: 'Primeiro, sem curtida', authorId: ana.userId, postId: post.id } });
    const popular = await prisma.comment.create({ data: { content: 'Mais curtido', authorId: ana.userId, postId: post.id } });
    await prisma.comment.create({ data: { content: 'Terceiro, sem curtida', authorId: ana.userId, postId: post.id } });
    await prisma.commentLike.createMany({
      data: [
        { userId: ana.userId, commentId: popular.id },
        { userId: bruno.userId, commentId: popular.id },
      ],
    });

    const res = await request(app).get(`/posts/${post.id}/comments`);

    expect(res.body.map((c: { content: string }) => c.content)).toEqual([
      'Mais curtido',
      'Primeiro, sem curtida',
      'Terceiro, sem curtida',
    ]);
  });

  it('post inexistente: 404', async () => {
    const res = await request(app).get('/posts/999/comments').set('Accept', 'application/json');

    expect(res.status).toBe(404);
  });
});

describe('DELETE /comments/:id (requireOwnComment)', () => {
  it('quem escreveu consegue apagar (204)', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);
    const comment = await prisma.comment.create({ data: { content: 'Meu', authorId: ana.userId, postId: post.id } });

    const res = await ana.agent.delete(`/comments/${comment.id}`).set('Accept', 'application/json');

    expect(res.status).toBe(204);
    await expect(prisma.comment.count()).resolves.toBe(0);
  });

  it('outra pessoa NÃO consegue apagar (403) — nem o dono do post', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);
    const comment = await prisma.comment.create({ data: { content: 'Do Bruno', authorId: bruno.userId, postId: post.id } });

    const res = await ana.agent.delete(`/comments/${comment.id}`).set('Accept', 'application/json');

    expect(res.status).toBe(403);
    await expect(prisma.comment.count()).resolves.toBe(1);
  });

  it('comentário inexistente: 404', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.delete('/comments/999').set('Accept', 'application/json');

    expect(res.status).toBe(404);
  });

  it('sem login: 401', async () => {
    const res = await request(app).delete('/comments/1').set('Accept', 'application/json');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /comments/:id (extra 7 — editar o próprio comentário)', () => {
  it('quem escreveu consegue editar', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);
    const comment = await prisma.comment.create({ data: { content: 'Antes', authorId: ana.userId, postId: post.id } });

    const res = await ana.agent
      .patch(`/comments/${comment.id}`)
      .set('Accept', 'application/json')
      .send({ content: 'Depois' });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Depois');
  });

  it('outra pessoa NÃO consegue editar (403)', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);
    const comment = await prisma.comment.create({ data: { content: 'Da Ana', authorId: ana.userId, postId: post.id } });

    const res = await bruno.agent
      .patch(`/comments/${comment.id}`)
      .set('Accept', 'application/json')
      .send({ content: 'Editado pelo Bruno' });

    expect(res.status).toBe(403);
    const unchanged = await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(unchanged.content).toBe('Da Ana');
  });

  it('não deixa editar para vazio (400)', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const post = await createPost(ana.userId);
    const comment = await prisma.comment.create({ data: { content: 'Antes', authorId: ana.userId, postId: post.id } });

    const res = await ana.agent.patch(`/comments/${comment.id}`).set('Accept', 'application/json').send({ content: '' });

    expect(res.status).toBe(400);
  });

  it('pelo navegador (HTML), 403 vira a página de erro', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const post = await createPost(ana.userId);
    const comment = await prisma.comment.create({ data: { content: 'Da Ana', authorId: ana.userId, postId: post.id } });

    const res = await bruno.agent.patch(`/comments/${comment.id}`).send({ content: 'x' });

    expect(res.status).toBe(403);
    expect(res.text).toContain('comentário de outra pessoa');
  });
});
