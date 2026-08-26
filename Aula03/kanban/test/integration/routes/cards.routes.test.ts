import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { buildTestRepositories } from '../../helpers/fixtures.js';
import { Card } from '../../../src/cards/Card.js';

describe('POST /cards (Atividade 1, 5, 6)', () => {
  it('cria um cartão válido e redireciona para /', async () => {
    const repos = buildTestRepositories();
    const app = createServer(repos);

    const response = await request(app)
      .post('/cards')
      .send({ title: 'Novo cartão', columnId: 'col-1', priority: 'alta', description: 'Detalhes' });

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('/');

    const cards = repos.cardRepository.findAll();
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Novo cartão');
    expect(cards[0].priority).toBe('alta');
    expect(cards[0].description).toBe('Detalhes');
  });

  it('rejeita título com menos de 3 caracteres com 400', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app).post('/cards').send({ title: 'ab', columnId: 'col-1' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Título de cartão inválido');
  });

  it('rejeita columnId de uma coluna que não existe com 404', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app)
      .post('/cards')
      .send({ title: 'Cartão Válido', columnId: 'col-inexistente' });

    expect(response.status).toBe(404);
    expect(response.text).toContain('Coluna col-inexistente não encontrada');
  });

  it('impede título duplicado na mesma coluna com 409 (Atividade 6)', async () => {
    const repos = buildTestRepositories();
    repos.cardRepository.save(Card.create('Tarefa Duplicada', 'col-1'));
    const app = createServer(repos);

    const response = await request(app)
      .post('/cards')
      .send({ title: 'Tarefa Duplicada', columnId: 'col-1' });

    expect(response.status).toBe(409);
    expect(response.text).toContain('Já existe um cartão com o título');
  });

  it('rejeita criação se a coluna já atingiu o limite de WIP com 409 (Atividade 5)', async () => {
    const repos = buildTestRepositories();
    repos.boardRepository.getDefault().addColumn('Coluna com WIP', 1);
    const colWip = repos.boardRepository.getDefault().columns.find((c) => c.name === 'Coluna com WIP')!;
    repos.cardRepository.save(Card.create('Cartão Existente', colWip.id));
    const app = createServer(repos);

    const response = await request(app)
      .post('/cards')
      .send({ title: 'Segundo Cartão', columnId: colWip.id });

    expect(response.status).toBe(409);
    expect(response.text).toContain('Limite de WIP atingido');
  });
});

describe('POST /cards/:id/move (Atividade 2 & 5)', () => {
  it('move o cartão para a coluna informada e redireciona para /', async () => {
    const repos = buildTestRepositories();
    const card = Card.create('Mover Cartão', 'col-1');
    repos.cardRepository.save(card);
    const app = createServer(repos);

    const response = await request(app).post(`/cards/${card.id}/move`).send({ columnId: 'col-2' });

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('/');
    expect(repos.cardRepository.findById(card.id)?.columnId).toBe('col-2');
  });

  it('mantém o cartão na mesma coluna se o destino for igual ao atual', async () => {
    const repos = buildTestRepositories();
    const card = Card.create('Ficar na mesma', 'col-1');
    repos.cardRepository.save(card);
    const app = createServer(repos);

    const response = await request(app).post(`/cards/${card.id}/move`).send({ columnId: 'col-1' });

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('/');
    expect(repos.cardRepository.findById(card.id)?.columnId).toBe('col-1');
  });

  it('responde 404 se o cartão não existe', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app).post('/cards/id-inexistente/move').send({ columnId: 'col-2' });

    expect(response.status).toBe(404);
    expect(response.text).toContain('Cartão id-inexistente não encontrado');
  });

  it('responde 404 se a coluna destino não existe', async () => {
    const repos = buildTestRepositories();
    const card = Card.create('Cartão', 'col-1');
    repos.cardRepository.save(card);
    const app = createServer(repos);

    const response = await request(app)
      .post(`/cards/${card.id}/move`)
      .send({ columnId: 'col-inexistente' });

    expect(response.status).toBe(404);
    expect(response.text).toContain('Coluna col-inexistente não encontrada');
  });

  it('responde 409 se a coluna destino já atingiu o limite de WIP (Atividade 5)', async () => {
    const repos = buildTestRepositories();
    const col3 = repos.boardRepository.getDefault().addColumn('Limitada', 1);
    repos.cardRepository.save(Card.create('Ocupante', col3.id));
    const cardToMove = Card.create('Candidato', 'col-1');
    repos.cardRepository.save(cardToMove);
    const app = createServer(repos);

    const response = await request(app).post(`/cards/${cardToMove.id}/move`).send({ columnId: col3.id });

    expect(response.status).toBe(409);
    expect(response.text).toContain('Limite de WIP atingido');
  });

  it('responde 409 se o cartão for movido para uma coluna que já tem o mesmo título (Atividade 6)', async () => {
    const repos = buildTestRepositories();
    const card1 = Card.create('Mesmo Nome', 'col-1');
    const card2 = Card.create('Mesmo Nome', 'col-2');
    repos.cardRepository.save(card1);
    repos.cardRepository.save(card2);
    const app = createServer(repos);

    const response = await request(app).post(`/cards/${card1.id}/move`).send({ columnId: 'col-2' });

    expect(response.status).toBe(409);
    expect(response.text).toContain('Já existe um cartão com o título');
  });
});

