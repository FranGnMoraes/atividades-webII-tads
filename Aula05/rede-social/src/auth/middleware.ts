import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';

// AUTENTICAÇÃO ("quem é você?"): só verifica se existe uma sessão válida
// com um `userId`. Não olha PARA QUAL recurso a requisição é — só se há
// alguém logado. Toda rota que exige login passa por aqui primeiro.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    // Trabalho II: quem chama via `fetch` (Accept: application/json) não
    // tem como "seguir" um redirect para a página de login — ele recebe
    // 401 em JSON e o JavaScript do cliente decide o que mostrar.
    if (wantsJson(req)) {
      res.status(401).json({ error: 'Faça login para continuar' });
      return;
    }
    res.redirect('/login');
    return;
  }
  next();
}

// O mesmo erro precisa virar página (formulário/navegador) ou JSON (fetch),
// igual ao que src/shared/errorHandler.ts já faz.
export function wantsJson(req: Request): boolean {
  return req.accepts(['html', 'json']) === 'json';
}

function sendError(req: Request, res: Response, status: number, message: string): void {
  if (wantsJson(req)) {
    res.status(status).json({ error: message });
    return;
  }
  res.status(status).render('error', { status, message });
}

// AUTORIZAÇÃO ("você pode fazer ISSO?"): roda DEPOIS de `requireAuth` (já
// sabemos quem é o usuário) e decide se ele pode agir sobre um recurso
// específico — aqui, se o post pertence a quem está logado. Autenticação
// e autorização são perguntas diferentes: um usuário autenticado pode
// ainda assim ser barrado por autorização (ex.: tentar apagar post de
// outra pessoa).
export function requireOwnPost(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const postId = Number(req.params.id);
    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      res.status(404).render('error', { status: 404, message: 'Post não encontrado' });
      return;
    }
    if (post.authorId !== req.session.userId) {
      res.status(403).render('error', { status: 403, message: 'Você não pode apagar um post de outra pessoa' });
      return;
    }
    next();
  };
}

// Trabalho II — AUTORIZAÇÃO para comentários, análoga a `requireOwnPost`:
// só quem escreveu o comentário pode editar ou apagar. Roda depois de
// `requireAuth`, então `req.session.userId` já existe aqui.
export function requireOwnComment(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const commentId = Number(req.params.id);
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });

    if (!comment) {
      sendError(req, res, 404, 'Comentário não encontrado');
      return;
    }
    if (comment.authorId !== req.session.userId) {
      sendError(req, res, 403, 'Você não pode alterar o comentário de outra pessoa');
      return;
    }
    next();
  };
}
