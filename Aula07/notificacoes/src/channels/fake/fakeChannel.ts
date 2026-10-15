import { randomUUID } from 'node:crypto';
import type { ChannelPolicy, MessageContent } from '../../domain/Channel.js';
import type { Contact } from '../../domain/Contact.js';
import type { MessageSender } from '../../application/ports/MessageSender.js';

// CANAL "fake": serve para testar e demonstrar sem nenhum serviço externo.

export const FAKE = 'fake';

// Política: o canal fake não exige nada do contato.
export const fakePolicy: ChannelPolicy = {
  name: FAKE,
  requirementError: () => null,
};

export interface InboxMessage {
  id: string;
  contactId: number;
  subject: string | null;
  message: string;
  receivedAt: Date;
}

// ADAPTADOR SECUNDÁRIO (implementa MessageSender): a "entrega" é guardar a
// mensagem numa caixa de entrada em memória. A rota GET /fake-inbox/:contactId
// lê daqui. Essa caixa não é regra de negócio — é uma ferramenta para
// inspecionar o provedor fake —, por isso não passa por caso de uso: o
// composition root entrega esta mesma instância ao adaptador HTTP.
export class FakeInboxSender implements MessageSender {
  private readonly inbox: InboxMessage[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async send(contact: Contact, content: MessageContent): Promise<string> {
    const id = `fake-${randomUUID()}`;
    this.inbox.push({ id, contactId: contact.id, subject: content.subject, message: content.message, receivedAt: this.now() });
    return id;
  }

  messagesFor(contactId: number): InboxMessage[] {
    return this.inbox.filter((m) => m.contactId === contactId);
  }
}
