import { describe, expect, it } from 'vitest';
import { ANA, StubSender, buildTestApp } from '../../helpers/doubles.js';
import {
  AlreadySentError,
  ChannelRequirementError,
  ContactNotFoundError,
  MaxAttemptsReachedError,
  NotificationNotFoundError,
  RateLimitExceededError,
  UnknownChannelError,
  ValidationError,
} from '../../../src/domain/errors.js';

// CASOS DE USO testados com repositórios EM MEMÓRIA, provedores de mentira e
// relógio fixo: sem banco, sem HTTP, sem Math.random e sem esperar latência.

describe('CreateContact / GetContact / ListContacts', () => {
  it('cria com createdAt vindo do relógio e lista em ordem', async () => {
    const { useCases, clock } = buildTestApp();

    const ana = await useCases.createContact.execute(ANA);
    await useCases.createContact.execute({ name: 'Beto', phone: '+5551988887777' });

    expect(ana.createdAt).toEqual(clock.now());
    expect((await useCases.listContacts.execute()).map((c) => c.name)).toEqual(['Ana', 'Beto']);
    expect((await useCases.getContact.execute(ana.id)).name).toBe('Ana');
  });

  it('erros: dado inválido e contato inexistente', async () => {
    const { useCases } = buildTestApp();

    await expect(useCases.createContact.execute({ name: 'A' })).rejects.toThrow(ValidationError);
    await expect(useCases.getContact.execute(99)).rejects.toThrow(ContactNotFoundError);
  });
});

describe('SendNotification', () => {
  it('envia por cada canal, uma vez por canal, e guarda SENT com o providerId', async () => {
    const { useCases, senders } = buildTestApp();
    const ana = await useCases.createContact.execute(ANA);

    const result = await useCases.sendNotification.execute({
      contactId: ana.id,
      channels: ['fake', 'sms', 'fake', 'email'],
      subject: 'Oi',
      message: 'Olá',
    });

    expect(result.map((n) => [n.channel, n.status, n.toData().providerId, n.attempts])).toEqual([
      ['fake', 'SENT', 'fake-1', 1],
      ['sms', 'SENT', 'sms-1', 1],
      ['email', 'SENT', 'email-1', 1],
    ]);
    expect(senders.fake.sent).toHaveLength(1);
  });

  it('regra do canal violada: grava FAILED sem chamar o provedor', async () => {
    const { useCases, senders } = buildTestApp();
    const semTelefone = await useCases.createContact.execute({ name: 'Ana', email: 'ana@ifrs.edu.br', optOut: ['fake'] });

    const result = await useCases.sendNotification.execute({ contactId: semTelefone.id, channels: ['fake', 'sms'], message: 'oi' });

    expect(result.map((n) => [n.status, n.attempts, n.toData().lastError])).toEqual([
      ['FAILED', 0, 'contato optou por não receber fake'],
      ['FAILED', 0, 'contato não possui telefone'],
    ]);
    expect(senders.fake.sent).toHaveLength(0);
    expect(senders.sms.sent).toHaveLength(0);
  });

  it('provedor falhou: FAILED com 1 tentativa e o motivo', async () => {
    const { useCases, senders } = buildTestApp();
    const ana = await useCases.createContact.execute(ANA);
    senders.sms.failWith = 'operadora fora do ar';

    const [n] = await useCases.sendNotification.execute({ contactId: ana.id, channels: ['sms'], message: 'oi' });

    expect(n.toData()).toMatchObject({ status: 'FAILED', attempts: 1, lastError: 'operadora fora do ar' });
  });

  it('limite de 5 por minuto — e libera de novo quando o minuto passa (relógio controlado)', async () => {
    const { useCases, clock } = buildTestApp();
    const ana = await useCases.createContact.execute(ANA);
    const send = (channels: string[]) =>
      useCases.sendNotification.execute({ contactId: ana.id, channels, subject: 'S', message: 'oi' });

    await send(['fake', 'sms', 'email']);
    await send(['fake', 'sms']);
    await expect(send(['fake'])).rejects.toThrow(RateLimitExceededError);

    clock.advance(61_000);
    await expect(send(['fake'])).resolves.toHaveLength(1);
  });

  it('erros: canal desconhecido e contato inexistente', async () => {
    const { useCases } = buildTestApp();
    const ana = await useCases.createContact.execute(ANA);

    await expect(useCases.sendNotification.execute({ contactId: ana.id, channels: ['pombo'], message: 'oi' })).rejects.toThrow(
      new UnknownChannelError('pombo'),
    );
    await expect(useCases.sendNotification.execute({ contactId: 99, channels: ['fake'], message: 'oi' })).rejects.toThrow(
      ContactNotFoundError,
    );
  });
});

