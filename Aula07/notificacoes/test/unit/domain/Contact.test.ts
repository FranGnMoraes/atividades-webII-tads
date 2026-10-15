import { describe, expect, it } from 'vitest';
import { Contact } from '../../../src/domain/Contact.js';
import { ValidationError } from '../../../src/domain/errors.js';

// DOMÍNIO puro: nada de banco, HTTP ou provedor.
const CHANNELS = ['fake', 'sms', 'email'];

describe('Contact.validateNew', () => {
  it('aceita um contato válido e limpa o nome', () => {
    expect(Contact.validateNew({ name: '  Ana ', email: 'ana@ifrs.edu.br' }, CHANNELS)).toEqual({
      name: 'Ana',
      email: 'ana@ifrs.edu.br',
      phone: null,
      optOut: [],
    });
  });

  it.each([
    [{ email: 'a@b.co' }, 'name é obrigatório (mínimo 2 caracteres)'],
    [{ name: ' A ', email: 'a@b.co' }, 'name é obrigatório (mínimo 2 caracteres)'],
    [{ name: 'Ana', email: 'sem-arroba' }, 'email inválido'],
    [{ name: 'Ana', phone: '51999998888' }, 'phone deve estar no formato E.164 (ex.: +5551999998888)'],
    [{ name: 'Ana' }, 'informe ao menos email ou phone'],
    [{ name: 'Ana', email: 'a@b.co', optOut: 'sms' }, 'optOut deve ser uma lista com: fake, sms, email'],
    [{ name: 'Ana', email: 'a@b.co', optOut: ['pombo'] }, 'optOut deve ser uma lista com: fake, sms, email'],
  ])('rejeita %j', (input, message) => {
    expect(() => Contact.validateNew(input, CHANNELS)).toThrow(new ValidationError(message));
  });

  it('a lista de canais aceitos no optOut vem de fora (canal novo não muda o domínio)', () => {
    expect(Contact.validateNew({ name: 'Ana', phone: '+5551999998888', optOut: ['whatsapp'] }, [...CHANNELS, 'whatsapp']).optOut).toEqual([
      'whatsapp',
    ]);
  });
});

describe('Contact', () => {
  it('sabe se o contato recusou um canal', () => {
    const contact = Contact.restore({ id: 1, name: 'Ana', email: null, phone: '+5551999998888', optOut: ['sms'], createdAt: new Date() });

    expect(contact.hasOptedOutOf('sms')).toBe(true);
    expect(contact.hasOptedOutOf('fake')).toBe(false);
  });
});
