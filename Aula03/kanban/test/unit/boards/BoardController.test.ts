import { describe, expect, it } from 'vitest';
import { BoardController } from '../../../src/boards/BoardController.js';
import { InMemoryBoardRepository } from '../../../src/boards/BoardRepository.js';
import { InMemoryCardRepository } from '../../../src/cards/CardRepository.js';
import { Board } from '../../../src/boards/Board.js';
import { Column } from '../../../src/boards/Column.js';

describe('BoardController', () => {
  it('showBoard retorna a view com os dados do quadro', () => {
    const board = Board.create('b-1', 'Quadro', [Column.create('c-1', 'Col 1', 1)]);
    const boardRepo = new InMemoryBoardRepository(board);
    const cardRepo = new InMemoryCardRepository();
    const controller = new BoardController(boardRepo, cardRepo);

    const result = controller.showBoard();

    expect(result.status).toBe(200);
    expect(result.view).toBe('board/index');
    expect(result.locals.board).toBeDefined();
  });

  it('createColumn adiciona uma nova coluna e redireciona', () => {
    const board = Board.create('b-1', 'Quadro', []);
    const boardRepo = new InMemoryBoardRepository(board);
    const cardRepo = new InMemoryCardRepository();
    const controller = new BoardController(boardRepo, cardRepo);

    const result = controller.createColumn({ name: 'Nova Coluna', wipLimit: 2 });

    expect(result.redirect).toBe('/');
    expect(board.columns).toHaveLength(1);
    expect(board.columns[0].name).toBe('Nova Coluna');
    expect(board.columns[0].wipLimit).toBe(2);
  });

  it('createColumn com body não-objeto ou sem wipLimit', () => {
    const board = Board.create('b-1', 'Quadro', []);
    const boardRepo = new InMemoryBoardRepository(board);
    const cardRepo = new InMemoryCardRepository();
    const controller = new BoardController(boardRepo, cardRepo);

    expect(() => controller.createColumn(null)).toThrow();
  });
});
