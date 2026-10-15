import { randomUUID } from 'node:crypto';
import type { ChannelPolicy, MessageContent } from '../../domain/Channel.js';
import type { Contact } from '../../domain/Contact.js';
import type { MessageSender } from '../../application/ports/MessageSender.js';

// CANAL "email". A política é UMA só; os provedores são dois (console e
// Nodemailer, em nodemailerEmailSender.ts), escolhidos no composition root.

export const EMAIL = 'email';
export const EMAIL_FROM = 'no-reply@notificacoes.local';

export const emailPolicy: ChannelPolicy = {
  name: EMAIL,
  requirementError(contact: Contact, content: MessageContent) {
    if (!contact.email) {
      return 'contato não possui email';
    }
    if (!content.subject) {
      return 'email exige subject';
    }
    return null;
  },
};

// ADAPTADOR SECUNDÁRIO — o "SMTP" simulado do original: só imprime no console.
export class ConsoleEmailSender implements MessageSender {
  constructor(
    private readonly latencyMs = 300,
    private readonly log: (text: string) => void = console.log,
  ) {}

  async send(contact: Contact, content: MessageContent): Promise<string> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    this.log(
      `[EMAIL] From: ${EMAIL_FROM}\n        To: ${contact.name} <${contact.email}>\n        Subject: ${content.subject}\n\n        ${content.message}`,
    );
    return `<${randomUUID()}@notificacoes.local>`;
  }
}
