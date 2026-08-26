import type { Card, CardPriority } from './Card.js';
import type { Column } from '../boards/Column.js';

export interface CardDetailViewModel {
  id: string;
  title: string;
  description: string;
  priority: string;
  columnId: string;
  columnName: string;
  priorityBadgeClass: string;
}

const BADGE_CLASS_BY_PRIORITY: Record<CardPriority, string> = {
  baixa: 'bg-emerald-100 text-emerald-800',
  média: 'bg-amber-100 text-amber-800',
  alta: 'bg-rose-100 text-rose-800',
};

export function toCardDetailViewModel(card: Card, column: Column): CardDetailViewModel {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    priority: card.priority,
    columnId: column.id,
    columnName: column.name,
    priorityBadgeClass: BADGE_CLASS_BY_PRIORITY[card.priority],
  };
}
