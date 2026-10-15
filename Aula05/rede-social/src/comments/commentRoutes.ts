import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { CommentController } from './CommentController.js';
import { requireAuth, requireOwnComment, wantsJson } from '../auth/middleware.js';
import { asyncHandler } from '../shared/http.js';

// Rotas do módulo `comments/`. Todas respondem JSON para o `fetch` do feed.
// Criar comentário também aceita o <form> comum da página do post (sem
// JavaScript): nesse caso, volta para a página do post com um redirect.
export function createCommentRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const commentController = new CommentController(prisma);

  // Listar não exige login: qualquer um pode ler. Se houver sessão, a
  // resposta já diz quais comentários a pessoa curtiu e quais são dela.
  router.get(
    '/posts/:id/comments',
    asyncHandler(async (req, res) => {
      const comments = await commentController.list(Number(req.params.id), req.session.userId);
      res.json(comments);
    }),
  );

  router.post(
    '/posts/:id/comments',
    requireAuth,
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.id);
      const comment = await commentController.create(req.session.userId!, postId, req.body);
      if (wantsJson(req)) {
        res.status(201).json(comment);
        return;
      }
      res.redirect(`/posts/${postId}`);
    }),
  );

  // Extra 7: editar. `requireAuth` (autenticação) roda antes de
  // `requireOwnComment` (autorização) — a ordem importa.
  router.patch(
    '/comments/:id',
    requireAuth,
    requireOwnComment(prisma),
    asyncHandler(async (req, res) => {
      const comment = await commentController.update(Number(req.params.id), req.body, req.session.userId!);
      res.json(comment);
    }),
  );

  router.delete(
    '/comments/:id',
    requireAuth,
    requireOwnComment(prisma),
    asyncHandler(async (req, res) => {
      await commentController.remove(Number(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
