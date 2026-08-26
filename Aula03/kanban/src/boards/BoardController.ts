import type { BoardRepository } from './BoardRepository.js';
import type { CardRepository } from '../cards/CardRepository.js';
import type { ControllerResult } from '../shared/http.js';
import { toBoardViewModel } from './boardView.js';

/**
 * CONTROLLER — orquestra o quadro: busca Board (boards/) e Cards (cards/),
 * pede para a View montar o "view model" e devolve o resultado pronto para
 * `routes.ts` renderizar. Repare que este Controller depende do
 * `CardRepository` do outro módulo para poder desenhar os cartões dentro
 * das colunas — é um acoplamento aferente do módulo `boards` em relação a
 * `cards` que vale discutir em sala (ver aula03.md, seção de discussão).
 */
export class BoardController {
  constructor(
    private readonly boardRepository: BoardRepository,
    private readonly cardRepository: CardRepository,
  ) {}

  showBoard(): ControllerResult {
    const board = this.boardRepository.getDefault();
    const cards = this.cardRepository.findAll();
    return {
      status: 200,
      view: 'board/index',
      locals: { board: toBoardViewModel(board, cards) },
    };
  }

  createColumn(body: unknown): ControllerResult {
    const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const name = typeof raw.name === 'string' ? raw.name : '';
    const rawWip = raw.wipLimit;
    const wipLimit =
      rawWip !== undefined && rawWip !== '' && rawWip !== null && !Number.isNaN(Number(rawWip))
        ? Number(rawWip)
        : null;

    const board = this.boardRepository.getDefault();
    board.addColumn(name, wipLimit);
    return { redirect: '/' };
  }
}
