import type { NewNotification, Notification, NotificationStatus } from '../../domain/Notification.js';
import type { ChannelName } from '../../domain/Channel.js';

// PORTA DE SAÍDA — guardar e buscar notificações.
export interface NotificationFilter {
  status?: NotificationStatus | string;
  channel?: ChannelName;
  contactId?: number;
}

export interface NotificationRepository {
  add(data: NewNotification): Promise<Notification>;
  update(notification: Notification): Promise<void>;
  findById(id: number): Promise<Notification | null>;
  /** Do mais novo para o mais antigo (id decrescente). */
  list(filter: NotificationFilter): Promise<Notification[]>;
  /** Quantas notificações o contato recebeu a partir de `since` (limite por minuto). */
  countCreatedSince(contactId: number, since: Date): Promise<number>;
}
