import { describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import request from 'supertest';
import { NodemailerEmailSender } from '../../src/channels/email/nodemailerEmailSender.js';
import { Contact } from '../../src/domain/Contact.js';
import { composeApplication, loadConfig } from '../../src/main/compositionRoot.js';
import { createHttpApp } from '../../src/adapters/http/createHttpApp.js';
import { runCli } from '../../src/adapters/cli/runCli.js';
import { FixedClock } from '../helpers/doubles.js';

// ETAPA 9 — provas de que a arquitetura aguenta mudanças sem tocar no
// domínio nem nos casos de uso.

const memoryConfig = loadConfig({ PERSISTENCE: 'memory', SMS_FAILURE_RATE: '0', SIMULATE_LATENCY: 'false' });

describe('Etapa 9', () => {
  it('a aplicação sobe só com repositórios em memória (sem DATABASE_URL, sem Prisma)', async () => {
    const app = await composeApplication(memoryConfig, new FixedClock());
    const http = createHttpApp(app);

    const contact = await request(http).post('/contacts').send({ name: 'Ana', phone: '+5551999998888' });
    const sent = await request(http)
      .post('/notifications')
      .send({ contactId: contact.body.id, channels: ['fake', 'sms'], message: 'oi' });

    expect(memoryConfig.databaseUrl).toBeUndefined();
    expect(sent.status).toBe(201);
    expect(sent.body.map((n: any) => n.status)).toEqual(['SENT', 'SENT']);
  });

  it('canal novo (WhatsApp) disponível pela API, pelos mesmos casos de uso', async () => {
    const app = await composeApplication(memoryConfig);
    const http = createHttpApp(app);
    const contact = await request(http).post('/contacts').send({ name: 'Ana', phone: '+5551999998888' });

    const res = await request(http)
      .post('/notifications')
      .send({ contactId: contact.body.id, channels: ['whatsapp'], message: 'Oi pelo WhatsApp' });

    expect(res.status).toBe(201);
    expect(res.body[0]).toMatchObject({ channel: 'whatsapp', status: 'SENT', providerId: expect.stringMatching(/^wamid\./) });
  });

  it('e-mail de verdade com Nodemailer (transporte JSON nos testes, Ethereal/SMTP na configuração)', async () => {
    // jsonTransport: o Nodemailer monta o e-mail de verdade, mas em vez de
    // mandar por SMTP devolve o resultado — dá para testar sem internet.
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const sender = new NodemailerEmailSender(transporter, 'no-reply@notificacoes.local', () => {});
    const ana = Contact.restore({ id: 1, name: 'Ana', email: 'ana@ifrs.edu.br', phone: null, optOut: [], createdAt: new Date() });

    const messageId = await sender.send(ana, { subject: 'Matrícula', message: 'Confirmada' });

    expect(messageId).toMatch(/^<.+>$/);
  });

  it('o provedor de e-mail é escolhido pela configuração', () => {
    expect(loadConfig({ PERSISTENCE: 'memory' }).emailProvider).toBe('console');
    expect(loadConfig({ PERSISTENCE: 'memory', EMAIL_PROVIDER: 'ethereal' }).emailProvider).toBe('ethereal');
    expect(
      loadConfig({ PERSISTENCE: 'memory', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'sandbox.smtp.mailtrap.io', SMTP_PORT: '2525' }).smtp,
    ).toEqual({ host: 'sandbox.smtp.mailtrap.io', port: 2525, user: '', pass: '' });
  });

  it('sem DATABASE_URL e sem PERSISTENCE=memory: erro claro na subida', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL não definida');
  });

  it('adaptador CLI: cria contato, envia e lista usando os mesmos casos de uso', async () => {
    const { useCases } = await composeApplication(memoryConfig);
    const lines: string[] = [];
    const out = (line: string) => lines.push(line);

    expect(await runCli(['contacts:create', '--name', 'Ana', '--phone', '+5551999998888'], useCases, out)).toBe(0);
    expect(await runCli(['send', '--contact', '1', '--channels', 'fake,whatsapp', '--message', 'Oi'], useCases, out)).toBe(0);
    expect(await runCli(['send', '--contact', '1', '--channels', 'pombo', '--message', 'Oi'], useCases, out)).toBe(1);
    expect(await runCli(['notifications:list', '--status', 'sent'], useCases, out)).toBe(0);

    expect(lines).toContain('Contato #1 criado: Ana');
    expect(lines.some((l) => l.startsWith('#1 [fake] SENT'))).toBe(true);
    expect(lines.some((l) => l.startsWith('#2 [whatsapp] SENT'))).toBe(true);
    expect(lines).toContain('Erro: canal desconhecido: pombo');
  });

  it('CLI: ajuda, campos faltando e retry', async () => {
    const { useCases } = await composeApplication(memoryConfig);
    const lines: string[] = [];
    const out = (line: string) => lines.push(line);

    expect(await runCli([], useCases, out)).toBe(0);
    expect(await runCli(['send'], useCases, out)).toBe(1);
    expect(await runCli(['retry', '--id', '99'], useCases, out)).toBe(1);

    expect(lines[0]).toContain('Uso: npm run cli');
    expect(lines).toContain('Erro: notificação não encontrada');
  });
});
