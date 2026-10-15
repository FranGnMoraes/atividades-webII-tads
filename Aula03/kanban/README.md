# Trabalho I — Kanban: registro de decisões

> **Autora:** Francine Moraes · Web II (TADS). O README original do template continua abaixo.

**Situação:** atividades obrigatórias 1 a 7 implementadas, mais as extras 8 (detalhe do cartão, `GET /cards/:id`)
e 9 (busca, `GET /cards/search?query=`). `npm test`: **79 testes passando**. `npm run test:coverage`:
**100%** de statements, branches, funções e linhas. Nenhum `test.todo` restou, e os testes de "responde 501"
das rotas implementadas foram removidos.

## Discussão obrigatória (respostas)

**1. O acoplamento entre `boards/` e `cards/` é um problema real ou aceitável agora?**
Para o tamanho atual, é **aceitável**. São dois módulos pequenos, no mesmo processo, e um conhece o outro só
pela **interface** do repositório (`CardRepository` / `BoardRepository`), não pela implementação em memória.
O `BoardController` precisa dos cartões para desenhar o quadro, e o `CardController` precisa perguntar se a
coluna existe e qual é o limite de WIP. Esse é um acoplamento **de negócio** (a regra "o cartão precisa estar
numa coluna que existe" depende dos dois), e não um acoplamento técnico. O custo aparece quando algo muda: os
dois módulos são ao mesmo tempo **aferentes e eferentes** um do outro, então uma mudança em `BoardRepository`
pode obrigar a mexer em `cards/`, e vice-versa.

**2. Se `cards` virasse um serviço separado, o que quebraria primeiro?**
A validação de coluna dentro do `CardController` (`boardRepository.getDefault().hasColumn(...)` e
`findColumn(...).wipLimit`). Hoje é uma chamada de função na memória. Separado, viraria uma chamada de rede
para o serviço de boards, que pode estar fora do ar ou lento. Também quebraria o `BoardController.showBoard`,
que lê todos os cartões direto do `CardRepository` para montar a tela. A regra de **limite de WIP** é a mais
delicada: contar os cartões e conferir o limite teria que acontecer entre dois serviços, sem uma transação única.

**3. E se o `Board` "possuísse" a lista de ids de cartões?**
**Resolveria:** o `CardController` não precisaria mais perguntar ao `BoardRepository` se a coluna existe. O
próprio quadro saberia quais cartões estão em cada coluna e poderia aplicar o limite de WIP sozinho, num lugar
só. **Criaria de novo:** a mesma informação ("em que coluna está o cartão") passaria a existir em dois lugares
(no `Card.columnId` e na lista do `Board`), e as duas cópias precisariam ser mantidas iguais a cada criar,
mover e excluir. Além disso, `boards/` passaria a depender ainda mais de `cards/`: o acoplamento mudaria de
direção, mas não sumiria.

## Decisões do grupo pedidas nos critérios de aceite

| Atividade | Decisão | Onde está no código |
| --- | --- | --- |
| 2 / 5 — Onde aplicar o limite de WIP | **Nos dois lugares:** ao **criar** um cartão direto numa coluna e ao **mover** para outra coluna. Mover para a mesma coluna em que o cartão já está não conta. | `CardController.create` e `CardController.move` |
| 4 — Restringir exclusão de cartão em "Concluído"? | **Não restringir.** Diferente da Aula 02 (onde a tarefa concluída era um registro do que foi feito), no quadro Kanban limpar a coluna "Concluído" é uma ação comum de organização. Por isso não foi criado erro novo. | `CardController.remove` |
| 6 — Título duplicado | Bloqueado **na mesma coluna** (409), ao criar, ao editar e também ao **mover** (para não levar um título repetido para a outra coluna). Em colunas diferentes é permitido, igual à Aula 02. | `existsWithTitleInColumn(...)` em `create`, `update` e `move` |
| 7 — Nomes de coluna duplicados no mesmo quadro? | **Permitidos.** As colunas são identificadas pelo `id` gerado (`col-xxxxxxxx`), não pelo nome. Assim, duas colunas "Revisão" não se confundem no código. | `Board.addColumn` |
| 7 — `wipLimit` da coluna nova | Opcional. Vazio ou não numérico vira `null` (sem limite). | `BoardController.createColumn` |
| 10 (estica) — `ColumnExistenceChecker` | **Não implementado.** Na nossa avaliação, uma porta só para "a coluna existe?" resolveria pouco: o `CardController` também precisa do `wipLimit` e do nome da coluna, então a porta cresceria até virar uma cópia do `BoardRepository`. Seria só disfarçar o acoplamento. | — |

---

# Aula 03 — Template Kanban (MVC + banco em memória + Tailwind)

Template de partida para a atividade prática da Aula 03. Uma aplicação de gestão de tarefas estilo Trello/Jira (quadro → colunas → cartões), em MVC, com "banco de dados" em memória e UI em Tailwind (via CDN).

**Estado inicial:** só existe UM caso de uso funcionando — `GET /` mostra o quadro hard-coded definido em `src/seed.ts`. Todo o resto (criar/mover/editar/excluir cartão, criar coluna, buscar, etc.) está com a assinatura pronta e a implementação pendente. Essa é a atividade da aula — ver a lista completa em [`../aula03.md`](../aula03.md).

## Rodando

```bash
npm install
npm test              # suíte completa (unit + integration + e2e)
npm run test:coverage  # com relatório de cobertura — a meta é 100%
npm run dev             # sobe o servidor em http://localhost:3002
```

Abra `http://localhost:3002` para ver o quadro. Os formulários de criar cartão já apontam para `POST /cards`, que hoje responde `501 Not Implemented` — é esperado.

## Estrutura (package by feature)

```
src/
├── boards/                  → tudo relacionado a Quadro e Coluna
│   ├── Board.ts               MODEL: aggregate root (colunas)
│   ├── Column.ts               MODEL: uma coluna (nome, ordem, limite de WIP)
│   ├── BoardRepository.ts      MODEL (persistência): banco em memória do quadro
│   ├── BoardController.ts      CONTROLLER: showBoard() pronto; createColumn() pendente
│   ├── boardView.ts             VIEW: monta o "view model" (inclui os cartões)
│   └── errors.ts                 erros de domínio deste módulo
├── cards/                   → tudo relacionado a Cartão
│   ├── Card.ts                 MODEL: título/prioridade/descrição validados; mover/renomear pendentes
│   ├── CardRepository.ts        MODEL (persistência): banco em memória dos cartões — PRONTO
│   ├── CardController.ts        CONTROLLER: todos os métodos pendentes
│   └── errors.ts                 erros de domínio deste módulo
├── shared/
│   ├── errors.ts                NotImplementedError
│   ├── http.ts                   ControllerResult + respond()
│   └── errorHandler.ts           mapeia erro de domínio → status HTTP
├── views/
│   ├── board/index.ejs           UI do quadro (Tailwind)
│   └── error.ejs                  página de erro genérica
├── seed.ts                   dados hard-coded (o quadro que aparece em GET /)
├── routes.ts                  todas as rotas já registradas
├── server.ts                   monta o Express app (injeta repositórios)
└── index.ts                    sobe o servidor HTTP
```

Por que `boards/` e `cards/` como módulos separados (em vez de `domain/`, `controllers/`, `views/` como na Aula 02)? Porque o tema da Aula 03 é justamente **package by feature x package by layer** — este template já nasce organizado por funcionalidade. Reparem no acoplamento cruzado que isso expõe: `BoardController` depende do `CardRepository` (para desenhar cartões dentro das colunas) e `CardController` depende do `BoardRepository` (para validar coluna). Isso é discutido em [`../aula03.md`](../aula03.md).

## O que já está pronto x o que é a atividade

| Camada | Pronto | Pendente (atividade da turma) |
| --- | --- | --- |
| Model (`Board`, `Column`) | Validação de nome de coluna, `findColumn`, `hasColumn`, `toSnapshot` | `addColumn` (Atividade 7) |
| Model (`Card`) | Validação de título/prioridade/coluna, `restore`, `toSnapshot` | `changeColumn`, `rename`, `changePriority` (Atividades 2 e 3) |
| Persistência (`*Repository`) | CRUD completo, em memória, testado | — (já está pronto; usem os métodos existentes) |
| Controller (`BoardController`) | `showBoard()` | `createColumn()` (Atividade 7) |
| Controller (`CardController`) | — | `create`, `move`, `update`, `remove`, `showDetail`, `search` (Atividades 1, 2, 3, 4, 8, 9) |
| View / rotas | Renderização do quadro, todas as rotas registradas, tratamento de erro central | — |
| Testes | 100% de cobertura do que existe hoje | Cobrir cada atividade nova (ver `test.todo` como checklist) |

## Testes: onde estão e o que fazer com eles

```
test/
├── unit/                 → Model isolado (Board, Column, Card)
├── integration/
│   ├── boards/, cards/    → Repository real (sem dublês)
│   ├── shared/             → errorHandler isolado
│   └── routes/             → Express + Controller + Repository reais, via Supertest
│       ├── board.routes.test.ts
│       └── cards.routes.test.ts   ← tem os `test.todo(...)` do backlog
└── e2e/
    └── board.e2e.test.ts    → GET / com o quadro REAL (src/seed.ts), sem repositórios injetados
```

Dois detalhes importantes:

1. **`test.todo(...)`** — em `test/integration/routes/cards.routes.test.ts` e `test/e2e/board.e2e.test.ts` há uma lista de testes com `test.todo(...)` em vez de `it(...)`. São specs do comportamento esperado de cada atividade, ainda não implementadas — o Vitest lista como "todo" e não falha a suíte. Ao implementar uma atividade, transformem o `test.todo` correspondente em um `it(...)` de verdade.
2. **Os testes "responde 501"** em `cards.routes.test.ts` e `board.routes.test.ts` (`POST /columns`) documentam o comportamento ATUAL. Quando vocês implementarem a atividade correspondente, esses testes vão passar a falhar (a rota não vai mais responder 501) — **isso é o esperado**: apaguem/substituam o teste de 501 pelo `test.todo` transformado em teste real.

## Cobertura: por que 100% e como manter

`vitest.config.ts` define `thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }`. O estado inicial deste template já bate 100% — rodem `npm run test:coverage` agora, antes de mexer em qualquer coisa, para ver.

Na prática isso significa: **toda linha de código novo que vocês escreverem precisa de pelo menos um teste que passe por ela.** Não é burocracia — é o motivo de existir tanto dublê pronto (repositórios reais, fixtures em `test/helpers/fixtures.ts`) para vocês não perderem tempo montando infraestrutura de teste, só escrevendo o teste da regra que importa.

Dica: implementem casos de uso simples e testáveis (retornam cedo em erro, uma responsabilidade por método) — fica mais fácil cobrir 100% dos branches sem casos artificiais.
