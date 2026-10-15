import type { PrismaClient, Contact as ContactRow } from '@prisma/client';
import { Contact } from '../../domain/Contact.js';
import type { ContactRepository, NewContactData } from '../../application/ports/ContactRepository.js';

// ADAPTADOR SECUNDÁRIO — contatos no SQLite, via Prisma. É um dos únicos
// lugares do projeto que importam @prisma/client. O tipo `ContactRow` (do
// Prisma) nunca sai daqui: tudo é convertido para `Contact` (do domínio).
export class PrismaContactRepository implements ContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(data: NewContactData): Promise<Contact> {
    const row = await this.prisma.contact.create({
      data: { ...data, optOut: serializeOptOut(data.optOut) },
    });
    return toDomain(row);
  }

  async findById(id: number): Promise<Contact | null> {
    const row = await this.prisma.contact.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<Contact[]> {
    const rows = await this.prisma.contact.findMany({ orderBy: { id: 'asc' } });
    return rows.map(toDomain);
  }
}

// No banco, o optOut continua sendo um texto "sms,email" (o schema não mudou).
// Converter de/para lista é detalhe de persistência, então mora aqui.
export function serializeOptOut(optOut: readonly string[]): string {
  return optOut.join(',');
}

export function parseOptOut(optOut: string): string[] {
  return optOut ? optOut.split(',') : [];
}

export function toDomain(row: ContactRow): Contact {
  return Contact.restore({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    optOut: parseOptOut(row.optOut),
    createdAt: row.createdAt,
  });
}
