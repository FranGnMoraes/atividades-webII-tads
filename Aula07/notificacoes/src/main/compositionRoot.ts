import 'dotenv/config';
import type { ContactRepository } from '../application/ports/ContactRepository.js';
import type { NotificationRepository } from '../application/ports/NotificationRepository.js';
import type { MessageSender } from '../application/ports/MessageSender.js';
import type { Clock } from '../application/ports/Clock.js';
import { ChannelCatalog } from '../application/ports/ChannelCatalog.js';
import type { UseCases } from '../application/useCases/index.js';
import { CreateContact, GetContact, ListContacts } from '../application/useCases/contacts.js';
import { GetNotification, ListNotifications } from '../application/useCases/queries.js';
import { RetryNotification } from '../application/useCases/RetryNotification.js';
import { SendNotification } from '../application/useCases/SendNotification.js';
import { InMemoryContactRepository } from '../adapters/memory/InMemoryContactRepository.js';
import { InMemoryNotificationRepository } from '../adapters/memory/InMemoryNotificationRepository.js';
import { FakeInboxSender, fakePolicy } from '../channels/fake/fakeChannel.js';
import { ConsoleSmsSender, smsPolicy } from '../channels/sms/smsChannel.js';
import { ConsoleEmailSender, emailPolicy } from '../channels/email/emailChannel.js';
import {
  NodemailerEmailSender,
  createEtherealTransporter,
  createSmtpTransporter,
} from '../channels/email/nodemailerEmailSender.js';
import { ConsoleWhatsAppSender, whatsappPolicy } from '../channels/whatsapp/whatsappChannel.js';

// =============================================================================
// COMPOSITION ROOT (Etapa 7)
//
// O ÚNICO lugar do projeto que:
//   - lê process.env (em `loadConfig`);
//   - escolhe as implementações concretas (Prisma ou memória; e-mail no
//     console, Ethereal ou SMTP; probabilidade de falha do SMS...);
//   - instancia tudo e conecta cada adaptador à sua porta.
//
// Quem usa: src/index.ts (servidor HTTP) e src/cli.ts (linha de comando).
// As setas de dependência apontam para dentro: este arquivo conhece todo
// mundo, mas domínio e casos de uso não conhecem este arquivo.
// =============================================================================

export interface AppConfig {
  port: number;
  /** "prisma" (SQLite) ou "memory" (Etapa 9: sobe sem banco). */
  persistence: 'prisma' | 'memory';
  databaseUrl?: string;
  smsFailureRate: number;
  /** Latência simulada dos provedores. Os testes usam 0. */
  simulateLatency: boolean;
  /** "console" (simulado), "ethereal" (Nodemailer + conta de teste) ou "smtp". */
  emailProvider: 'console' | 'ethereal' | 'smtp';
  smtp?: { host: string; port: number; user: string; pass: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const persistence = env.PERSISTENCE === 'memory' ? 'memory' : 'prisma';
  if (persistence === 'prisma' && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida');
  }
  const emailProvider = env.EMAIL_PROVIDER === 'ethereal' || env.EMAIL_PROVIDER === 'smtp' ? env.EMAIL_PROVIDER : 'console';

  return {
    port: env.PORT ? Number(env.PORT) : 3007,
    persistence,
    databaseUrl: env.DATABASE_URL,
    smsFailureRate: env.SMS_FAILURE_RATE ? Number(env.SMS_FAILURE_RATE) : 0.2,
    simulateLatency: env.SIMULATE_LATENCY !== 'false',
    emailProvider,
    smtp:
      emailProvider === 'smtp'
        ? {
            host: env.SMTP_HOST ?? '',
            port: Number(env.SMTP_PORT ?? 587),
            user: env.SMTP_USER ?? '',
            pass: env.SMTP_PASS ?? '',
          }
        : undefined,
  };
}

export const systemClock: Clock = { now: () => new Date() };

export interface Application {
  useCases: UseCases;
  fakeInbox: FakeInboxSender;
  close(): Promise<void>;
}

export async function composeApplication(config: AppConfig, clock: Clock = systemClock): Promise<Application> {
  // ---- Persistência ----
  let contacts: ContactRepository;
  let notifications: NotificationRepository;
  let close = async () => {};

  if (config.persistence === 'memory') {
    contacts = new InMemoryContactRepository();
    notifications = new InMemoryNotificationRepository();
  } else {
    // Import dinâmico: com PERSISTENCE=memory, o Prisma nem é carregado.
    const { createPrismaClient } = await import('../adapters/prisma/createPrismaClient.js');
    const { PrismaContactRepository } = await import('../adapters/prisma/PrismaContactRepository.js');
    const { PrismaNotificationRepository } = await import('../adapters/prisma/PrismaNotificationRepository.js');
    const prisma = createPrismaClient(config.databaseUrl!);
    contacts = new PrismaContactRepository(prisma);
    notifications = new PrismaNotificationRepository(prisma);
    close = () => prisma.$disconnect();
  }

  // ---- Canais: cada um = política (regras) + sender (provedor) ----
  const fakeInbox = new FakeInboxSender(() => clock.now());
  const catalog = new ChannelCatalog([
    { policy: fakePolicy, sender: fakeInbox },
    {
      policy: smsPolicy,
      sender: new ConsoleSmsSender({ failureRate: config.smsFailureRate, latencyMs: config.simulateLatency ? 150 : 0 }),
    },
    { policy: emailPolicy, sender: await createEmailSender(config) },
    // Etapa 9: o canal novo entra com UMA linha aqui.
    { policy: whatsappPolicy, sender: new ConsoleWhatsAppSender() },
  ]);

  // ---- Casos de uso ----
  const useCases: UseCases = {
    createContact: new CreateContact(contacts, catalog, clock),
    listContacts: new ListContacts(contacts),
    getContact: new GetContact(contacts),
    sendNotification: new SendNotification(contacts, notifications, catalog, clock),
    listNotifications: new ListNotifications(notifications),
    getNotification: new GetNotification(notifications, contacts),
    retryNotification: new RetryNotification(contacts, notifications, catalog, clock),
  };

  return { useCases, fakeInbox, close };
}

// Etapa 9: o provedor de e-mail é escolhido pela configuração.
async function createEmailSender(config: AppConfig): Promise<MessageSender> {
  if (config.emailProvider === 'ethereal') {
    return new NodemailerEmailSender(await createEtherealTransporter());
  }
  if (config.emailProvider === 'smtp' && config.smtp) {
    return new NodemailerEmailSender(createSmtpTransporter(config.smtp));
  }
  return new ConsoleEmailSender(config.simulateLatency ? 300 : 0);
}