describe('RetryNotification', () => {
  async function failedSms() {
    const app = buildTestApp();
    const ana = await app.useCases.createContact.execute(ANA);
    app.senders.sms.failWith = 'operadora fora do ar';
    const [n] = await app.useCases.sendNotification.execute({ contactId: ana.id, channels: ['sms'], message: 'oi' });
    return { ...app, notificationId: n.id };
  }

  it('reenvia com sucesso: SENT, 2 tentativas, sem erro', async () => {
    const { useCases, senders, notificationId } = await failedSms();
    senders.sms.failWith = null;

    const { notification, delivered } = await useCases.retryNotification.execute(notificationId);

    expect(delivered).toBe(true);
    expect(notification.toData()).toMatchObject({ status: 'SENT', attempts: 2, lastError: null, providerId: 'sms-1' });
  });

  it('falha de novo: delivered false e tentativas somando; na 4ª, MaxAttemptsReached', async () => {
    const { useCases, notificationId } = await failedSms();

    expect((await useCases.retryNotification.execute(notificationId)).delivered).toBe(false);
    expect((await useCases.retryNotification.execute(notificationId)).notification.attempts).toBe(3);
    await expect(useCases.retryNotification.execute(notificationId)).rejects.toThrow(MaxAttemptsReachedError);
  });

  it('já enviada: AlreadySent', async () => {
    const { useCases } = buildTestApp();
    const ana = await useCases.createContact.execute(ANA);
    const [n] = await useCases.sendNotification.execute({ contactId: ana.id, channels: ['fake'], message: 'oi' });

    await expect(useCases.retryNotification.execute(n.id)).rejects.toThrow(AlreadySentError);
  });

  it('DIVERGÊNCIA CORRIGIDA: o retry usa as mesmas regras do envio (e-mail sem assunto continua recusado)', async () => {
    const { useCases, senders } = buildTestApp();
    const ana = await useCases.createContact.execute(ANA);
    const [n] = await useCases.sendNotification.execute({ contactId: ana.id, channels: ['email'], message: 'sem assunto' });

    // No original, este retry pulava a regra do assunto e "enviava" o e-mail
    // com Subject: null. Agora a regra é uma só, então o retry é recusado.
    await expect(useCases.retryNotification.execute(n.id)).rejects.toThrow(new ChannelRequirementError('email exige subject'));
    expect(senders.email.sent).toHaveLength(0);
  });

  it('notificação inexistente', async () => {
    const { useCases } = buildTestApp();

    await expect(useCases.retryNotification.execute(99)).rejects.toThrow(NotificationNotFoundError);
  });
});

describe('ListNotifications / GetNotification', () => {
  it('filtra e devolve o detalhe com o contato', async () => {
    const { useCases } = buildTestApp();
    const ana = await useCases.createContact.execute(ANA);
    await useCases.sendNotification.execute({ contactId: ana.id, channels: ['fake', 'email'], message: 'sem assunto' });

    const failed = await useCases.listNotifications.execute({ status: 'FAILED' });
    const all = await useCases.listNotifications.execute({ contactId: ana.id });
    const detail = await useCases.getNotification.execute(failed[0].id);

    expect(failed.map((n) => n.channel)).toEqual(['email']);
    expect(all.map((n) => n.channel)).toEqual(['email', 'fake']);
    expect(detail.contact.name).toBe('Ana');
    await expect(useCases.getNotification.execute(99)).rejects.toThrow(NotificationNotFoundError);
  });
});

describe('ETAPA 9 — canal novo sem mexer em domínio nem em caso de uso', () => {
  it('um canal "pombo" registrado no catálogo já funciona nos MESMOS casos de uso', async () => {
    const pombo = new StubSender('pombo');
    const { useCases } = buildTestApp([{ policy: { name: 'pombo', requirementError: () => null }, sender: pombo }]);
    const ana = await useCases.createContact.execute(ANA);

    const [n] = await useCases.sendNotification.execute({ contactId: ana.id, channels: ['pombo'], message: 'Cruu!' });

    expect(n.status).toBe('SENT');
    expect(pombo.sent[0].content.message).toBe('Cruu!');
  });
});