describe('POST /cards/:id/update (Atividade 3)', () => {
  it('edita título/descrição/prioridade e redireciona para /', async () => {
    const repos = buildTestRepositories();
    const card = Card.create('Título Antigo', 'col-1', 'baixa', 'Desc antiga');
    repos.cardRepository.save(card);
    const app = createServer(repos);

    const response = await request(app)
      .post(`/cards/${card.id}/update`)
      .send({ title: 'Título Novo', description: 'Nova Descrição', priority: 'alta' });

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('/');

    const updated = repos.cardRepository.findById(card.id)!;
    expect(updated.title).toBe('Título Novo');
    expect(updated.description).toBe('Nova Descrição');
    expect(updated.priority).toBe('alta');
  });

  it('permite atualizar somente a descrição mantendo o título', async () => {
    const repos = buildTestRepositories();
    const card = Card.create('Título Intacto', 'col-1', 'baixa', 'Desc 1');
    repos.cardRepository.save(card);
    const app = createServer(repos);

    const response = await request(app)
      .post(`/cards/${card.id}/update`)
      .send({ description: 'Desc 2' });

    expect(response.status).toBe(302);
    const updated = repos.cardRepository.findById(card.id)!;
    expect(updated.title).toBe('Título Intacto');
    expect(updated.description).toBe('Desc 2');
  });

  it('responde 404 se o cartão não existe', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app).post('/cards/id-fantasma/update').send({ title: 'Novo' });

    expect(response.status).toBe(404);
    expect(response.text).toContain('Cartão id-fantasma não encontrado');
  });

  it('responde 409 se o novo título já existe na mesma coluna', async () => {
    const repos = buildTestRepositories();
    const card1 = Card.create('Primeiro Cartão', 'col-1');
    const card2 = Card.create('Segundo Cartão', 'col-1');
    repos.cardRepository.save(card1);
    repos.cardRepository.save(card2);
    const app = createServer(repos);

    const response = await request(app)
      .post(`/cards/${card2.id}/update`)
      .send({ title: 'Primeiro Cartão' });

    expect(response.status).toBe(409);
    expect(response.text).toContain('Já existe um cartão com o título');
  });
});

describe('POST /cards/:id/delete (Atividade 4)', () => {
  it('remove o cartão e redireciona para /', async () => {
    const repos = buildTestRepositories();
    const card = Card.create('Para Deletar', 'col-1');
    repos.cardRepository.save(card);
    const app = createServer(repos);

    const response = await request(app).post(`/cards/${card.id}/delete`);

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('/');
    expect(repos.cardRepository.findById(card.id)).toBeUndefined();
  });

  it('responde 404 se o cartão não existe', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app).post('/cards/id-fantasma/delete');

    expect(response.status).toBe(404);
    expect(response.text).toContain('Cartão id-fantasma não encontrado');
  });
});

describe('GET /cards/:id (Atividade 8, estica)', () => {
  it('renderiza a página de detalhe do cartão', async () => {
    const repos = buildTestRepositories();
    const card = Card.create('Cartão Detalhado', 'col-1', 'alta', 'Detalhes do cartão');
    repos.cardRepository.save(card);
    const app = createServer(repos);

    const response = await request(app).get(`/cards/${card.id}`);

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('Cartão Detalhado');
    expect(response.text).toContain('Coluna 1');
    expect(response.text).toContain('Detalhes do cartão');
    expect(response.text).toContain('alta');
  });

  it('responde 404 se o cartão não existe', async () => {
    const app = createServer(buildTestRepositories());

    const response = await request(app).get('/cards/id-fantasma');

    expect(response.status).toBe(404);
  });
});

describe('GET /cards/search (Atividade 9, estica)', () => {
  it('retorna só os cartões cujo título combina', async () => {
    const repos = buildTestRepositories();
    repos.cardRepository.save(Card.create('Comprar café', 'col-1'));
    repos.cardRepository.save(Card.create('Estudar Node.js', 'col-1'));
    const app = createServer(repos);

    const response = await request(app).get('/cards/search').query({ query: 'café' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Comprar café');
    expect(response.text).not.toContain('Estudar Node.js');
  });

  it('retorna todos os cartões quando query está vazia', async () => {
    const repos = buildTestRepositories();
    repos.cardRepository.save(Card.create('Comprar café', 'col-1'));
    repos.cardRepository.save(Card.create('Estudar Node.js', 'col-1'));
    const app = createServer(repos);

    const response = await request(app).get('/cards/search').query({ query: '' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Comprar café');
    expect(response.text).toContain('Estudar Node.js');
  });
});
