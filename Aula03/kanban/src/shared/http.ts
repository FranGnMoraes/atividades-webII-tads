import type { Response } from 'express';

/**
 * Resultado que um Controller devolve para uma rota renderizar. Só existe
 * a variante "render" por enquanto — o template ainda não tem nenhum caso
 * de uso que termina em redirecionamento. Quando vocês implementarem
 * `POST /cards` (Atividade 1), muito provavelmente vão querer redirecionar
 * de volta para `/` após o sucesso (padrão Post/Redirect/Get); estender
 * este tipo (ou usar `res.redirect` diretamente na rota) faz parte da
 * atividade — é uma decisão de vocês, não deste template.
 */
export type ControllerResult =
  | { status: number; view: string; locals: Record<string, unknown>; redirect?: never }
  | { redirect: string; status?: number; view?: never; locals?: never };

export function respond(res: Response, result: ControllerResult): void {
  if (result.redirect) {
    res.redirect(result.status ?? 302, result.redirect);
    return;
  }
  res.status(result.status).render(result.view, result.locals);
}
