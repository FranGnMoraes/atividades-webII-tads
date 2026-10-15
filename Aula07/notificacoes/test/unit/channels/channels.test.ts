import { describe, expect, it } from 'vitest';
import { Contact } from '../../../src/domain/Contact.js';
import { smsPolicy, ConsoleSmsSender } from '../../../src/channels/sms/smsChannel.js';
import { emailPolicy, ConsoleEmailSender } from '../../../src/channels/email/emailChannel.js';
import { fakePolicy, FakeInboxSender } from '../../../src/channels/fake/fakeChannel.js';
import { whatsappPolicy, ConsoleWhatsAppSender } from '../../../src/channels/whatsapp/whatsappChannel.js';

function contact(data: { email?: string | null; phone?: string | null } = {}) {
  return Contact.restore({
    id: 7,
    name: 'Ana',
    email: data.email === undefined ? 'ana@ifrs.edu.br' : data.email,
    phone: data.phone === undefined ? '+5551999998888' : data.phone,
    optOut: [],
    createdAt: new Date(),
  });
}
const msg = (message: string, subject: string | null = null) => ({ subject, message });
const silent = () => {};

describe('políticas dos canais (regras de negócio de cada canal)', () => {
  it('fake não exige nada', () => {
    expect(fakePolicy.requirementError(contact({ email: null, phone: null }), msg('oi'))).toBeNull();
  });

  it('sms: telefone obrigatório e até 160 caracteres', () => {
    expect(smsPolicy.requirementError(contact({ phone: null }), msg('oi'))).toBe('contato não possui telefone');
    expect(smsPolicy.requirementError(contact(), msg('x'.repeat(161)))).toBe('mensagem de SMS não pode passar de 160 caracteres');
    expect(smsPolicy.requirementError(contact(), msg('x'.repeat(160)))).toBeNull();
  });

  it('email: endereço e assunto obrigatórios', () => {
    expect(emailPolicy.requirementError(contact({ email: null }), msg('oi', 'S'))).toBe('contato não possui email');
    expect(emailPolicy.requirementError(contact(), msg('oi'))).toBe('email exige subject');
    expect(emailPolicy.requirementError(contact(), msg('oi', 'S'))).toBeNull();
  });

  it('whatsapp (canal novo da Etapa 9): telefone obrigatório e até 4096 caracteres', () => {
    expect(whatsappPolicy.requirementError(contact({ phone: null }), msg('oi'))).toBe('contato não possui telefone');
    expect(whatsappPolicy.requirementError(contact(), msg('x'.repeat(4097)))).toMatch(/4096/);
    expect(whatsappPolicy.requirementError(contact(), msg('oi'))).toBeNull();
  });
});

describe('provedores simulados', () => {
  it('SMS: com sorteio controlado, falha ou entrega sem aleatoriedade', async () => {
    const failing = new ConsoleSmsSender({ failureRate: 0.5, latencyMs: 0, random: () => 0.1, log: silent });
    const ok = new ConsoleSmsSender({ failureRate: 0.5, latencyMs: 0, random: () => 0.9, log: silent });

    await expect(failing.send(contact(), msg('oi'))).rejects.toThrow('operadora de SMS indisponível');
    await expect(ok.send(contact(), msg('oi'))).resolves.toMatch(/^sms-[0-9a-f]{8}$/);
  });

  it('e-mail no console: devolve um Message-ID', async () => {
    const lines: string[] = [];
    const id = await new ConsoleEmailSender(0, (l) => lines.push(l)).send(contact(), msg('Corpo', 'Assunto'));

    expect(id).toMatch(/^<.+@notificacoes\.local>$/);
    expect(lines[0]).toContain('Subject: Assunto');
  });

  it('fake: entrega na caixa de entrada do contato', async () => {
    const at = new Date('2026-10-21T10:00:00.000Z');
    const inbox = new FakeInboxSender(() => at);
    const id = await inbox.send(contact(), msg('oi', 'S'));

    expect(inbox.messagesFor(7)).toEqual([{ id, contactId: 7, subject: 'S', message: 'oi', receivedAt: at }]);
    expect(inbox.messagesFor(8)).toEqual([]);
  });

  it('whatsapp: entrega simulada', async () => {
    await expect(new ConsoleWhatsAppSender(silent).send(contact(), msg('oi'))).resolves.toMatch(/^wamid\./);
  });
});
