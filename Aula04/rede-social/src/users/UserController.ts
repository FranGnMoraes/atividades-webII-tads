import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  DuplicateEmailError,
  DuplicateFollowError,
  ProfileNotFoundError,
  SelfFollowError,
  UserNotFoundError,
  ValidationError,
} from '../shared/errors.js';
import { parsePaginationParams, paginate } from '../shared/pagination.js';

export class UserController {
  constructor(private readonly prisma: PrismaClient) {}

  async create(body: unknown) {
    const { name, email, avatarUrl } = (body ?? {}) as {
      name?: unknown;
      email?: unknown;
      avatarUrl?: unknown;
    };
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('"name" é obrigatório');
    }
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new ValidationError('"email" é obrigatório');
    }

    try {
      return await this.prisma.user.create({
        data: {
          name,
          email,
          avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateEmailError(email);
      }
      throw err;
    }
  }

  async list(query: Record<string, unknown> = {}) {
    const params = parsePaginationParams(query, 'createdAt', 10);
    const [total, data] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
        include: {
          profile: true,
          _count: { select: { posts: true, followers: true, following: true } },
        },
      }),
    ]);
    return paginate(data, total, params);
  }

  async get(id: number) {
    // FIND UNIQUE DO PRISMA
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        _count: { select: { posts: true, followers: true, following: true } },
      },
    });
    if (!user) {
      throw new UserNotFoundError(id);
    }
    return user;
  }

  // Autorrelação N:N em ação: um User segue outro User através da tabela
  // de junção explícita `Follow`.
  async follow(followerId: number, body: unknown) {
    const { targetId } = (body ?? {}) as { targetId?: unknown };
    if (typeof targetId !== 'number' || !Number.isInteger(targetId)) {
      throw new ValidationError('"targetId" é obrigatório e deve ser um número inteiro');
    }
    if (targetId === followerId) {
      throw new SelfFollowError();
    }

    const [follower, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: followerId } }),
      this.prisma.user.findUnique({ where: { id: targetId } }),
    ]);
    if (!follower) {
      throw new UserNotFoundError(followerId);
    }
    if (!target) {
      throw new UserNotFoundError(targetId);
    }

    try {
      return await this.prisma.follow.create({
        data: { followerId, followingId: targetId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateFollowError();
      }
      throw err;
    }
  }

  // Feed = posts de quem eu sigo. Mostra um filtro relacional aninhado:
  // "posts cujo autor tem, entre seus seguidores, um Follow onde eu sou o
  // follower" — sem precisar buscar a lista de ids manualmente antes.
  async feed(userId: number, query: Record<string, unknown> = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const params = parsePaginationParams(query, 'createdAt', 10);
    const where = { author: { followers: { some: { followerId: userId } } } };

    const [total, data] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
        include: {
          author: true,
          tags: true,
          images: true,
          _count: { select: { comments: true, likes: true } },
        },
      }),
    ]);

    // Retorna lista direta ou resultado paginado conforme solicitado
    if (query.page !== undefined || query.limit !== undefined) {
      return paginate(data, total, params);
    }
    return data;
  }

  // 1:1 - Criação / Atualização de UserProfile
  async upsertProfile(userId: number, body: unknown) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const { bio, location, website, birthDate } = (body ?? {}) as {
      bio?: unknown;
      location?: unknown;
      website?: unknown;
      birthDate?: unknown;
    };

    let parsedBirthDate: Date | undefined;
    if (birthDate !== undefined && birthDate !== null) {
      parsedBirthDate = new Date(birthDate as string);
      if (isNaN(parsedBirthDate.getTime())) {
        throw new ValidationError('"birthDate" deve ser uma data válida');
      }
    }

    return this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        bio: typeof bio === 'string' ? bio : undefined,
        location: typeof location === 'string' ? location : undefined,
        website: typeof website === 'string' ? website : undefined,
        birthDate: parsedBirthDate,
      },
      update: {
        bio: typeof bio === 'string' ? bio : undefined,
        location: typeof location === 'string' ? location : undefined,
        website: typeof website === 'string' ? website : undefined,
        birthDate: parsedBirthDate,
      },
      include: { user: true },
    });
  }

  async getProfile(userId: number) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!profile) {
      throw new ProfileNotFoundError(userId);
    }
    return profile;
  }

  // Listagem paginada e ordenada de Perfis de Usuários
  async listProfiles(query: Record<string, unknown> = {}) {
    const params = parsePaginationParams(query, 'createdAt', 10);
    const [total, data] = await Promise.all([
      this.prisma.userProfile.count(),
      this.prisma.userProfile.findMany({
        skip: params.skip,
        take: params.limit,
        orderBy: { [params.orderBy]: params.order },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
    ]);
    return paginate(data, total, params);
  }
}
