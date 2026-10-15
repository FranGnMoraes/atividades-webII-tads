import { Contact, type NewContactInput } from '../../domain/Contact.js';
import { ContactNotFoundError } from '../../domain/errors.js';
import type { ChannelCatalog } from '../ports/ChannelCatalog.js';
import type { Clock } from '../ports/Clock.js';
import type { ContactRepository } from '../ports/ContactRepository.js';

// CASOS DE USO de contatos (portas de entrada). São pequenos, então ficam
// juntos neste arquivo: cada classe é uma operação, com `execute`.

export class CreateContact {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly catalog: ChannelCatalog,
    private readonly clock: Clock,
  ) {}

  async execute(input: NewContactInput): Promise<Contact> {
    const valid = Contact.validateNew(input, this.catalog.names());
    return this.contacts.add({ ...valid, createdAt: this.clock.now() });
  }
}

export class ListContacts {
  constructor(private readonly contacts: ContactRepository) {}

  execute(): Promise<Contact[]> {
    return this.contacts.list();
  }
}

export class GetContact {
  constructor(private readonly contacts: ContactRepository) {}

  async execute(id: number): Promise<Contact> {
    const contact = await this.contacts.findById(id);
    if (!contact) {
      throw new ContactNotFoundError();
    }
    return contact;
  }
}
