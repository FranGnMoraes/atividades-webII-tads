import type { Contact } from '../../domain/Contact.js';
import { ContactNotFoundError, NotificationNotFoundError } from '../../domain/errors.js';
import type { Notification } from '../../domain/Notification.js';
import type { ContactRepository } from '../ports/ContactRepository.js';
import type { NotificationFilter, NotificationRepository } from '../ports/NotificationRepository.js';

// CASOS DE USO de consulta de notificações.

export class ListNotifications {
  constructor(private readonly notifications: NotificationRepository) {}

  execute(filter: NotificationFilter): Promise<Notification[]> {
    return this.notifications.list(filter);
  }
}

export class GetNotification {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly contacts: ContactRepository,
  ) {}

  async execute(id: number): Promise<{ notification: Notification; contact: Contact }> {
    const notification = await this.notifications.findById(id);
    if (!notification) {
      throw new NotificationNotFoundError();
    }
    const contact = await this.contacts.findById(notification.contactId);
    if (!contact) {
      throw new ContactNotFoundError();
    }
    return { notification, contact };
  }
}
