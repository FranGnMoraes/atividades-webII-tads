import type { Contact } from '../../domain/Contact.js';
import type { ChannelName } from '../../domain/Channel.js';

// PORTA DE SAÍDA — guardar e buscar contatos, na linguagem do domínio
// (recebe e devolve `Contact`, nunca uma linha do Prisma). Implementações:
// src/adapters/prisma/PrismaContactRepository.ts e
// src/adapters/memory/InMemoryContactRepository.ts.
export interface NewContactData {
  name: string;
  email: string | null;
  phone: string | null;
  optOut: ChannelName[];
  createdAt: Date;
}

export interface ContactRepository {
  add(data: NewContactData): Promise<Contact>;
  findById(id: number): Promise<Contact | null>;
  /** Todos, em ordem de id. */
  list(): Promise<Contact[]>;
}
