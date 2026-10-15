import type { CreateContact, GetContact, ListContacts } from './contacts.js';
import type { GetNotification, ListNotifications } from './queries.js';
import type { RetryNotification } from './RetryNotification.js';
import type { SendNotification } from './SendNotification.js';

// Todas as portas de ENTRADA da aplicação, num pacote só. Os adaptadores
// primários (HTTP e CLI) recebem este objeto pronto do composition root e
// só chamam `execute` — não sabem como os casos de uso foram montados.
export interface UseCases {
  createContact: CreateContact;
  listContacts: ListContacts;
  getContact: GetContact;
  sendNotification: SendNotification;
  listNotifications: ListNotifications;
  getNotification: GetNotification;
  retryNotification: RetryNotification;
}
