import { randomUUID } from 'node:crypto';
import type { ChannelPolicy, MessageContent } from '../../domain/Channel.js';
import type { Contact } from '../../domain/Contact.js';
import type { MessageSender } from '../../application/ports/MessageSender.js';

// CANAL "sms".

export const SMS = 'sms';
export const SMS_MAX_LENGTH = 160;

// Política (regras do negócio para SMS, sem nada de provedor): precisa de
// telefone e a mensagem cabe em um SMS.
export const smsPolicy: ChannelPolicy = {
  name: SMS,
  requirementError(contact: Contact, content: MessageContent) {
    if (!contact.phone) {
      return 'contato não possui telefone';
    }
    if (content.message.length > SMS_MAX_LENGTH) {
      return `mensagem de SMS não pode passar de ${SMS_MAX_LENGTH} caracteres`;
    }
    return null;
  },
};

export interface ConsoleSmsOptions {
  /** Probabilidade (0 a 1) de a "operadora" falhar. */
  failureRate: number;
  /** Latência simulada da operadora. */
  latencyMs?: number;
  /** Sorteio injetável: os testes passam uma função fixa, sem aleatoriedade. */
  random?: () => number;
  log?: (text: string) => void;
}

// ADAPTADOR SECUNDÁRIO — a "operadora de SMS" simulada do original: imprime no
// console e falha aleatoriamente. Tudo que era fixo ou aleatório no meio do
// handler (latência, Math.random, console.log) agora entra pelo construtor.
export class ConsoleSmsSender implements MessageSender {
  constructor(private readonly options: ConsoleSmsOptions) {}

  async send(contact: Contact, content: MessageContent): Promise<string> {
    const { failureRate, latencyMs = 150, random = Math.random, log = console.log } = this.options;
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
    if (random() < failureRate) {
      throw new Error('operadora de SMS indisponível');
    }
    log(`[SMS] para ${contact.phone}: ${content.message}`);
    return `sms-${randomUUID().slice(0, 8)}`;
  }
}
