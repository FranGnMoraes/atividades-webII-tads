import type { ChannelName, ChannelPolicy } from '../../domain/Channel.js';
import type { MessageSender } from './MessageSender.js';

// Um canal completo = a POLÍTICA (regras do negócio para aquele canal, pura)
// + o SENDER (o provedor que entrega de verdade). Ficam separados porque dá
// para trocar o provedor sem trocar as regras: o e-mail no console e o e-mail
// via Nodemailer usam a mesma política de e-mail.
export interface Channel {
  policy: ChannelPolicy;
  sender: MessageSender;
}

// O catálogo dos canais disponíveis, montado no composition root. É o que os
// casos de uso consultam para saber "esse canal existe?" e "quem entrega?".
export class ChannelCatalog {
  private readonly channels = new Map<ChannelName, Channel>();

  constructor(channels: Channel[]) {
    for (const channel of channels) {
      this.channels.set(channel.policy.name, channel);
    }
  }

  names(): ChannelName[] {
    return [...this.channels.keys()];
  }

  has(name: ChannelName): boolean {
    return this.channels.has(name);
  }

  get(name: ChannelName): Channel | undefined {
    return this.channels.get(name);
  }
}
