import { whyCannotSend } from '../../domain/Channel.js';
import {
  ChannelRequirementError,
  ContactNotFoundError,
  NotificationNotFoundError,
  UnknownChannelError,
} from '../../domain/errors.js';
import { NotificationStatus, type Notification } from '../../domain/Notification.js';
import type { ChannelCatalog } from '../ports/ChannelCatalog.js';
import type { Clock } from '../ports/Clock.js';
import type { ContactRepository } from '../ports/ContactRepository.js';
import type { NotificationRepository } from '../ports/NotificationRepository.js';
import { deliver } from './deliver.js';

export interface RetryResult {
  notification: Notification;
  delivered: boolean;
}

// CASO DE USO — reenviar uma notificação que falhou.
//
// Usa as MESMAS regras do envio (`whyCannotSend` e `deliver`). No original as
// validações do retry eram uma cópia incompleta das do envio: faltavam o
// limite de 160 caracteres do SMS e o assunto obrigatório do e-mail. Agora a
// regra é uma só, então o retry também as aplica (ver README, "Divergências").
export class RetryNotification {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly notifications: NotificationRepository,
    private readonly catalog: ChannelCatalog,
    private readonly clock: Clock,
  ) {}

  async execute(notificationId: number): Promise<RetryResult> {
    const notification = await this.notifications.findById(notificationId);
    if (!notification) {
      throw new NotificationNotFoundError();
    }
    notification.ensureCanRetry();

    const contact = await this.contacts.findById(notification.contactId);
    if (!contact) {
      throw new ContactNotFoundError();
    }
    const channel = this.catalog.get(notification.channel);
    if (!channel) {
      // O canal foi desligado na configuração depois de a notificação existir.
      throw new UnknownChannelError(notification.channel);
    }

    // Aqui a regra violada NÃO vira uma notificação FAILED: o reenvio é
    // recusado e nada muda (é o 422 da API).
    const rejection = whyCannotSend(contact, channel.policy, notification.content);
    if (rejection) {
      throw new ChannelRequirementError(rejection);
    }

    await deliver(notification, contact, channel.sender, this.notifications, this.clock);
    return { notification, delivered: notification.status === NotificationStatus.SENT };
  }
}
