import type { CardRepository } from './CardRepository.js';
import type { BoardRepository } from '../boards/BoardRepository.js';
import type { ControllerResult } from '../shared/http.js';
import { Card, type CardPriority } from './Card.js';
import {
  CardNotFoundError,
  DuplicateCardTitleError,
  WipLimitExceededError,
} from './errors.js';
import { ColumnNotFoundError } from '../boards/errors.js';
import { toCardDetailViewModel } from './cardView.js';

export class CardController {
  constructor(
    private readonly cardRepository: CardRepository,
    private readonly boardRepository: BoardRepository,
  ) {}

  create(body: unknown): ControllerResult {
    const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const title = typeof raw.title === 'string' ? raw.title : '';
    const columnId = typeof raw.columnId === 'string' ? raw.columnId : '';
    const priority = raw.priority as CardPriority | undefined;
    const description = typeof raw.description === 'string' ? raw.description : '';

    const board = this.boardRepository.getDefault();
    if (!board.hasColumn(columnId)) {
      throw new ColumnNotFoundError(columnId);
    }

    if (this.cardRepository.existsWithTitleInColumn(title, columnId)) {
      throw new DuplicateCardTitleError(title);
    }

    const column = board.findColumn(columnId);
    if (column.wipLimit !== null && this.cardRepository.findByColumn(columnId).length >= column.wipLimit) {
      throw new WipLimitExceededError(column.name, column.wipLimit);
    }

    const card = Card.create(title, columnId, priority, description);
    this.cardRepository.save(card);
    return { redirect: '/' };
  }

  move(id: string, body: unknown): ControllerResult {
    const card = this.cardRepository.findById(id);
    if (!card) {
      throw new CardNotFoundError(id);
    }

    const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const targetColumnId = typeof raw.columnId === 'string' ? raw.columnId : '';

    const board = this.boardRepository.getDefault();
    if (!board.hasColumn(targetColumnId)) {
      throw new ColumnNotFoundError(targetColumnId);
    }

    if (card.columnId !== targetColumnId) {
      const targetColumn = board.findColumn(targetColumnId);
      if (
        targetColumn.wipLimit !== null &&
        this.cardRepository.findByColumn(targetColumnId).length >= targetColumn.wipLimit
      ) {
        throw new WipLimitExceededError(targetColumn.name, targetColumn.wipLimit);
      }

      if (this.cardRepository.existsWithTitleInColumn(card.title, targetColumnId, card.id)) {
        throw new DuplicateCardTitleError(card.title);
      }

      card.changeColumn(targetColumnId);
      this.cardRepository.save(card);
    }

    return { redirect: '/' };
  }

  update(id: string, body: unknown): ControllerResult {
    const card = this.cardRepository.findById(id);
    if (!card) {
      throw new CardNotFoundError(id);
    }

    const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

    if (typeof raw.title === 'string') {
      const newTitle = raw.title;
      if (this.cardRepository.existsWithTitleInColumn(newTitle, card.columnId, card.id)) {
        throw new DuplicateCardTitleError(newTitle);
      }
      card.rename(newTitle, typeof raw.description === 'string' ? raw.description : undefined);
    } else if (typeof raw.description === 'string') {
      card.rename(card.title, raw.description);
    }

    if (raw.priority !== undefined) {
      card.changePriority(raw.priority as CardPriority);
    }

    this.cardRepository.save(card);
    return { redirect: '/' };
  }

  remove(id: string): ControllerResult {
    const card = this.cardRepository.findById(id);
    if (!card) {
      throw new CardNotFoundError(id);
    }

    this.cardRepository.delete(id);
    return { redirect: '/' };
  }

  showDetail(id: string): ControllerResult {
    const card = this.cardRepository.findById(id);
    if (!card) {
      throw new CardNotFoundError(id);
    }

    const board = this.boardRepository.getDefault();
    const column = board.findColumn(card.columnId);

    return {
      status: 200,
      view: 'cards/show',
      locals: { card: toCardDetailViewModel(card, column) },
    };
  }

  search(query: unknown): ControllerResult {
    const raw = typeof query === 'object' && query !== null ? (query as Record<string, unknown>) : {};
    const q = typeof raw.query === 'string' ? raw.query.trim() : '';

    const allCards = this.cardRepository.findAll();
    const matchingCards = q
      ? allCards.filter((card) => card.title.toLowerCase().includes(q.toLowerCase()))
      : allCards;

    return {
      status: 200,
      view: 'cards/search',
      locals: { query: q, cards: matchingCards },
    };
  }
}
