import { Notification, type NewNotification, type NotificationData } from '../../domain/Notification.js';
import type { NotificationFilter, NotificationRepository } from '../../application/ports/NotificationRepository.js';

// ADAPTADOR SECUNDÁRIO — notificações em memória (ver InMemoryContactRepository).
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly rows = new Map<number, NotificationData>();
  private nextId = 1;

  async add(data: NewNotification): Promise<Notification> {
    const row: NotificationData = { id: this.nextId++, ...data };
    this.rows.set(row.id, row);
    return Notification.restore(row);
  }

  async update(notification: Notification): Promise<void> {
    this.rows.set(notification.id, notification.toData());
  }

  async findById(id: number): Promise<Notification | null> {
    const row = this.rows.get(id);
    return row ? Notification.restore(row) : null;
  }

  async list(filter: NotificationFilter): Promise<Notification[]> {
    return [...this.rows.values()]
      .filter((row) => filter.status === undefined || row.status === filter.status)
      .filter((row) => filter.channel === undefined || row.channel === filter.channel)
      .filter((row) => filter.contactId === undefined || row.contactId === filter.contactId)
      .sort((a, b) => b.id - a.id)
      .map((row) => Notification.restore(row));
  }

  async countCreatedSince(contactId: number, since: Date): Promise<number> {
    return [...this.rows.values()].filter((row) => row.contactId === contactId && row.createdAt >= since).length;
  }
}
