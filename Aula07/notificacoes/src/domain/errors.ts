// DOMÍNIO — erros de negócio. Cada um diz O QUE deu errado, na linguagem do
// negócio. Quem decide qual status HTTP cada um vira é o adaptador HTTP
// (src/adapters/http/errorHandler.ts), num lugar só — o domínio não sabe que
// HTTP existe.
export abstract class DomainError extends Error {}

/** Dado de entrada que não respeita uma regra (nome curto, e-mail inválido...). */
export class ValidationError extends DomainError {}

export class UnknownChannelError extends DomainError {
  constructor(channel: string) {
    super(`canal desconhecido: ${channel}`);
  }
}

export class ContactNotFoundError extends DomainError {
  constructor() {
    super('contato não encontrado');
  }
}

export class NotificationNotFoundError extends DomainError {
  constructor() {
    super('notificação não encontrada');
  }
}

export class RateLimitExceededError extends DomainError {
  constructor(limit: number) {
    super(`limite de ${limit} notificações por minuto para este contato`);
  }
}

export class AlreadySentError extends DomainError {
  constructor() {
    super('notificação já foi enviada');
  }
}

export class MaxAttemptsReachedError extends DomainError {
  constructor(max: number) {
    super(`número máximo de tentativas (${max}) atingido`);
  }
}

/** O contato não cumpre o que o canal exige (opt-out, sem telefone...). */
export class ChannelRequirementError extends DomainError {}
