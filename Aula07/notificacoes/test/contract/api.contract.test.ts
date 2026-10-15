import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, startServer, type RunningServer } from './server.js';

// ETAPA 1 — o CONTRATO da API (status HTTP + formato das respostas),
// registrado na Etapa 0 a partir do código original. Esta suíte passa contra
// legacy/index.ts E contra src/index.ts, sem nenhuma alteração.
//
// Dois servidores no MESMO banco: `ok` (SMS nunca falha) e `failing` (SMS
// sempre falha). É o jeito de controlar o Math.random() do original por fora.
let ok: RunningServer;
let failing: RunningServer;

beforeAll(async () => {
  [ok, failing] = await Promise.all([
    startServer(3471, { SMS_FAILURE_RATE: '0' }),
    startServer(3472, { SMS_FAILURE_RATE: '1' }),
  ]);
}, 60_000);

afterAll(async () => {
  await Promise.all([ok?.stop(), failing?.stop()]);
});

const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

async function createContact(body: Record<string, unknown> = {}) {
  const res = await api(ok.url, 'POST', '/contacts', {
    name: 'Ana',
    email: 'ana@ifrs.edu.br',
    phone: '+5551999998888',
    ...body,
  });
  expect(res.status).toBe(201);
  return res.body;
}

describe('POST /contacts', () => {
  it('201 com o contato criado (nome sem espaços nas pontas, optOut como lista)', async () => {
    const res = await api(ok.url, 'POST', '/contacts', {
      name: '  Ana Souza ',
      email: 'ana@ifrs.edu.br',
      phone: '+5551999998888',
      optOut: ['sms'],
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: 'Ana Souza',
      email: 'ana@ifrs.edu.br',
      phone: '+5551999998888',
      optOut: ['sms'],
      createdAt: ISO_DATE,
    });
  });

  it('sem email: email null; sem optOut: lista vazia', async () => {
    const res = await api(ok.url, 'POST', '/contacts', { name: 'Beto', phone: '+5551988887777' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBeNull();
    expect(res.body.optOut).toEqual([]);
  });

  it.each([
    [{ phone: '+5551999998888' }, 'name é obrigatório (mínimo 2 caracteres)'],
    [{ name: 'A', phone: '+5551999998888' }, 'name é obrigatório (mínimo 2 caracteres)'],
    [{ name: 'Ana', email: 'ana-sem-arroba' }, 'email inválido'],
    [{ name: 'Ana', phone: '51999998888' }, 'phone deve estar no formato E.164 (ex.: +5551999998888)'],
    [{ name: 'Ana' }, 'informe ao menos email ou phone'],
  ])('400 para %j', async (body, error) => {
    const res = await api(ok.url, 'POST', '/contacts', body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it('400 para optOut com canal que não existe', async () => {
    const res = await api(ok.url, 'POST', '/contacts', { name: 'Ana', email: 'a@b.co', optOut: ['pombo'] });

    expect(res.status).toBe(400);
    // A lista de canais da mensagem começa com os 3 originais (na Etapa 9
    // ganhou o canal novo no final).
    expect(res.body.error).toMatch(/^optOut deve ser uma lista com: fake, sms, email/);
  });
});

describe('GET /contacts e GET /contacts/:id', () => {
  it('lista em ordem de id, com optOut como lista', async () => {
    const created = await createContact({ name: 'Carla', optOut: ['email'] });

    const res = await api(ok.url, 'GET', '/contacts');

    expect(res.status).toBe(200);
    const ids = res.body.map((c: { id: number }) => c.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(res.body).toContainEqual(created);
  });

  it('detalhe de um contato', async () => {
    const created = await createContact();

    const res = await api(ok.url, 'GET', `/contacts/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('404 para contato que não existe', async () => {
    const res = await api(ok.url, 'GET', '/contacts/999999');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'contato não encontrado' });
  });
});

describe('POST /notifications', () => {
  it.each([
    [{ channels: ['fake'], message: 'oi' }],
    [{ contactId: 1, channels: [], message: 'oi' }],
    [{ contactId: 1, channels: 'fake', message: 'oi' }],
    [{ contactId: 1, channels: ['fake'] }],
  ])('400 quando falta campo obrigatório: %j', async (body) => {
    const res = await api(ok.url, 'POST', '/notifications', body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'contactId, channels (lista) e message são obrigatórios' });
  });

  it('400 para canal desconhecido', async () => {
    const contact = await createContact();

    const res = await api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels: ['fake', 'pombo'], message: 'oi' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'canal desconhecido: pombo' });
  });

  it('404 para contato que não existe', async () => {
    const res = await api(ok.url, 'POST', '/notifications', { contactId: 999999, channels: ['fake'], message: 'oi' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'contato não encontrado' });
  });

  it('201: envia pelos 3 canais, na ordem pedida, e grava cada envio', async () => {
    const contact = await createContact();

    const res = await api(ok.url, 'POST', '/notifications', {
      contactId: contact.id,
      channels: ['fake', 'sms', 'email'],
      subject: 'Matrícula',
      message: 'Sua matrícula foi confirmada',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(3);
    const common = {
      id: expect.any(Number),
      subject: 'Matrícula',
      message: 'Sua matrícula foi confirmada',
      status: 'SENT',
      attempts: 1,
      lastError: null,
      createdAt: ISO_DATE,
      sentAt: ISO_DATE,
      contactId: contact.id,
    };
    expect(res.body[0]).toEqual({ ...common, channel: 'fake', providerId: expect.stringMatching(/^fake-[0-9a-f-]{36}$/) });
    expect(res.body[1]).toEqual({ ...common, channel: 'sms', providerId: expect.stringMatching(/^sms-[0-9a-f]{8}$/) });
    expect(res.body[2]).toEqual({
      ...common,
      channel: 'email',
      providerId: expect.stringMatching(/^<[0-9a-f-]{36}@notificacoes\.local>$/),
    });
  });

  it('canal repetido na lista é enviado uma vez só', async () => {
    const contact = await createContact();

    const res = await api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels: ['fake', 'fake'], message: 'oi' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
  });

  it('o canal fake entrega na caixa de entrada (GET /fake-inbox/:contactId)', async () => {
    const contact = await createContact();
    const sent = await api(ok.url, 'POST', '/notifications', {
      contactId: contact.id,
      channels: ['fake'],
      subject: 'Oi',
      message: 'Mensagem para a caixa fake',
    });

    const res = await api(ok.url, 'GET', `/fake-inbox/${contact.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: sent.body[0].providerId,
        contactId: contact.id,
        subject: 'Oi',
        message: 'Mensagem para a caixa fake',
        receivedAt: ISO_DATE,
      },
    ]);
  });

  it('caixa fake de quem não recebeu nada: lista vazia', async () => {
    const res = await api(ok.url, 'GET', '/fake-inbox/999999');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('regras de cada canal: a notificação é gravada como FAILED (attempts 0), mas a resposta é 201', async () => {
    const semTelefone = await createContact({ phone: undefined, optOut: ['fake'] });

    const res = await api(ok.url, 'POST', '/notifications', {
      contactId: semTelefone.id,
      channels: ['fake', 'sms', 'email'],
      message: 'Mensagem sem assunto',
    });

    expect(res.status).toBe(201);
    expect(res.body.map((n: any) => [n.channel, n.status, n.attempts, n.lastError, n.providerId, n.sentAt])).toEqual([
      ['fake', 'FAILED', 0, 'contato optou por não receber fake', null, null],
      ['sms', 'FAILED', 0, 'contato não possui telefone', null, null],
      ['email', 'FAILED', 0, 'email exige subject', null, null],
    ]);
  });

  it('SMS acima de 160 caracteres e e-mail sem endereço também falham na validação', async () => {
    const semEmail = await createContact({ email: undefined });

    const res = await api(ok.url, 'POST', '/notifications', {
      contactId: semEmail.id,
      channels: ['sms', 'email'],
      subject: 'Assunto',
      message: 'x'.repeat(161),
    });

    expect(res.body.map((n: any) => n.lastError)).toEqual([
      'mensagem de SMS não pode passar de 160 caracteres',
      'contato não possui email',
    ]);
  });

  it('falha do provedor de SMS: FAILED com attempts 1 e a mensagem do provedor', async () => {
    const contact = await createContact();

    const res = await api(failing.url, 'POST', '/notifications', { contactId: contact.id, channels: ['sms'], message: 'oi' });

    expect(res.status).toBe(201);
    expect(res.body[0]).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      lastError: 'operadora de SMS indisponível',
      providerId: null,
      sentAt: null,
    });
  });

  it('429 ao passar de 5 notificações por minuto para o mesmo contato', async () => {
    const contact = await createContact();
    const send = (channels: string[]) =>
      api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels, subject: 'S', message: 'oi' });

    expect((await send(['fake', 'sms', 'email'])).status).toBe(201); // 3
    expect((await send(['fake', 'sms'])).status).toBe(201); // 5: ainda pode
    const blocked = await send(['fake']); // seria a 6ª

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'limite de 5 notificações por minuto para este contato' });
  });
});

describe('GET /notifications e GET /notifications/:id', () => {
  it('filtra por contato, canal e status (status aceita minúsculas), do mais novo para o mais antigo', async () => {
    const contact = await createContact({ optOut: ['email'] });
    await api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels: ['fake', 'email'], message: 'oi' });

    const byContact = await api(ok.url, 'GET', `/notifications?contactId=${contact.id}`);
    const failed = await api(ok.url, 'GET', `/notifications?contactId=${contact.id}&status=failed`);
    const fake = await api(ok.url, 'GET', `/notifications?contactId=${contact.id}&channel=fake`);

    expect(byContact.status).toBe(200);
    expect(byContact.body.map((n: any) => n.channel)).toEqual(['email', 'fake']);
    expect(failed.body.map((n: any) => n.channel)).toEqual(['email']);
    expect(fake.body.map((n: any) => n.status)).toEqual(['SENT']);
  });

  it('detalhe inclui o contato (com optOut no formato do banco: texto separado por vírgula)', async () => {
    const contact = await createContact({ optOut: ['sms', 'email'] });
    const sent = await api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels: ['fake'], message: 'oi' });

    const res = await api(ok.url, 'GET', `/notifications/${sent.body[0].id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...sent.body[0], contact: { ...contact, optOut: 'sms,email' } });
  });

  it('404 para notificação que não existe', async () => {
    const res = await api(ok.url, 'GET', '/notifications/999999');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'notificação não encontrada' });
  });
});

describe('POST /notifications/:id/retry', () => {
  async function failedSms(contactOverrides: Record<string, unknown> = {}) {
    const contact = await createContact(contactOverrides);
    const res = await api(failing.url, 'POST', '/notifications', { contactId: contact.id, channels: ['sms'], message: 'oi' });
    return res.body[0];
  }

  it('200: reenvia com sucesso, soma a tentativa e limpa o lastError', async () => {
    const notification = await failedSms();

    const res = await api(ok.url, 'POST', `/notifications/${notification.id}/retry`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...notification,
      status: 'SENT',
      attempts: 2,
      lastError: null,
      providerId: expect.stringMatching(/^sms-[0-9a-f]{8}$/),
      sentAt: ISO_DATE,
    });
  });

  it('502: o provedor falhou de novo (attempts +1); depois de 3 tentativas, 409', async () => {
    const notification = await failedSms();

    const second = await api(failing.url, 'POST', `/notifications/${notification.id}/retry`);
    const third = await api(failing.url, 'POST', `/notifications/${notification.id}/retry`);
    const fourth = await api(ok.url, 'POST', `/notifications/${notification.id}/retry`);

    expect(second.status).toBe(502);
    expect(second.body).toMatchObject({ status: 'FAILED', attempts: 2, lastError: 'operadora de SMS indisponível' });
    expect(third.status).toBe(502);
    expect(third.body.attempts).toBe(3);
    expect(fourth.status).toBe(409);
    expect(fourth.body).toEqual({ error: 'número máximo de tentativas (3) atingido' });
  });

  it('409 para notificação já enviada', async () => {
    const contact = await createContact();
    const sent = await api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels: ['fake'], message: 'oi' });

    const res = await api(ok.url, 'POST', `/notifications/${sent.body[0].id}/retry`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'notificação já foi enviada' });
  });

  it('422 quando o contato continua sem cumprir a regra do canal (nada é alterado)', async () => {
    const contact = await createContact({ optOut: ['sms'] });
    const sent = await api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels: ['sms'], message: 'oi' });

    const res = await api(ok.url, 'POST', `/notifications/${sent.body[0].id}/retry`);
    const after = await api(ok.url, 'GET', `/notifications/${sent.body[0].id}`);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'contato optou por não receber sms' });
    expect(after.body.attempts).toBe(0);
  });

  it('422 para SMS de contato sem telefone', async () => {
    const contact = await createContact({ phone: undefined });
    const sent = await api(ok.url, 'POST', '/notifications', { contactId: contact.id, channels: ['sms'], message: 'oi' });

    const res = await api(ok.url, 'POST', `/notifications/${sent.body[0].id}/retry`);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'contato não possui telefone' });
  });

  it('404 para notificação que não existe', async () => {
    const res = await api(ok.url, 'POST', '/notifications/999999/retry');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'notificação não encontrada' });
  });
});
