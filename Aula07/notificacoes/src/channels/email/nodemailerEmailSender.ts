import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import type { MessageContent } from '../../domain/Channel.js';
import type { Contact } from '../../domain/Contact.js';
import type { MessageSender } from '../../application/ports/MessageSender.js';
import { EMAIL_FROM } from './emailChannel.js';

// ETAPA 9 — provedor de e-mail DE VERDADE, com Nodemailer.
//
// Implementa a mesma porta (MessageSender) que o ConsoleEmailSender e usa a
// mesma política de e-mail. Trocar um pelo outro é só configuração
// (EMAIL_PROVIDER no .env); domínio e casos de uso não mudam.
//
// Com o Ethereal (https://ethereal.email), o e-mail é aceito por um SMTP de
// teste e não chega a ninguém, mas dá para abrir a mensagem num link de
// pré-visualização, que é impresso no console.
export class NodemailerEmailSender implements MessageSender {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string = EMAIL_FROM,
    private readonly log: (text: string) => void = console.log,
  ) {}

  async send(contact: Contact, content: MessageContent): Promise<string> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: `${contact.name} <${contact.email}>`,
      subject: content.subject ?? '',
      text: content.message,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      this.log(`[EMAIL] enviado via Ethereal. Veja em: ${previewUrl}`);
    }
    // O SMTP devolve um Message-ID no formato <...@...>, igual ao que o
    // provedor simulado já devolvia.
    return info.messageId;
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/** Transporter para um SMTP qualquer (Mailtrap, Gmail, o do IFRS...). */
export function createSmtpTransporter(settings: SmtpSettings): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    auth: { user: settings.user, pass: settings.pass },
  });
}

/** Cria na hora uma conta de teste no Ethereal (precisa de internet). */
export async function createEtherealTransporter(): Promise<Transporter> {
  const account = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  });
}
