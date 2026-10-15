import type { PrismaClient } from '@prisma/client';
import { CommentNotFoundError, PostNotFoundError, ValidationError } from '../shared/errors.js';

const MAX_COMMENT_LENGTH = 500;

// O que o módulo `comments/` entrega para quem está de fora (rotas e
// JavaScript do feed): só os campos que a tela usa, já com as contagens
// prontas. Ninguém de fora precisa saber como a tabela CommentLike é.
export interface CommentView {
  id: number;
  content: string;
  createdAt: Date;
  postId: number;
  author: { id: number; name: string };
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
}

// Módulo `comments/` (Trabalho II). Recebe o PrismaClient por injeção, como
// o PostController. A checagem "é dono do comentário?" NÃO mora aqui: fica no
// middleware `requireOwnComment` (src/auth/middleware.ts), que roda antes de
// `update` e `remove` — mesma divisão de `requireOwnPost` + `PostController`.
export class CommentController {
  constructor(private readonly prisma: PrismaClient) {}

  // `authorId` vem da SESSÃO, nunca do corpo da requisição.
  async create(authorId: number, postId: number, body: unknown): Promise<CommentView> {
    const content = validateContent(body);
    await this.ensurePostExists(postId);

    const comment = await this.prisma.comment.create({
      data: { content, authorId, postId },
    });
    return this.getView(comment.id, authorId);
  }

  // Ordem: mais curtidos primeiro (extra 9); empate, o mais antigo primeiro,
  // para a conversa continuar lendo de cima para baixo.
  async list(postId: number, currentUserId?: number): Promise<CommentView[]> {
    await this.ensurePostExists(postId);

    const comments = await this.prisma.comment.findMany({
      where: { postId },
      include: COMMENT_INCLUDE(currentUserId),
      orderBy: [{ likes: { _count: 'desc' } }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return comments.map((comment) => toView(comment, currentUserId));
  }

  // Extra 7: editar o próprio comentário. A autorização já foi feita por
  // `requireOwnComment`.
  async update(commentId: number, body: unknown, currentUserId: number): Promise<CommentView> {
    const content = validateContent(body);
    await this.prisma.comment.update({ where: { id: commentId }, data: { content } });
    return this.getView(commentId, currentUserId);
  }

  async remove(commentId: number): Promise<void> {
    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  private async getView(commentId: number, currentUserId: number): Promise<CommentView> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: COMMENT_INCLUDE(currentUserId),
    });
    if (!comment) {
      throw new CommentNotFoundError(commentId);
    }
    return toView(comment, currentUserId);
  }

  private async ensurePostExists(postId: number): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }
  }
}

// Numa consulta só: o autor, a contagem de curtidas (`_count`) e, se houver
// alguém logado, a curtida DESSA pessoa (lista com 0 ou 1 item). Assim
// `likedByMe` sai sem uma consulta extra por comentário.
function COMMENT_INCLUDE(currentUserId?: number) {
  return {
    author: { select: { id: true, name: true } },
    _count: { select: { likes: true } },
    likes: { where: { userId: currentUserId ?? -1 }, select: { userId: true } },
  } as const;
}

interface CommentWithRelations {
  id: number;
  content: string;
  createdAt: Date;
  postId: number;
  authorId: number;
  author: { id: number; name: string };
  _count: { likes: number };
  likes: { userId: number }[];
}

function toView(comment: CommentWithRelations, currentUserId?: number): CommentView {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    postId: comment.postId,
    author: comment.author,
    likeCount: comment._count.likes,
    likedByMe: comment.likes.length > 0,
    isMine: comment.authorId === currentUserId,
  };
}

function validateContent(body: unknown): string {
  const { content } = (body ?? {}) as { content?: unknown };
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ValidationError('O comentário não pode ficar vazio');
  }
  if (content.trim().length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`O comentário pode ter no máximo ${MAX_COMMENT_LENGTH} caracteres`);
  }
  return content.trim();
}
