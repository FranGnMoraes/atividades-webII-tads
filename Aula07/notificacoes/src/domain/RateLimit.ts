// DOMÍNIO — limite de envio: no máximo 5 notificações por contato a cada
// minuto. É regra de negócio pura: recebe números e datas, não consulta nada.
export const RATE_LIMIT = {
  maxPerWindow: 5,
  windowMs: 60 * 1000,
} as const;

/** A partir de quando contar as notificações "recentes". */
export function rateLimitWindowStart(now: Date): Date {
  return new Date(now.getTime() - RATE_LIMIT.windowMs);
}

export function exceedsRateLimit(alreadySentInWindow: number, newNotifications: number): boolean {
  return alreadySentInWindow + newNotifications > RATE_LIMIT.maxPerWindow;
}
