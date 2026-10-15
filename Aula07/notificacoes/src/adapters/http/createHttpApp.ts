import express, { type Express, type Request } from 'express';
import type { UseCases } from '../../application/useCases/index.js';
import { BadRequestError, errorHandler } from './errorHandler.js';
import { contactJson, notificationDetailJson, notificationJson } from './presenters.js';

/** O que o adaptador HTTP precisa: os casos de uso e a caixa do canal fake. */
export interface HttpDependencies {
  useCases: UseCases;
  fakeInbox: { messagesFor(contactId: number): unknown[] };
}

// ADAPTADOR PRIMÁRIO (driving) — HTTP com Express. Cada rota é "fina":
//   1. traduz a requisição para a entrada do caso de uso (e valida o FORMATO);
//   2. chama o caso de uso;
//   3. traduz a saída para JSON + status.
// Nenhuma regra de negócio mora aqui. Erros são tratados em errorHandler.ts.
// (Express 5 já encaminha para o errorHandler o erro de um handler async.)
export function createHttpApp({ useCases, fakeInbox }: HttpDependencies): Express {
  const app = express();
  app.use(express.json());

  // ---- Contatos ----
  app.post('/contacts', async (req, res) => {
    const contact = await useCases.createContact.execute(req.body ?? {});
    res.status(201).json(contactJson(contact));
  });

  app.get('/contacts', async (_req, res) => {
    const contacts = await useCases.listContacts.execute();
    res.json(contacts.map(contactJson));
  });

  app.get('/contacts/:id', async (req, res) => {
    const contact = await useCases.getContact.execute(idParam(req));
    res.json(contactJson(contact));
  });

  // ---- Notificações ----
  app.post('/notifications', async (req, res) => {
    const { contactId, channels, subject, message } = req.body ?? {};
    // Validação de FORMATO (é do adaptador): os campos existem e têm o tipo certo.
    if (!contactId || !Array.isArray(channels) || channels.length === 0 || !message) {
      throw new BadRequestError('contactId, channels (lista) e message são obrigatórios');
    }
    const notifications = await useCases.sendNotification.execute({
      contactId: toId(contactId),
      channels: channels.map(String),
      subject: subject ?? null,
      message: String(message),
    });
    res.status(201).json(notifications.map(notificationJson));
  });

  app.get('/notifications', async (req, res) => {
    const { status, channel, contactId } = req.query;
    if (contactId !== undefined && !Number.isInteger(Number(contactId))) {
      throw new BadRequestError('contactId deve ser um número inteiro');
    }
    const notifications = await useCases.listNotifications.execute({
      status: status ? String(status).toUpperCase() : undefined,
      channel: channel ? String(channel) : undefined,
      contactId: contactId ? Number(contactId) : undefined,
    });
    res.json(notifications.map(notificationJson));
  });

  app.get('/notifications/:id', async (req, res) => {
    const { notification, contact } = await useCases.getNotification.execute(idParam(req));
    res.json(notificationDetailJson(notification, contact));
  });

  app.post('/notifications/:id/retry', async (req, res) => {
    const { notification, delivered } = await useCases.retryNotification.execute(idParam(req));
    // 502 = o provedor (um serviço "de fora") falhou de novo.
    res.status(delivered ? 200 : 502).json(notificationJson(notification));
  });

  // ---- Caixa de entrada do canal fake (ferramenta de inspeção, não é negócio) ----
  app.get('/fake-inbox/:contactId', (req, res) => {
    res.json(fakeInbox.messagesFor(Number(req.params.contactId)));
  });

  app.use(errorHandler);
  return app;
}

// Um id que não é número não existe: o caso de uso responde "não encontrado".
// (No original, `/contacts/abc` virava um erro do Prisma com stack trace.)
function idParam(req: Request): number {
  return toId(req.params.id);
}

function toId(value: unknown): number {
  const id = Number(value);
  return Number.isInteger(id) ? id : -1;
}
