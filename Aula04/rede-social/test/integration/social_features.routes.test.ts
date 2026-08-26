import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/server.js';
import { createTestPrismaClient, resetDatabase } from '../helpers/testDb.js';

const prisma: PrismaClient = createTestPrismaClient();
const app = createServer(prisma);

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser(name: string, email: string) {
  const res = await request(app).post('/users').send({ name, email });
  return res.body as { id: number; name: string; email: string };
}

async function createPost(authorId: number, content: string) {
  const res = await request(app).post('/posts').send({ authorId, content });
  return res.body as { id: number; content: string };
}

describe('UserProfile (1:1 com User)', () => {
  it('cria e atualiza o perfil de um usuário', async () => {
    const user = await createUser('Ana', 'ana@exemplo.com');

    const res1 = await request(app)
      .put(`/users/${user.id}/profile`)
      .send({
        bio: 'Desenvolvedora Fullstack',
        location: 'São Paulo',
        website: 'https://ana.dev',
      });

    expect(res1.status).toBe(200);
    expect(res1.body.bio).toBe('Desenvolvedora Fullstack');
    expect(res1.body.userId).toBe(user.id);

    const res2 = await request(app).get(`/users/${user.id}/profile`);
    expect(res2.status).toBe(200);
    expect(res2.body.location).toBe('São Paulo');

    const listRes = await request(app).get('/profiles?page=1&limit=10&order=desc');
    expect(listRes.status).toBe(200);
    expect(listRes.body.meta.total).toBe(1);
    expect(listRes.body.data[0].bio).toBe('Desenvolvedora Fullstack');
  });

  it('retorna 404 para perfil não encontrado', async () => {
    const res = await request(app).get('/users/999/profile');
    expect(res.status).toBe(404);
  });
});

describe('Comments (1:N Post, 1:N User)', () => {
  it('adiciona comentário em um post e lista com paginação e ordenação', async () => {
    const user1 = await createUser('Ana', 'ana@exemplo.com');
    const user2 = await createUser('Bruno', 'bruno@exemplo.com');
    const post = await createPost(user1.id, 'Meu primeiro post!');

    const resComment = await request(app)
      .post(`/posts/${post.id}/comments`)
      .send({ authorId: user2.id, content: 'Muito legal!' });

    expect(resComment.status).toBe(201);
    expect(resComment.body.content).toBe('Muito legal!');
    expect(resComment.body.author.name).toBe('Bruno');

    const resList = await request(app).get(`/posts/${post.id}/comments?page=1&limit=10&order=desc`);
    expect(resList.status).toBe(200);
    expect(resList.body.meta.total).toBe(1);
    expect(resList.body.data[0].content).toBe('Muito legal!');
  });

  it('rejeita comentário com conteúdo vazio ou autor inexistente', async () => {
    const user = await createUser('Ana', 'ana@exemplo.com');
    const post = await createPost(user.id, 'Post');

    const res1 = await request(app)
      .post(`/posts/${post.id}/comments`)
      .send({ authorId: user.id, content: '' });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post(`/posts/${post.id}/comments`)
      .send({ authorId: 9999, content: 'Oi' });
    expect(res2.status).toBe(404);
  });
});

describe('Likes (N:N explícita User <-> Post)', () => {
  it('adiciona curtida, rejeita duplicada e remove curtida', async () => {
    const user = await createUser('Ana', 'ana@exemplo.com');
    const post = await createPost(user.id, 'Post para curtir');

    const resLike = await request(app)
      .post(`/posts/${post.id}/likes`)
      .send({ userId: user.id });
    expect(resLike.status).toBe(201);

    const resDuplicate = await request(app)
      .post(`/posts/${post.id}/likes`)
      .send({ userId: user.id });
    expect(resDuplicate.status).toBe(409);

    const resList = await request(app).get(`/posts/${post.id}/likes?page=1&limit=10`);
    expect(resList.status).toBe(200);
    expect(resList.body.meta.total).toBe(1);
    expect(resList.body.data[0].user.name).toBe('Ana');

    const resDelete = await request(app).delete(`/posts/${post.id}/likes/${user.id}`);
    expect(resDelete.status).toBe(204);

    const resListAfter = await request(app).get(`/posts/${post.id}/likes?page=1&limit=10`);
    expect(resListAfter.body.meta.total).toBe(0);
  });
});

describe('Images (1:N Post -> Image)', () => {
  it('adiciona imagem a um post e lista com paginação', async () => {
    const user = await createUser('Ana', 'ana@exemplo.com');
    const post = await createPost(user.id, 'Post com fotos');

    const resImage = await request(app)
      .post(`/posts/${post.id}/images`)
      .send({ url: 'https://exemplo.com/foto.jpg', altText: 'Foto de viagem' });

    expect(resImage.status).toBe(201);
    expect(resImage.body.url).toBe('https://exemplo.com/foto.jpg');

    const resList = await request(app).get(`/posts/${post.id}/images?page=1&limit=10&order=desc`);
    expect(resList.status).toBe(200);
    expect(resList.body.meta.total).toBe(1);
    expect(resList.body.data[0].altText).toBe('Foto de viagem');
  });
});

describe('Paginação e Ordenação de Posts', () => {
  it('pagina posts com 10 itens por padrão e permite ordenação ascendente e descendente', async () => {
    const user = await createUser('Ana', 'ana@exemplo.com');

    // Cria 15 posts
    for (let i = 1; i <= 15; i++) {
      await createPost(user.id, `Post número ${i.toString().padStart(2, '0')}`);
    }

    // Página 1 (default limit = 10, default order = desc)
    const page1Desc = await request(app).get('/posts?page=1&limit=10&order=desc');
    expect(page1Desc.status).toBe(200);
    expect(page1Desc.body.meta.total).toBe(15);
    expect(page1Desc.body.meta.totalPages).toBe(2);
    expect(page1Desc.body.data).toHaveLength(10);
    expect(page1Desc.body.data[0].content).toBe('Post número 15');

    // Página 2
    const page2Desc = await request(app).get('/posts?page=2&limit=10&order=desc');
    expect(page2Desc.status).toBe(200);
    expect(page2Desc.body.data).toHaveLength(5);
    expect(page2Desc.body.data[4].content).toBe('Post número 01');

    // Ordenação ascendente (mais antigos primeiro)
    const page1Asc = await request(app).get('/posts?page=1&limit=10&order=asc');
    expect(page1Asc.status).toBe(200);
    expect(page1Asc.body.data[0].content).toBe('Post número 01');
  });
});
