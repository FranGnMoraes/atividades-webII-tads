import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ContactRepository } from '../../src/application/ports/ContactRepository.js';
import type { NotificationRepository } from '../../src/application/ports/NotificationRepository.js';
import { InMemoryContactRepository } from '../../src/adapters/memory/InMemoryContactRepository.js';
import { InMemoryNotificationRepository } from '../../src/adapters/memory/InMemoryNotificationRepository.js';
import { PrismaContactRepository } from '../../src/adapters/prisma/PrismaContactRepository.js';
import { PrismaNotificationRepository } from '../../src/adapters/prisma/PrismaNotificationRepository.js';
import { createPrismaClient } from '../../src/adapters/prisma/createPrismaClient.js';
import { Notification } from '../../src/domain/Notification.js';
import { TEST_DB_URL } from './globalSetup.js';

// A MESMA bateria de testes roda contra as duas implementações das portas de
// persistência (Prisma e memória). Se as duas passam, elas são trocáveis —
// é isso que permite subir a aplicação só com memória (Etapa 9).
const prisma = createPrismaClient(TEST_DB_URL);
afterAll(() => prisma.$disconnect());

const implementations: [string, () => Promise<{ contacts: ContactRepository; notifications: NotificationRepository }>][] = [
  ['memória', async () => ({ contacts: new InMemoryContactRepository(), notifications: new InMemoryNotificationRepository() })],
  [
    'Prisma (SQLite)',
    async () => {
      await prisma.notification.deleteMany();
      await prisma.contact.deleteMany();
      return { contacts: new PrismaContactRepository(prisma), notifications: new PrismaNotificationRepository(prisma) };
    },
  ],
];

const T0 = new Date('2026-10-21T10:00:00.000Z');
const content = { subject: 'S', message: 'oi' };

describe.each(implementations)('repositórios — %s', (_name, create) => {
  let contacts: ContactRepository;
  let notifications: NotificationRepository;

  beforeEach(async () => {
    ({ contacts, notifications } = await create());
  });

  it('contatos: cria, busca (optOut como lista) e lista em ordem de id', async () => {
    const ana = await contacts.add({ name: 'Ana', email: 'a@b.co', phone: null, optOut: ['sms', 'email'], createdAt: T0 });
    const beto = await contacts.add({ name: 'Beto', email: null, phone: '+5551999998888', optOut: [], createdAt: T0 });

    expect((await contacts.findById(ana.id))?.toData()).toEqual({
      id: ana.id,
      name: 'Ana',
      email: 'a@b.co',
      phone: null,
      optOut: ['sms', 'email'],
      createdAt: T0,
    });
    expect((await contacts.findById(beto.id))?.optOut).toEqual([]);
    expect((await contacts.list()).map((c) => c.name)).toEqual(['Ana', 'Beto']);
    expect(await contacts.findById(-1)).toBeNull();
  });

  it('notificações: cria, atualiza, busca, filtra e conta por janela de tempo', async () => {
    const ana = await contacts.add({ name: 'Ana', email: 'a@b.co', phone: null, optOut: [], createdAt: T0 });
    const old = await notifications.add(Notification.draft(ana.id, 'fake', content, new Date(T0.getTime() - 120_000), null));
    const sms = await notifications.add(Notification.draft(ana.id, 'sms', content, T0, 'contato não possui telefone'));

    old.markSent('fake-1', T0);
    await notifications.update(old);

    expect((await notifications.findById(old.id))?.toData()).toMatchObject({ status: 'SENT', attempts: 1, providerId: 'fake-1', sentAt: T0 });
    expect((await notifications.list({})).map((n) => n.id)).toEqual([sms.id, old.id]);
    expect((await notifications.list({ status: 'FAILED' })).map((n) => n.channel)).toEqual(['sms']);
    expect((await notifications.list({ channel: 'fake', contactId: ana.id })).map((n) => n.id)).toEqual([old.id]);
    expect(await notifications.countCreatedSince(ana.id, new Date(T0.getTime() - 60_000))).toBe(1);
    expect(await notifications.findById(-1)).toBeNull();
  });
});
