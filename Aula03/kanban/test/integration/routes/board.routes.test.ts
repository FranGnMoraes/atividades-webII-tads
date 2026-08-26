import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { buildTestRepositories } from '../../helpers/fixtures.js';

describe('GET /', () => {
  it('renderiza o quadro com suas colunas', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('Quadro de Teste');
    expect(response.text).toContain('Coluna 1');
    expect(response.text).toContain('Coluna 2');
  });
});

describe('POST /columns (Atividade 7)', () => {
  it('cria uma nova coluna e redireciona para /', async () => {
    const repos = buildTestRepositories();
    const app = createServer(repos);

    const response = await request(app).post('/columns').send({ name: 'Em Teste', wipLimit: '4' });

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('/');
    expect(repos.boardRepository.getDefault().hasColumn('col-1')).toBe(true);
    expect(repos.boardRepository.getDefault().columns).toHaveLength(3);
  });

  it('cria coluna sem wipLimit', async () => {
    const repos = buildTestRepositories();
    const app = createServer(repos);

    const response = await request(app).post('/columns').send({ name: 'Livre' });

    expect(response.status).toBe(302);
    const col = repos.boardRepository.getDefault().columns.find((c) => c.name === 'Livre')!;
    expect(col.wipLimit).toBeNull();
  });

  it('rejeita nome de coluna inválido com 400', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app).post('/columns').send({ name: 'x' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Nome de coluna inválido');
  });
});
