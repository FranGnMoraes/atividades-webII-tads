import type { PrismaClient, Notification as NotificationRow } from '@prisma/client';
import { Notification, type NewNotification, type NotificationStatus } from '../../domain/Notification.js';
import type { NotificationFilter, NotificationRepository } from '../../application/ports/NotificationRepository.js';

// ADAPTADOR SECUNDÁRIO — notificações no SQLite, via Prisma.
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(data: NewNotification): Promise<Notification> {
    const row = await this.prisma.notification.create({ data });
    return toDomain(row);
  }

  async update(notification: Notification): Promise<void> {
    const { id, ...data } = notification.toData();
    await this.prisma.notification.update({ where: { id }, data });
  }

  async findById(id: number): Promise<Notification | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter: NotificationFilter): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { status: filter.status, channel: filter.channel, contactId: filter.contactId },
      orderBy: { id: 'desc' },
    });
    return rows.map(toDomain);
  }

  countCreatedSince(contactId: number, since: Date): Promise<number> {
    return this.prisma.notification.count({ where: { contactId, createdAt: { gte: since } } });
  }
}

function toDomain(row: NotificationRow): Notification {
  return Notification.restore({ ...row, status: row.status as NotificationStatus });
}
