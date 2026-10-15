import { parseArgs } from 'node:util';
import { DomainError } from '../../domain/errors.js';
import type { UseCases } from '../../application/useCases/index.js';
import { NotificationStatus, type Notification } from '../../domain/Notification.js';

// ETAPA 9 — SEGUNDO ADAPTADOR PRIMÁRIO: linha de comando.
//
// Faz pelo terminal o mesmo que o HTTP faz pela rede, chamando OS MESMOS
// casos de uso. Só muda a "tradução": em vez de req.body → JSON, é
// argumentos do terminal → texto na tela. Domínio e casos de uso não mudaram.
//
// Exemplos (rodar com `npm run cli -- <comando>`):
//   contacts:create --name Ana --email ana@ifrs.edu.br --phone +5551999998888
//   contacts:list
//   send --contact 1 --channels fake,sms,whatsapp --subject "Aviso" --message "Oi!"
//   notifications:list --status failed
//   retry --id 2

const HELP = `Uso: npm run cli -- <comando> [opções]

Comandos:
  contacts:create --name <nome> [--email <e-mail>] [--phone <+55...>] [--opt-out sms,email]
  contacts:list
  send --contact <id> --channels <fake,sms,email,whatsapp> --message <texto> [--subject <assunto>]
  notifications:list [--status sent|failed|pending] [--channel <canal>] [--contact <id>]
  retry --id <id da notificação>`;

export type Output = (line: string) => void;

/** Executa um comando e devolve o código de saída (0 = deu certo). */
export async function runCli(argv: string[], useCases: UseCases, out: Output = console.log): Promise<number> {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      'opt-out': { type: 'string' },
      contact: { type: 'string' },
      channels: { type: 'string' },
      channel: { type: 'string' },
      subject: { type: 'string' },
      message: { type: 'string' },
      status: { type: 'string' },
      id: { type: 'string' },
    },
  });

  try {
    switch (command) {
      case 'contacts:create': {
        const contact = await useCases.createContact.execute({
          name: values.name,
          email: values.email,
          phone: values.phone,
          optOut: values['opt-out'] ? values['opt-out'].split(',') : undefined,
        });
        out(`Contato #${contact.id} criado: ${contact.name}`);
        return 0;
      }
      case 'contacts:list': {
        const contacts = await useCases.listContacts.execute();
        contacts.forEach((c) => out(`#${c.id} ${c.name} — email: ${c.email ?? '-'} — telefone: ${c.phone ?? '-'}`));
        if (contacts.length === 0) out('Nenhum contato.');
        return 0;
      }
      case 'send': {
        if (!values.contact || !values.channels || !values.message) {
          out('Erro: --contact, --channels e --message são obrigatórios');
          return 1;
        }
        const notifications = await useCases.sendNotification.execute({
          contactId: Number(values.contact),
          channels: values.channels.split(','),
          subject: values.subject ?? null,
          message: values.message,
        });
        notifications.forEach((n) => out(describe(n)));
        return 0;
      }
      case 'notifications:list': {
        const notifications = await useCases.listNotifications.execute({
          status: values.status?.toUpperCase(),
          channel: values.channel,
          contactId: values.contact ? Number(values.contact) : undefined,
        });
        notifications.forEach((n) => out(describe(n)));
        if (notifications.length === 0) out('Nenhuma notificação.');
        return 0;
      }
      case 'retry': {
        const { notification, delivered } = await useCases.retryNotification.execute(Number(values.id));
        out(describe(notification));
        return delivered ? 0 : 1;
      }
      default:
        out(HELP);
        return command ? 1 : 0;
    }
  } catch (err) {
    // Mesmo cuidado do HTTP: erro de negócio vira mensagem clara; qualquer
    // outro erro não mostra detalhes internos.
    out(err instanceof DomainError ? `Erro: ${err.message}` : 'Erro interno. Veja o log.');
    if (!(err instanceof DomainError)) console.error(err);
    return 1;
  }
}

function describe(n: Notification): string {
  const data = n.toData();
  const detail = data.status === NotificationStatus.SENT ? `providerId ${data.providerId}` : `motivo: ${data.lastError}`;
  return `#${data.id} [${data.channel}] ${data.status} (tentativas: ${data.attempts}) — ${detail}`;
}
