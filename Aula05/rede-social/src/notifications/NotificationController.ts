import type { PrismaClient } from '@prisma/client';

export interface NotificationSummary {
  newLikes: number;
  newComments: number;
}

// Módulo `notifications/` (Trabalho II, extra 10): "notificação" simples e
// NÃO realtime. Não existe tabela de notificações: o número é calculado na
// hora, comparando o `createdAt` das curtidas/comentários nos MEUS posts com
// a última vez que eu abri o feed (`User.lastSeenAt`).
export class NotificationController {
  constructor(private readonly prisma: PrismaClient) {}

  // Conta o que chegou desde o último acesso e já marca "agora" como o novo
  // último acesso — por isso, ao recarregar a página, o contador zera.
  async checkAndMarkSeen(userId: number, now: Date = new Date()): Promise<NotificationSummary> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    let summary: NotificationSummary = { newLikes: 0, newComments: 0 };

    // No primeiro acesso não há "desde quando" comparar: começa do zero.
    if (user.lastSeenAt) {
      const since = { gt: user.lastSeenAt };
      const onMyPosts = { authorId: userId };
      const notByMe = { not: userId };

      const [newLikes, newComments] = await Promise.all([
        this.prisma.like.count({ where: { createdAt: since, post: onMyPosts, userId: notByMe } }),
        this.prisma.comment.count({ where: { createdAt: since, post: onMyPosts, authorId: notByMe } }),
      ]);
      summary = { newLikes, newComments };
    }

    await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } });
    return summary;
  }
}
