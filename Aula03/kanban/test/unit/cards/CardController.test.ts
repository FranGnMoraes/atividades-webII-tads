import { describe, expect, it } from 'vitest';
import { CardController } from '../../../src/cards/CardController.js';
import { InMemoryBoardRepository } from '../../../src/boards/BoardRepository.js';
import { InMemoryCardRepository } from '../../../src/cards/CardRepository.js';
import { Board } from '../../../src/boards/Board.js';
import { Column } from '../../../src/boards/Column.js';
import { Card } from '../../../src/cards/Card.js';

describe('CardController (unitário)', () => {
  function setup() {
    const board = Board.create('b-1', 'Quadro', [
      Column.create('c-1', 'A Fazer', 1),
      Column.create('c-2', 'Em Andamento', 2, 2),
    ]);
    const boardRepo = new InMemoryBoardRepository(board);
    const cardRepo = new InMemoryCardRepository();
    const controller = new CardController(cardRepo, boardRepo);
    return { board, boardRepo, cardRepo, controller };
  }

  it('lida com body nulo ou vazio em create', () => {
    const { controller } = setup();
    expect(() => controller.create(null)).toThrow();
  });

  it('lida com body nulo em move', () => {
    const { controller, cardRepo } = setup();
    const card = Card.create('Tarefa', 'c-1');
    cardRepo.save(card);
    expect(() => controller.move(card.id, null)).toThrow();
  });

  it('lida com body nulo em update', () => {
    const { controller, cardRepo } = setup();
    const card = Card.create('Tarefa', 'c-1');
    cardRepo.save(card);
    const res = controller.update(card.id, null);
    expect(res.redirect).toBe('/');
  });

  it('lida com query nula em search', () => {
    const { controller, cardRepo } = setup();
    const card = Card.create('Tarefa', 'c-1');
    cardRepo.save(card);
    const res = controller.search(null);
    expect(res.status).toBe(200);
    expect(res.locals.cards).toHaveLength(1);
  });
});
