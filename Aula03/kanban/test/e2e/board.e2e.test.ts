import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { buildTestRepositories } from '../helpers/fixtures.js';

describe('Estado inicial: visualização do quadro hard-coded', () => {
  it('GET / mostra o quadro, as três colunas e os cartões semeados', async () => {
    const app = createServer();

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Quadro do Projeto');
    expect(response.text).toContain('A Fazer');
    expect(response.text).toContain('Em Andamento');
    expect(response.text).toContain('Concluído');
    expect(response.text).toContain('Criar cartão (Atividade 1)');
  });

  it('a coluna "Em Andamento" mostra o limite de WIP (1/3) e não está estourada', async () => {
    const app = createServer();

    const response = await request(app).get('/');

    expect(response.text).toContain('1/3');
  });

  it('cartões de prioridade alta, média e baixa aparecem com rótulos diferentes', async () => {
    const app = createServer();

    const response = await request(app).get('/');

    expect(response.text).toContain('alta');
    expect(response.text).toContain('média');
    expect(response.text).toContain('baixa');
  });
});

describe('Jornada completa (E2E)', () => {
  it('criar cartão → mover para "Em Andamento" → editar → mover para "Concluído" → excluir, tudo via HTTP', async () => {
    const repos = buildTestRepositories();
    const app = createServer(repos);

    // 1. Cria cartão na coluna 1
    const createRes = await request(app)
      .post('/cards')
      .send({ title: 'Minha Nova Tarefa', columnId: 'col-1', priority: 'média' });
    expect(createRes.status).toBe(302);

    const cards = repos.cardRepository.findAll();
    const card = cards.find((c) => c.title === 'Minha Nova Tarefa')!;
    expect(card).toBeDefined();

    // 2. Move para coluna 2
    const moveRes = await request(app).post(`/cards/${card.id}/move`).send({ columnId: 'col-2' });
    expect(moveRes.status).toBe(302);
    expect(repos.cardRepository.findById(card.id)?.columnId).toBe('col-2');

    // 3. Edita o cartão
    const updateRes = await request(app)
      .post(`/cards/${card.id}/update`)
      .send({ title: 'Minha Tarefa Atualizada', priority: 'alta' });
    expect(updateRes.status).toBe(302);
    expect(repos.cardRepository.findById(card.id)?.title).toBe('Minha Tarefa Atualizada');

    // 4. Detalhe do cartão
    const detailRes = await request(app).get(`/cards/${card.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.text).toContain('Minha Tarefa Atualizada');

    // 5. Exclui o cartão
    const deleteRes = await request(app).post(`/cards/${card.id}/delete`);
    expect(deleteRes.status).toBe(302);
    expect(repos.cardRepository.findById(card.id)).toBeUndefined();
  });
});
