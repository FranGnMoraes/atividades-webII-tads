import { whyCannotSend, type ChannelName } from '../../domain/Channel.js';
import { ContactNotFoundError, RateLimitExceededError, UnknownChannelError } from '../../domain/errors.js';
import { Notification } from '../../domain/Notification.js';
import { RATE_LIMIT, exceedsRateLimit, rateLimitWindowStart } from '../../domain/RateLimit.js';
import type { ChannelCatalog } from '../ports/ChannelCatalog.js';
import type { Clock } from '../ports/Clock.js';
import type { ContactRepository } from '../ports/ContactRepository.js';
import type { NotificationRepository } from '../ports/NotificationRepository.js';
import { deliver } from './deliver.js';

export interface SendNotificationInput {
  contactId: number;
  channels: ChannelName[];
  subject?: string | null;
  message: string;
}

// CASO DE USO (porta de entrada) — enviar uma notificação por um ou mais
// canais. Não sabe se foi chamado por HTTP ou pela linha de comando: recebe
// dados simples e devolve as notificações criadas.
export class SendNotification {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly notifications: NotificationRepository,
    private readonly catalog: ChannelCatalog,
    private readonly clock: Clock,
  ) {}

  async execute(input: SendNotificationInput): Promise<Notification[]> {
    for (const name of input.channels) {
      if (!this.catalog.has(name)) {
        throw new UnknownChannelError(name);
      }
    }

    const contact = await this.contacts.findById(input.contactId);
    if (!contact) {
      throw new ContactNotFoundError();
    }

    // Canal repetido na lista conta uma vez só (é enviado uma vez só).
    const channels = [...new Set(input.channels)];
    const now = this.clock.now();
    const recent = await this.notifications.countCreatedSince(contact.id, rateLimitWindowStart(now));
    if (exceedsRateLimit(recent, channels.length)) {
      throw new RateLimitExceededError(RATE_LIMIT.maxPerWindow);
    }

    const content = { subject: input.subject ?? null, message: input.message };
    const results: Notification[] = [];

    for (const name of channels) {
      const channel = this.catalog.get(name)!;
      // Regra de canal violada: a notificação é gravada como FAILED, sem
      // tentativa de envio (o resto dos canais continua normalmente).
      const rejection = whyCannotSend(contact, channel.policy, content);
      const notification = await this.notifications.add(Notification.draft(contact.id, name, content, now, rejection));

      if (notification.isPending()) {
        await deliver(notification, contact, channel.sender, this.notifications, this.clock);
      }
      results.push(notification);
    }

    return results;
  }
}
