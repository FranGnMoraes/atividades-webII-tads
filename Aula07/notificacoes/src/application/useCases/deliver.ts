import type { Contact } from '../../domain/Contact.js';
import type { Notification } from '../../domain/Notification.js';
import type { MessageSender } from '../ports/MessageSender.js';
import type { NotificationRepository } from '../ports/NotificationRepository.js';
import type { Clock } from '../ports/Clock.js';

// A tentativa de entrega, usada por ENVIAR e por REENVIAR. No arquivo original
// este trecho (chamar o provedor, marcar SENT ou FAILED, salvar) estava
// copiado e colado nos dois handlers; agora existe só aqui.
export async function deliver(
  notification: Notification,
  contact: Contact,
  sender: MessageSender,
  notifications: NotificationRepository,
  clock: Clock,
): Promise<void> {
  try {
    const providerId = await sender.send(contact, notification.content);
    notification.markSent(providerId, clock.now());
  } catch (err) {
    notification.markFailed(err instanceof Error ? err.message : String(err));
  }
  await notifications.update(notification);
}
