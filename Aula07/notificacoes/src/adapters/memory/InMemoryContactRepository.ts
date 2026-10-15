import { Contact, type ContactData } from '../../domain/Contact.js';
import type { ContactRepository, NewContactData } from '../../application/ports/ContactRepository.js';

// ADAPTADOR SECUNDÁRIO — contatos guardados num Map, em memória. Usado nos
// testes dos casos de uso e para subir a aplicação sem banco (Etapa 9:
// PERSISTENCE=memory). Guarda cópias, para ninguém alterar o "banco" sem
// passar pelo repositório (igual a um banco de verdade).
export class InMemoryContactRepository implements ContactRepository {
  private readonly rows = new Map<number, ContactData>();
  private nextId = 1;

  async add(data: NewContactData): Promise<Contact> {
    const row: ContactData = { id: this.nextId++, ...data, optOut: [...data.optOut] };
    this.rows.set(row.id, row);
    return Contact.restore(row);
  }

  async findById(id: number): Promise<Contact | null> {
    const row = this.rows.get(id);
    return row ? Contact.restore(row) : null;
  }

  async list(): Promise<Contact[]> {
    return [...this.rows.values()].sort((a, b) => a.id - b.id).map((row) => Contact.restore(row));
  }
}
