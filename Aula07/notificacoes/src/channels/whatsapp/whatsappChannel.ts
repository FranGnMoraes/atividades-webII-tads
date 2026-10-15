import { randomUUID } from 'node:crypto';
import type { ChannelPolicy, MessageContent } from '../../domain/Channel.js';
import type { Contact } from '../../domain/Contact.js';
import type { MessageSender } from '../../application/ports/MessageSender.js';

// ETAPA 9 — CANAL NOVO: WhatsApp (simulado).
//
// Para adicioná-lo foi preciso SÓ:
//   1. este arquivo (a política + o provedor simulado);
//   2. uma linha no composition root registrando o canal no catálogo.
// Nenhum arquivo de src/domain/ nem de src/application/ foi alterado.

export const WHATSAPP = 'whatsapp';
export const WHATSAPP_MAX_LENGTH = 4096;

export const whatsappPolicy: ChannelPolicy = {
  name: WHATSAPP,
  requirementError(contact: Contact, content: MessageContent) {
    if (!contact.phone) {
      return 'contato não possui telefone';
    }
    if (content.message.length > WHATSAPP_MAX_LENGTH) {
      return `mensagem de WhatsApp não pode passar de ${WHATSAPP_MAX_LENGTH} caracteres`;
    }
    return null;
  },
};

export class ConsoleWhatsAppSender implements MessageSender {
  constructor(private readonly log: (text: string) => void = console.log) {}

  async send(contact: Contact, content: MessageContent): Promise<string> {
    this.log(`[WHATSAPP] para ${contact.phone}: ${content.message}`);
    return `wamid.${randomUUID()}`;
  }
}
