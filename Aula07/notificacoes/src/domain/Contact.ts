import { ValidationError } from './errors.js';
import type { ChannelName } from './Channel.js';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_E164 = /^\+\d{10,15}$/;

export interface ContactData {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  optOut: ChannelName[];
  createdAt: Date;
}

export interface NewContactInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  optOut?: unknown;
}

// DOMÍNIO — um contato. Aqui mora "o que torna um contato válido", que no
// arquivo original estava dentro do handler do POST /contacts. Não importa
// Express nem Prisma: é TypeScript puro, testável sem nada em volta.
export class Contact {
  private constructor(private readonly data: ContactData) {}

  // Valida um contato novo, na mesma ordem e com as mesmas mensagens do
  // original. `knownChannels` vem de fora (do catálogo de canais) porque a
  // lista de canais pode crescer sem mexer no domínio (Etapa 9).
  static validateNew(input: NewContactInput, knownChannels: readonly ChannelName[]) {
    const { name, email, phone, optOut } = input;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new ValidationError('name é obrigatório (mínimo 2 caracteres)');
    }
    if (email && (typeof email !== 'string' || !EMAIL_FORMAT.test(email))) {
      throw new ValidationError('email inválido');
    }
    if (phone && (typeof phone !== 'string' || !PHONE_E164.test(phone))) {
      throw new ValidationError('phone deve estar no formato E.164 (ex.: +5551999998888)');
    }
    if (!email && !phone) {
      throw new ValidationError('informe ao menos email ou phone');
    }
    if (optOut && (!Array.isArray(optOut) || optOut.some((c) => !knownChannels.includes(c)))) {
      throw new ValidationError(`optOut deve ser uma lista com: ${knownChannels.join(', ')}`);
    }

    return {
      name: name.trim(),
      email: (email as string | undefined) || null,
      phone: (phone as string | undefined) || null,
      optOut: (optOut as ChannelName[] | undefined) ?? [],
    };
  }

  /** Reconstrói um contato que já existe (vindo de um repositório). */
  static restore(data: ContactData): Contact {
    return new Contact({ ...data, optOut: [...data.optOut] });
  }

  get id() {
    return this.data.id;
  }
  get name() {
    return this.data.name;
  }
  get email() {
    return this.data.email;
  }
  get phone() {
    return this.data.phone;
  }
  get optOut(): readonly ChannelName[] {
    return this.data.optOut;
  }
  get createdAt() {
    return this.data.createdAt;
  }

  hasOptedOutOf(channel: ChannelName): boolean {
    return this.data.optOut.includes(channel);
  }

  toData(): ContactData {
    return { ...this.data, optOut: [...this.data.optOut] };
  }
}
