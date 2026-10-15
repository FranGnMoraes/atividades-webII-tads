import type { Clock } from '../../src/application/ports/Clock.js';
import type { MessageSender } from '../../src/application/ports/MessageSender.js';
import { ChannelCatalog } from '../../src/application/ports/ChannelCatalog.js';
import type { ChannelPolicy, MessageContent } from '../../src/domain/Channel.js';
import type { Contact } from '../../src/domain/Contact.js';
import { InMemoryContactRepository } from '../../src/adapters/memory/InMemoryContactRepository.js';
import { InMemoryNotificationRepository } from '../../src/adapters/memory/InMemoryNotificationRepository.js';
import { fakePolicy } from '../../src/channels/fake/fakeChannel.js';
import { smsPolicy } from '../../src/channels/sms/smsChannel.js';
import { emailPolicy } from '../../src/channels/email/emailChannel.js';
import { CreateContact, GetContact, ListContacts } from '../../src/application/useCases/contacts.js';
import { GetNotification, ListNotifications } from '../../src/application/useCases/queries.js';
import { SendNotification } from '../../src/application/useCases/SendNotification.js';
import { RetryNotification } from '../../src/application/useCases/RetryNotification.js';
import type { UseCases } from '../../src/application/useCases/index.js';

// DUBLÊS para os testes de casos de uso: sem banco, sem HTTP, sem relógio
// real e sem aleatoriedade.

/** Relógio parado, que o teste avança quando quiser. */
export class FixedClock implements Clock {
  constructor(private current = new Date('2026-10-21T10:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Provedor de mentira: lembra o que "enviou" e falha quando mandarem. */
export class StubSender implements MessageSender {
  public readonly sent: { contactId: number; content: MessageContent }[] = [];
  public failWith: string | null = null;
  private counter = 0;

  constructor(private readonly prefix: string) {}

  async send(contact: Contact, content: MessageContent): Promise<string> {
    if (this.failWith) {
      throw new Error(this.failWith);
    }
    this.sent.push({ contactId: contact.id, content });
    return `${this.prefix}-${++this.counter}`;
  }
}

/** Monta os casos de uso com repositórios em memória e dublês de envio. */
export function buildTestApp(extraChannels: { policy: ChannelPolicy; sender: MessageSender }[] = []) {
  const clock = new FixedClock();
  const contacts = new InMemoryContactRepository();
  const notifications = new InMemoryNotificationRepository();
  const senders = { fake: new StubSender('fake'), sms: new StubSender('sms'), email: new StubSender('email') };
  const catalog = new ChannelCatalog([
    { policy: fakePolicy, sender: senders.fake },
    { policy: smsPolicy, sender: senders.sms },
    { policy: emailPolicy, sender: senders.email },
    ...extraChannels,
  ]);

  const useCases: UseCases = {
    createContact: new CreateContact(contacts, catalog, clock),
    listContacts: new ListContacts(contacts),
    getContact: new GetContact(contacts),
    sendNotification: new SendNotification(contacts, notifications, catalog, clock),
    listNotifications: new ListNotifications(notifications),
    getNotification: new GetNotification(notifications, contacts),
    retryNotification: new RetryNotification(contacts, notifications, catalog, clock),
  };

  return { useCases, clock, contacts, notifications, senders, catalog };
}

export const ANA = { name: 'Ana', email: 'ana@ifrs.edu.br', phone: '+5551999998888' };
