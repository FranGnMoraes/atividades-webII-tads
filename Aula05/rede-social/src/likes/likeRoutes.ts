import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { LikeController } from './LikeController.js';
import { requireAuth, wantsJson } from '../auth/middleware.js';
import { asyncHandler } from '../shared/http.js';

// Rotas do módulo `likes/`. O `fetch` do feed manda `Accept: application/json`
// e recebe `{ liked, likeCount }`. Um <form> comum (sem JavaScript) também
// funciona: recebe um redirect de volta para a página de onde veio.
export function createLikeRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const likeController = new LikeController(prisma);

  router.post(
    '/posts/:id/like',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await likeController.togglePostLike(req.session.userId!, Number(req.params.id));
      respond(req, res, result);
    }),
  );

  router.post(
    '/comments/:id/like',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await likeController.toggleCommentLike(req.session.userId!, Number(req.params.id));
      respond(req, res, result);
    }),
  );

  return router;
}

function respond(req: Request, res: Response, result: unknown): void {
  if (wantsJson(req)) {
    res.json(result);
    return;
  }
  res.redirect(req.get('Referer') ?? '/');
}
