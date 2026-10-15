import type { Contact } from '../../domain/Contact.js';
import type { Notification } from '../../domain/Notification.js';

// Tradução domínio → JSON. É aqui que o FORMATO das respostas da versão
// original é preservado (o contrato da Etapa 0).

export function contactJson(contact: Contact) {
  const { id, name, email, phone, optOut, createdAt } = contact.toData();
  return { id, name, email, phone, optOut, createdAt };
}

export function notificationJson(notification: Notification) {
  return notification.toData();
}

// No original, GET /notifications/:id devolvia o contato como estava no banco,
// com `optOut` em texto ("sms,email") e não em lista, como nas rotas de
// contato. É uma inconsistência do original, mas faz parte do contrato, então
// foi mantida (ver README, "Divergências encontradas").
export function notificationDetailJson(notification: Notification, contact: Contact) {
  return {
    ...notificationJson(notification),
    contact: { ...contactJson(contact), optOut: contact.optOut.join(',') },
  };
}
