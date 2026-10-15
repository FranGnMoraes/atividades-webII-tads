import { Router, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { FeedController } from './FeedController.js';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../shared/http.js';

// Rotas do módulo `feed/`.
export function createFeedRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const feedController = new FeedController(prisma);

  // Scroll infinito: GET /api/feed?cursor=<id>&limit=10
  //
  // Devolve JSON com `nextCursor` (null quando acabou) e `html`: os cartões
  // dos posts já renderizados pelo MESMO partial EJS que a página inicial
  // usa (views/partials/postCard.ejs). Assim o visual de um post fica
  // definido num lugar só, e o cliente só precisa inserir o HTML no fim da
  // lista. O id do usuário vem da sessão, então a rota exige login.
  router.get(
    '/api/feed',
    requireAuth,
    asyncHandler(async (req, res) => {
      const currentUserId = req.session.userId!;
      const { posts, nextCursor } = await feedController.page(currentUserId, req.query);

      const html = await renderToString(res, 'partials/postList', { posts, currentUserId });
      res.json({ nextCursor, count: posts.length, html });
    }),
  );

  // Página de um post (link do conteúdo do post no feed).
  router.get(
    '/posts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const post = await feedController.findPost(Number(req.params.id), req.session.userId!);
      res.render('post', { post, currentUserId: req.session.userId! });
    }),
  );

  return router;
}

// `res.render` com callback devolve o HTML como texto em vez de enviá-lo.
// O Promise deixa usar `await` (e um erro de template chega ao errorHandler).
function renderToString(res: Response, view: string, locals: object): Promise<string> {
  return new Promise((resolve, reject) => {
    res.render(view, locals, (err, html) => (err ? reject(err) : resolve(html)));
  });
}
