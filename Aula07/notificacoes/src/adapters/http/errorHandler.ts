import type { NextFunction, Request, Response } from 'express';
import {
  AlreadySentError,
  ChannelRequirementError,
  ContactNotFoundError,
  DomainError,
  MaxAttemptsReachedError,
  NotificationNotFoundError,
  RateLimitExceededError,
  UnknownChannelError,
  ValidationError,
} from '../../domain/errors.js';

// O ÚNICO lugar que decide qual status HTTP cada erro do domínio vira.
const STATUS_BY_ERROR = new Map<Function, number>([
  [ValidationError, 400],
  [UnknownChannelError, 400],
  [ContactNotFoundError, 404],
  [NotificationNotFoundError, 404],
  [AlreadySentError, 409],
  [MaxAttemptsReachedError, 409],
  [ChannelRequirementError, 422],
  [RateLimitExceededError, 429],
]);

// Erro que o próprio adaptador HTTP lança ao validar o FORMATO da requisição.
export class BadRequestError extends Error {}

// Erros do domínio viram { error: mensagem } com o status certo. Qualquer
// outra coisa (erro do Prisma, bug, banco fora do ar) vira um 500 genérico:
// o detalhe vai para o log do servidor, NUNCA para o cliente — no original,
// um erro desses devolvia a página de erro do Express com o stack trace.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    res.status(STATUS_BY_ERROR.get(err.constructor) ?? 400).json({ error: err.message });
    return;
  }
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.message });
    return;
  }
  // JSON malformado no corpo (erro do express.json()).
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'corpo da requisição não é um JSON válido' });
    return;
  }

  console.error('[erro interno]', err);
  res.status(500).json({ error: 'erro interno do servidor' });
}
