import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHttpApp } from '../../src/adapters/http/createHttpApp.js';
import { ANA, buildTestApp } from '../helpers/doubles.js';
import { FakeInboxSender } from '../../src/channels/fake/fakeChannel.js';

// ADAPTADOR HTTP, testado com os casos de uso de verdade, mas montados em
// memória (rápido, sem banco). O contrato completo está nos testes da Etapa 1
// (test/contract); aqui ficam os casos que o original nem tratava.
function app() {
  const test = buildTestApp();
  return { ...test, http: createHttpApp({ useCases: test.useCases, fakeInbox: new FakeInboxSender() }) };
}

describe('adaptador HTTP', () => {
  it('traduz a requisição para o caso de uso e a resposta para JSON', async () => {
    const { http } = app();

    const created = await request(http).post('/contacts').send(ANA);
    const sent = await request(http)
      .post('/notifications')
      .send({ contactId: created.body.id, channels: ['fake', 'email'], subject: 'S', message: 'oi' });

    expect(created.status).toBe(201);
    expect(sent.status).toBe(201);
    expect(sent.body.map((n: any) => n.status)).toEqual(['SENT', 'SENT']);
  });

  it('id que não é número: 404 (no original virava erro do Prisma com stack trace)', async () => {
    const { http } = app();

    const contact = await request(http).get('/contacts/abc');
    const notification = await request(http).post('/notifications/abc/retry');

    expect(contact.status).toBe(404);
    expect(contact.body).toEqual({ error: 'contato não encontrado' });
    expect(notification.status).toBe(404);
  });

  it('filtro contactId que não é número: 400', async () => {
    const res = await request(app().http).get('/notifications?contactId=abc');

    expect(res.status).toBe(400);
  });

  it('JSON malformado: 400 em JSON (não a página de erro do Express)', async () => {
    const res = await request(app().http).post('/contacts').set('Content-Type', 'application/json').send('{ruim');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'corpo da requisição não é um JSON válido' });
  });

  it('erro interno NÃO vaza para o cliente: só "erro interno do servidor"', async () => {
    const { http, contacts } = app();
    vi.spyOn(contacts, 'list').mockRejectedValue(new Error('PrismaClientKnownRequestError: SQLITE_BUSY em /src/...'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(http).get('/contacts');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'erro interno do servidor' });
    expect(res.text).not.toContain('Prisma');
    expect(log).toHaveBeenCalled(); // o detalhe fica só no log do servidor
    log.mockRestore();
  });

  it('retry recusado pela regra do canal: 422', async () => {
    const { http } = app();
    const contact = await request(http).post('/contacts').send({ name: 'Ana', email: 'a@b.co' });
    const [failed] = (
      await request(http).post('/notifications').send({ contactId: contact.body.id, channels: ['sms'], message: 'oi' })
    ).body;

    const res = await request(http).post(`/notifications/${failed.id}/retry`);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'contato não possui telefone' });
  });
});
