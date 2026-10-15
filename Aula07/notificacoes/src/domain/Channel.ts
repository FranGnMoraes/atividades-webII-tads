import type { Contact } from './Contact.js';

// DOMÍNIO — o que é um canal, do ponto de vista do negócio.
//
// O nome do canal é um texto ("fake", "sms", "email", "whatsapp"...) e NÃO uma
// lista fechada aqui dentro: se fosse um `'fake' | 'sms' | 'email'`, criar um
// canal novo obrigaria a mexer no domínio, e a Etapa 9 pede justamente o
// contrário. Quem sabe quais canais existem é o catálogo montado no
// composition root (src/main/compositionRoot.ts). O compilador continua
// ajudando: cada canal declara o próprio nome numa constante.
export type ChannelName = string;

/** O conteúdo de uma notificação, igual para todos os canais. */
export interface MessageContent {
  subject: string | null;
  message: string;
}

// As regras ESPECÍFICAS de cada canal (SMS exige telefone e no máximo 160
// caracteres; e-mail exige endereço e assunto...) ficam em uma "política" por
// canal, em src/channels/<canal>/policy.ts. O domínio só conhece este
// contrato: "me diga se dá para mandar este conteúdo para este contato".
// Assim o domínio fica sabendo das regras do canal sem conhecer o provedor
// que entrega a mensagem (console, Nodemailer, operadora...).
export interface ChannelPolicy {
  readonly name: ChannelName;
  /** `null` = pode enviar; texto = o motivo de não poder. */
  requirementError(contact: Contact, content: MessageContent): string | null;
}

// Regra geral, igual para TODOS os canais, e que no original estava copiada
// em dois lugares (enviar e reenviar): primeiro o opt-out do contato, depois o
// que o próprio canal exige. Agora existe só aqui.
export function whyCannotSend(contact: Contact, policy: ChannelPolicy, content: MessageContent): string | null {
  if (contact.hasOptedOutOf(policy.name)) {
    return `contato optou por não receber ${policy.name}`;
  }
  return policy.requirementError(contact, content);
}
