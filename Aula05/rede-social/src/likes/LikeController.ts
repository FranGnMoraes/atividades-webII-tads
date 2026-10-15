import type { PrismaClient } from '@prisma/client';
import { CommentNotFoundError, PostNotFoundError } from '../shared/errors.js';

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

// Módulo `likes/` (Trabalho II): curtir e descurtir posts e comentários.
// Recebe o PrismaClient por injeção, igual ao PostController — não chama
// nada de dentro de `posts/` nem de `comments/`, só consulta as tabelas pelo
// Prisma compartilhado.
//
// Um único endpoint ALTERNA o estado ("toggle"): se já curtiu, descurte; se
// não curtiu, curte. Assim o botão do coração só precisa de uma rota.
export class LikeController {
  constructor(private readonly prisma: PrismaClient) {}

  // `userId` vem da SESSÃO (ver likeRoutes.ts), nunca do corpo da requisição.
  async togglePostLike(userId: number, postId: number): Promise<LikeResult> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }

    // A chave composta @@id([userId, postId]) vira o filtro `userId_postId`.
    const where = { userId_postId: { userId, postId } };
    const existing = await this.prisma.like.findUnique({ where });

    if (existing) {
      await this.prisma.like.delete({ where });
    } else {
      await this.prisma.like.create({ data: { userId, postId } });
    }

    const likeCount = await this.prisma.like.count({ where: { postId } });
    return { liked: !existing, likeCount };
  }

  // Mesma mecânica, aplicada a um comentário (tabela CommentLike).
  async toggleCommentLike(userId: number, commentId: number): Promise<LikeResult> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new CommentNotFoundError(commentId);
    }

    const where = { userId_commentId: { userId, commentId } };
    const existing = await this.prisma.commentLike.findUnique({ where });

    if (existing) {
      await this.prisma.commentLike.delete({ where });
    } else {
      await this.prisma.commentLike.create({ data: { userId, commentId } });
    }

    const likeCount = await this.prisma.commentLike.count({ where: { commentId } });
    return { liked: !existing, likeCount };
  }
}
