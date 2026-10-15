import { AlreadySentError, MaxAttemptsReachedError } from './errors.js';
import type { ChannelName, MessageContent } from './Channel.js';

// Os estados possíveis de uma notificação. Antes eram strings soltas
// ('PENDING', 'SENT', 'FAILED') espalhadas pelo arquivo; agora um erro de
// digitação vira erro de compilação.
export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const MAX_ATTEMPTS = 3;

export interface NotificationData {
  id: number;
  contactId: number;
  channel: ChannelName;
  subject: string | null;
  message: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  providerId: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

/** O que é preciso para criar uma notificação nova (o id vem do repositório). */
export type NewNotification = Omit<NotificationData, 'id'>;

// DOMÍNIO — uma notificação e as regras do seu ciclo de vida:
// PENDING → SENT, PENDING → FAILED, FAILED → (retry) → SENT ou FAILED.
export class Notification {
  private constructor(private data: NotificationData) {}

  // Uma notificação nova: PENDING e pronta para tentar o envio, ou já
  // FAILED quando o contato não cumpre a regra do canal (`rejection`). Neste
  // segundo caso nenhuma tentativa foi feita, então `attempts` fica 0.
  static draft(
    contactId: number,
    channel: ChannelName,
    content: MessageContent,
    createdAt: Date,
    rejection: string | null,
  ): NewNotification {
    return {
      contactId,
      channel,
      subject: content.subject,
      message: content.message,
      status: rejection ? NotificationStatus.FAILED : NotificationStatus.PENDING,
      attempts: 0,
      lastError: rejection,
      providerId: null,
      createdAt,
      sentAt: null,
    };
  }

  static restore(data: NotificationData): Notification {
    return new Notification({ ...data });
  }

  get id() {
    return this.data.id;
  }
  get contactId() {
    return this.data.contactId;
  }
  get channel() {
    return this.data.channel;
  }
  get status() {
    return this.data.status;
  }
  get attempts() {
    return this.data.attempts;
  }
  get content(): MessageContent {
    return { subject: this.data.subject, message: this.data.message };
  }

  isPending(): boolean {
    return this.data.status === NotificationStatus.PENDING;
  }

  // "Quando uma notificação pode ser reenviada": só se ainda não foi enviada
  // e se não esgotou as 3 tentativas.
  ensureCanRetry(): void {
    if (this.data.status === NotificationStatus.SENT) {
      throw new AlreadySentError();
    }
    if (this.data.attempts >= MAX_ATTEMPTS) {
      throw new MaxAttemptsReachedError(MAX_ATTEMPTS);
    }
  }

  // Cada tentativa de entrega conta +1, com sucesso ou não.
  markSent(providerId: string, sentAt: Date): void {
    this.data = {
      ...this.data,
      status: NotificationStatus.SENT,
      attempts: this.data.attempts + 1,
      providerId,
      sentAt,
      lastError: null,
    };
  }

  markFailed(error: string): void {
    this.data = {
      ...this.data,
      status: NotificationStatus.FAILED,
      attempts: this.data.attempts + 1,
      lastError: error,
    };
  }

  toData(): NotificationData {
    return { ...this.data };
  }
}
