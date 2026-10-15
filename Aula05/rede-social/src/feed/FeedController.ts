import type { PrismaClient } from '@prisma/client';
import { PostNotFoundError, UserNotFoundError, ValidationError } from '../shared/errors.js';

export const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

// Módulo `feed/` (Trabalho II): monta os posts do jeito que a tela precisa
// (autor, tags, fotos em ordem, contagens e se eu já curti), em páginas.
// Usado pela página inicial (1ª página), pelo scroll infinito (próximas
// páginas, via fetch) e pela página de um post.
export class FeedController {
  constructor(private readonly prisma: PrismaClient) {}

  // Paginação por CURSOR: o cliente manda o id do último post que já tem na
  // tela e recebe os próximos `limit` posts mais antigos que ele. Como o id é
  // autoincremento, "id menor" = "post mais antigo".
  //
  // Pedimos `limit + 1` posts: se vier esse "1 a mais", sabemos que ainda
  // existe outra página, sem precisar de um COUNT separado.
  async page(userId: number, query: { cursor?: unknown; limit?: unknown } = {}) {
    const cursor = parseOptionalInt(query.cursor, 'cursor');
    const limit = parseOptionalInt(query.limit, 'limit') ?? DEFAULT_PAGE_SIZE;
    if (limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new ValidationError(`"limit" deve estar entre 1 e ${MAX_PAGE_SIZE}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const rows = await this.prisma.post.findMany({
      where: {
        // Mesmo filtro do feed da Aula 05: posts de quem eu sigo.
        author: { followers: { some: { followerId: userId } } },
        ...(cursor !== undefined ? { id: { lt: cursor } } : {}),
      },
      include: postCardInclude(userId),
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const posts = rows.slice(0, limit).map(toPostCard);
    const nextCursor = hasMore ? posts[posts.length - 1].id : null;

    return { posts, nextCursor };
  }

  async findPost(postId: number, userId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: postCardInclude(userId),
    });
    if (!post) {
      throw new PostNotFoundError(postId);
    }
    return toPostCard(post);
  }
}

// Tudo numa consulta só (sem uma consulta extra por post):
// - `_count` conta curtidas e comentários sem carregar as linhas;
// - `likes` filtrado pelo usuário logado volta com 0 ou 1 item, e isso já
//   responde "eu curti este post?" (`likedByMe`).
function postCardInclude(userId: number) {
  return {
    author: true,
    tags: true,
    images: { orderBy: { order: 'asc' } },
    _count: { select: { likes: true, comments: true } },
    likes: { where: { userId }, select: { userId: true } },
  } as const;
}

function toPostCard<T extends { likes: { userId: number }[] }>(post: T) {
  const { likes, ...rest } = post;
  return { ...rest, likedByMe: likes.length > 0 };
}

function parseOptionalInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ValidationError(`"${name}" deve ser um número inteiro`);
  }
  return parsed;
}
