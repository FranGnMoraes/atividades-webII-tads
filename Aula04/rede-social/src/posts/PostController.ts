import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  CommentNotFoundError,
  DuplicateLikeError,
  LikeNotFoundError,
  PostNotFoundError,
  TagNotFoundError,
  UserNotFoundError,
  ValidationError,
} from '../shared/errors.js';
import { parsePaginationParams, paginate } from '../shared/pagination.js';

export class PostController {
  constructor(private readonly prisma: PrismaClient) {}

  // 1:N (author) + N:N (tags) + 1:N (images) na mesma escrita:
  // `connect` liga o post a um autor existente, `connectOrCreate` reaproveita
  // tags já cadastradas ou cria as que ainda não existem, e `create` aninha imagens.
  async create(body: unknown) {
    const { authorId, content, tags, images } = (body ?? {}) as {
      authorId?: unknown;
      content?: unknown;
      tags?: unknown;
      images?: unknown;
    };

    if (typeof authorId !== 'number' || !Number.isInteger(authorId)) {
      throw new ValidationError('"authorId" é obrigatório e deve ser um número inteiro');
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('"content" é obrigatório');
    }
    if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string'))) {
      throw new ValidationError('"tags", quando informado, deve ser uma lista de strings');
    }
    if (images !== undefined && (!Array.isArray(images) || images.some((img) => typeof img?.url !== 'string'))) {
      throw new ValidationError('"images", quando informado, deve ser uma lista de objetos com o campo "url"');
    }

    const author = await this.prisma.user.findUnique({ where: { id: authorId } });
    if (!author) {
      throw new UserNotFoundError(authorId);
    }

    const tagNames = (tags as string[] | undefined) ?? [];
    const imageList = (images as Array<{ url: string; altText?: string }> | undefined) ?? [];

    return this.prisma.post.create({
      data: {
        content,
        author: { connect: { id: authorId } },
        tags: {
          connectOrCreate: tagNames.map((name) => ({
            where: { name },
            create: { name },
          })),
        },
        images: {
          create: imageList.map((img) => ({
            url: img.url,
            altText: typeof img.altText === 'string' ? img.altText : undefined,
          })),
        },
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        tags: true,
        images: true,
        _count: { select: { comments: true, likes: true } },
      },
    });
  }

  // Listagem paginada (10 itens por página por padrão) e ordenada de Posts
  async list(query: Record<string, unknown> = {}) {
    const params = parsePaginationParams(query, 'createdAt', 10);
    const [total, data] = await Promise.all([
      this.prisma.post.count(),
      this.prisma.post.findMany({
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          tags: true,
          images: true,
          _count: { select: { comments: true, likes: true } },
        },
      }),
    ]);
    return paginate(data, total, params);
  }

  async get(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true, profile: true },
        },
        tags: true,
        images: true,
        comments: {
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
        likes: {
          include: { user: { select: { id: true, name: true } } },
        },
        _count: { select: { comments: true, likes: true, images: true } },
      },
    });
    if (!post) {
      throw new PostNotFoundError(id);
    }
    return post;
  }

  async listByTag(name: string, query: Record<string, unknown> = {}) {
    const tag = await this.prisma.tag.findUnique({ where: { name } });
    if (!tag) {
      throw new TagNotFoundError(name);
    }

    const params = parsePaginationParams(query, 'createdAt', 10);
    const where = { tags: { some: { name } } };

    const [total, data] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
        include: { author: true, tags: true, images: true },
      }),
    ]);

    if (query.page !== undefined || query.limit !== undefined) {
      return paginate(data, total, params);
    }
    return data;
  }

  // =========================================================
  // COMENTÁRIOS (1:N Post, 1:N User)
  // =========================================================

  async addComment(postId: number, body: unknown) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }

    const { authorId, content } = (body ?? {}) as { authorId?: unknown; content?: unknown };
    if (typeof authorId !== 'number' || !Number.isInteger(authorId)) {
      throw new ValidationError('"authorId" é obrigatório e deve ser um número inteiro');
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('"content" é obrigatório');
    }

    const author = await this.prisma.user.findUnique({ where: { id: authorId } });
    if (!author) {
      throw new UserNotFoundError(authorId);
    }

    return this.prisma.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async listComments(postId?: number, query: Record<string, unknown> = {}) {
    if (postId !== undefined) {
      const post = await this.prisma.post.findUnique({ where: { id: postId } });
      if (!post) {
        throw new PostNotFoundError(postId);
      }
    }

    const params = parsePaginationParams(query, 'createdAt', 10);
    const where = postId !== undefined ? { postId } : {};

    const [total, data] = await Promise.all([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          post: { select: { id: true, content: true } },
        },
      }),
    ]);

    return paginate(data, total, params);
  }

  // =========================================================
  // CURTIDAS / LIKES (N:N Post <-> User)
  // =========================================================

  async addLike(postId: number, body: unknown) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }

    const { userId } = (body ?? {}) as { userId?: unknown };
    if (typeof userId !== 'number' || !Number.isInteger(userId)) {
      throw new ValidationError('"userId" é obrigatório e deve ser um número inteiro');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    try {
      return await this.prisma.like.create({
        data: { postId, userId },
        include: {
          user: { select: { id: true, name: true } },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateLikeError();
      }
      throw err;
    }
  }

  async removeLike(postId: number, userId: number) {
    const like = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!like) {
      throw new LikeNotFoundError();
    }

    await this.prisma.like.delete({
      where: { userId_postId: { userId, postId } },
    });
  }

  async listLikes(postId?: number, query: Record<string, unknown> = {}) {
    if (postId !== undefined) {
      const post = await this.prisma.post.findUnique({ where: { id: postId } });
      if (!post) {
        throw new PostNotFoundError(postId);
      }
    }

    const params = parsePaginationParams(query, 'createdAt', 10);
    const where = postId !== undefined ? { postId } : {};

    const [total, data] = await Promise.all([
      this.prisma.like.count({ where }),
      this.prisma.like.findMany({
        where,
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          post: { select: { id: true, content: true } },
        },
      }),
    ]);

    return paginate(data, total, params);
  }

  // =========================================================
  // IMAGENS (1:N Post -> Image)
  // =========================================================

  async addImage(postId: number, body: unknown) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }

    const { url, altText } = (body ?? {}) as { url?: unknown; altText?: unknown };
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new ValidationError('"url" é obrigatório e deve ser uma URL válida');
    }

    return this.prisma.image.create({
      data: {
        url: url.trim(),
        altText: typeof altText === 'string' ? altText : undefined,
        postId,
      },
    });
  }

  async listImages(postId?: number, query: Record<string, unknown> = {}) {
    if (postId !== undefined) {
      const post = await this.prisma.post.findUnique({ where: { id: postId } });
      if (!post) {
        throw new PostNotFoundError(postId);
      }
    }

    const params = parsePaginationParams(query, 'createdAt', 10);
    const where = postId !== undefined ? { postId } : {};

    const [total, data] = await Promise.all([
      this.prisma.image.count({ where }),
      this.prisma.image.findMany({
        where,
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
      }),
    ]);

    return paginate(data, total, params);
  }
}
