import type { Contact } from '../../domain/Contact.js';
import type { MessageContent } from '../../domain/Channel.js';

// PORTA DE SAÍDA — entregar uma mensagem por UM canal.
//
// Granularidade: uma única interface, pequena, e uma implementação por canal
// (fake, SMS, e-mail no console, e-mail de verdade com Nodemailer, WhatsApp).
// O caso de uso não tem `if (canal === 'sms')`: ele pede ao catálogo o canal
// pelo nome e chama `send`. Adicionar um canal = escrever uma classe nova que
// implementa isto e registrá-la no composition root.
//
// Devolve o id que o provedor deu para a mensagem (`providerId`). Se não
// conseguir entregar, lança um Error com o motivo (ex.: "operadora de SMS
// indisponível"), que vira o `lastError` da notificação.
export interface MessageSender {
  send(contact: Contact, content: MessageContent): Promise<string>;
}
