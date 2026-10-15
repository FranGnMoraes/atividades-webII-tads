import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, Notification, NotificationStatus } from '../../../src/domain/Notification.js';
import { AlreadySentError, MaxAttemptsReachedError } from '../../../src/domain/errors.js';
import { exceedsRateLimit, rateLimitWindowStart } from '../../../src/domain/RateLimit.js';
import { whyCannotSend } from '../../../src/domain/Channel.js';
import { Contact } from '../../../src/domain/Contact.js';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const content = { subject: null, message: 'oi' };

function existing(overrides: Partial<ReturnType<Notification['toData']>> = {}) {
  return Notification.restore({ ...Notification.draft(1, 'sms', content, NOW, null), id: 1, ...overrides });
}

describe('Notification', () => {
  it('nasce PENDING, sem tentativas', () => {
    expect(Notification.draft(1, 'sms', content, NOW, null)).toMatchObject({ status: 'PENDING', attempts: 0, lastError: null });
  });

  it('nasce FAILED (sem tentativa) quando a regra do canal foi violada', () => {
    expect(Notification.draft(1, 'sms', content, NOW, 'contato não possui telefone')).toMatchObject({
      status: 'FAILED',
      attempts: 0,
      lastError: 'contato não possui telefone',
    });
  });

  it('markSent: SENT, +1 tentativa, guarda providerId e limpa o erro', () => {
    const n = existing({ status: NotificationStatus.FAILED, attempts: 1, lastError: 'caiu' });
    n.markSent('sms-1', NOW);

    expect(n.toData()).toMatchObject({ status: 'SENT', attempts: 2, providerId: 'sms-1', sentAt: NOW, lastError: null });
  });

  it('markFailed: FAILED, +1 tentativa, guarda o motivo', () => {
    const n = existing();
    n.markFailed('operadora caiu');

    expect(n.toData()).toMatchObject({ status: 'FAILED', attempts: 1, lastError: 'operadora caiu' });
  });

  it('não pode reenviar o que já foi enviado', () => {
    expect(() => existing({ status: NotificationStatus.SENT }).ensureCanRetry()).toThrow(AlreadySentError);
  });

  it(`não pode reenviar depois de ${MAX_ATTEMPTS} tentativas`, () => {
    expect(() => existing({ status: NotificationStatus.FAILED, attempts: 3 }).ensureCanRetry()).toThrow(MaxAttemptsReachedError);
    expect(() => existing({ status: NotificationStatus.FAILED, attempts: 2 }).ensureCanRetry()).not.toThrow();
  });
});

describe('limite por minuto', () => {
  it('no máximo 5 por janela', () => {
    expect(exceedsRateLimit(3, 2)).toBe(false);
    expect(exceedsRateLimit(5, 1)).toBe(true);
  });

  it('a janela é o último minuto', () => {
    expect(rateLimitWindowStart(NOW).toISOString()).toBe('2026-10-21T09:59:00.000Z');
  });
});

describe('whyCannotSend (regra geral de todos os canais)', () => {
  const contact = Contact.restore({ id: 1, name: 'Ana', email: null, phone: null, optOut: ['sms'], createdAt: NOW });
  const policy = (name: string, error: string | null) => ({ name, requirementError: () => error });

  it('opt-out vem antes da regra do próprio canal', () => {
    expect(whyCannotSend(contact, policy('sms', 'contato não possui telefone'), content)).toBe('contato optou por não receber sms');
  });

  it('sem opt-out, vale a regra do canal', () => {
    expect(whyCannotSend(contact, policy('email', 'contato não possui email'), content)).toBe('contato não possui email');
    expect(whyCannotSend(contact, policy('fake', null), content)).toBeNull();
  });
});
