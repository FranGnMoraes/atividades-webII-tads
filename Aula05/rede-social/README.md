# Trabalho II — Rede social: curtidas, comentários, várias fotos e scroll infinito

> **Autora:** Francine Moraes · Web II (TADS) · projeto-base: `rede-social/` da Aula 05.
> O README original da aula continua logo abaixo, a partir de "Aula 04 — Rede social mínima".

## Como rodar

```bash
cp .env.example .env
npm install
npm run prisma:migrate     # aplica as 2 migrations (a da Aula 05 + a do Trabalho II)
npm run prisma:seed        # 3 usuários (senha "senha123"), 25 posts, fotos, curtidas e comentários
npm run dev                # http://localhost:3003 — entre como ana@exemplo.com
npm test                   # 77 testes (os 33 da Aula 05 + 44 novos)
```

> Se o `npm install` avisar que bloqueou "install scripts" (npm 12 ou mais novo), o `package.json`
> já traz a lista `allowScripts` com os pacotes que precisam compilar (Prisma, bcrypt, SQLite).

## O que foi feito

| # | Atividade | Onde está |
|---|---|---|
| 1 | Curtidas em posts (`Like`, alterna com 1 rota) | `prisma/schema.prisma`, `src/likes/` |
| 2 | Comentários (`Comment`), criar, listar e apagar o próprio | `src/comments/`, `requireOwnComment` em `src/auth/middleware.ts` |
| 3 | Curtidas em comentários (`CommentLike`) | `src/likes/` |
| 4 | Várias fotos por post (`PostImage`, `upload.array('images', 5)`) | migration do Trabalho II, `src/webRoutes.ts`, `src/posts/PostController.ts` |
| 5 | Carrossel em JavaScript puro | `src/views/partials/postCard.ejs`, `src/public/app.js` |
| 6 | Scroll infinito por cursor (`GET /api/feed?cursor=&limit=`) | `src/feed/`, `src/public/app.js` |
| 7 | Editar o próprio comentário (`PATCH /comments/:id`) | `src/comments/` |
| 8 | Curtida otimista com rollback | `toggleLike` em `src/public/app.js` |
| 9 | Comentários ordenados pelos mais curtidos | `CommentController.list` |
| 10 | Contador de novas curtidas/comentários desde o último acesso | `src/notifications/`, `User.lastSeenAt` |

### Rotas novas

| Método e rota | Login? | O que faz |
|---|---|---|
| `POST /posts/:id/like` | sim | curte ou descurte (alterna). Responde `{ liked, likeCount }` |
| `GET /posts/:id/comments` | não | lista os comentários (JSON) |
| `POST /posts/:id/comments` | sim | cria comentário. JSON (201) para o fetch, redirect para o form |
| `PATCH /comments/:id` | sim + dono | edita o próprio comentário |
| `DELETE /comments/:id` | sim + dono | apaga o próprio comentário (204) |
| `POST /comments/:id/like` | sim | curte ou descurte um comentário |
| `GET /api/feed?cursor=<id>&limit=10` | sim | próxima página do feed: `{ nextCursor, count, html }` |
| `GET /posts/:id` | sim | página de um post, já com os comentários abertos |

### O que mudou no schema e por quê

- **`Like`** (`userId`, `postId`, `createdAt`, `@@id([userId, postId])`): N:N explícita entre User e Post,
  igual ao `Follow`. A chave composta é a regra "uma pessoa curte um post no máximo uma vez".
- **`Comment`** (`id`, `content`, `createdAt`, `authorId`, `postId`): 1:N com Post e com User. Tem id próprio
  porque a mesma pessoa pode comentar várias vezes no mesmo post.
- **`CommentLike`** (`userId`, `commentId`, `createdAt`, `@@id`): a mesma ideia do `Like`, aplicada ao comentário.
- **`PostImage`** (`id`, `url`, `order`, `postId`): 1:N, substitui a coluna `Post.imageUrl`. O `order` é a
  posição da foto no carrossel. O arquivo continua no `ImageStorage`, e o banco guarda só a URL.
- **`User.lastSeenAt`**: usado só pelo contador de notificações (extra 10).
- Tudo com `onDelete: Cascade`: se um post ou um usuário for apagado, as curtidas, os comentários e as fotos
  dele também são, porque não fazem sentido sozinhos.

## Discussão obrigatória (respostas)

**1. Controllers separados ou tudo no `PostController`?**
Separados. Criei os módulos `likes/`, `comments/`, `feed/` e `notifications/`, cada um com o seu
Controller (que recebe o `PrismaClient` por injeção, igual ao `PostController`) e o seu arquivo de rotas.
O motivo é a coesão da Aula 03: cada módulo cuida de um assunto só, e o `PostController` não virou um
arquivo gigante. Mudar a regra de comentário não mexe em quem cuida de post.
**O que cada módulo expõe:** só o Controller e a função `createXRoutes`. Nenhum deles importa nada de
dentro de `posts/`: quando `likes/` precisa saber se um post existe, consulta pelo Prisma compartilhado
(o enunciado diz que isso é aceitável). O `comments/` entrega para fora um formato próprio (`CommentView`,
já com `likeCount`, `likedByMe` e `isMine`), então quem usa não precisa conhecer a tabela `CommentLike`.

**2. Como migrar `Post.imageUrl` sem perder dados?**
Com **migration com passo de dados**. Gerei a migration com `prisma migrate dev --create-only` e, antes
de a coluna ser apagada, acrescentei à mão um
`INSERT INTO "PostImage" (url, order, postId) SELECT imageUrl, 0, id FROM Post WHERE imageUrl IS NOT NULL`.
Assim, cada post que tinha foto continua com ela (na posição 0). O teste `test/integration/migration.test.ts`
prova isso: monta um banco só com a migration antiga, insere posts com e sem foto, roda a migration nova e
confere que as fotos estão em `PostImage`.
O `prisma migrate reset` serve só em desenvolvimento, porque apaga o banco inteiro. **Em produção só a
data migration é aceitável**, porque lá os dados são de usuários reais e não podem ser recriados com um seed.

**3. Por que trocar o reload por `fetch` na curtida, e o que o cliente passa a tratar?**
Com `fetch`, só a curtida vai ao servidor e só o número muda na tela. A página não pisca, o scroll não
volta para o topo e os comentários abertos continuam abertos. Em troca, o JavaScript precisa fazer o que o
`<form>` fazia "de graça":
- **carregando:** o botão de comentar fica `disabled` enquanto o pedido não volta;
- **erro de rede:** aparece uma mensagem, e a curtida otimista volta ao estado anterior (rollback);
- **duplo clique:** enquanto um pedido de curtida está em andamento, os cliques seguintes são ignorados
  (`data-pending`);
- **sessão expirada:** o servidor responde 401 em JSON (em vez de redirecionar) e o cliente leva para `/login`.

Os formulários continuam no HTML: sem JavaScript, curtir e comentar ainda funcionam, só que com reload.

**4. Botões dos posts que chegam pelo scroll infinito.**
**Delegação de eventos.** Em `src/public/app.js` existe **um** listener de `click` e **um** de `submit`
no `document`. Como os eventos "sobem" (bubbling) até o `document`, o listener usa `event.target.closest(...)`
para descobrir qual botão foi clicado (pelos atributos `data-action`, `data-like-form` e `data-comment-form`).
Um post inserido agora pelo scroll infinito já funciona, sem nenhum `addEventListener` novo.

## Outras decisões

- **Uma rota que alterna** a curtida (`POST /posts/:id/like`), em vez de POST + DELETE: o botão não
  precisa saber o estado atual para escolher o verbo. O servidor responde com o estado e a contagem reais.
- **Curtir/comentar não exige seguir o autor.** Quem consegue ver o post pode interagir com ele.
- **Só o autor apaga ou edita o comentário**, nem o dono do post (mesma regra do `requireOwnPost`).
- **Paginação por cursor (id)**, não por número de página: se alguém postar enquanto eu rolo, a página 2
  não repete o último post da página 1. Pede-se `limit + 1` para saber se existe próxima página.
- **O scroll infinito devolve HTML pronto dentro do JSON** (`html`), gerado pelo mesmo partial
  `postCard.ejs` da página inicial. Assim o desenho do post existe num lugar só. Já os comentários
  chegam como dados (JSON) e o `app.js` monta cada um usando `textContent` (nunca `innerHTML` com texto
  digitado por alguém), para evitar injeção de HTML.
- **Limite de 5 fotos por post** (`MAX_IMAGES_PER_POST`). Mandar mais vira 400 (erro do Multer).
- **`likedByMe` sem consulta extra:** o `include` traz `likes` filtrado pelo usuário logado (lista com 0 ou 1
  item). É a mesma ideia do `isFollowing` em `UserController.listOthers`.
- **Notificação:** não existe tabela de notificações. A cada abertura do feed, contamos as curtidas e os
  comentários **de outras pessoas** nos meus posts com `createdAt` depois do `lastSeenAt` e atualizamos o
  `lastSeenAt`. No primeiro acesso o contador começa zerado.

## Testes

`npm test` roda 77 testes (9 arquivos). Os novos estão em `test/integration/likes.routes.test.ts`,
`comments.routes.test.ts`, `feed.routes.test.ts` e `migration.test.ts`. Cada funcionalidade tem o
caminho feliz e pelo menos um caminho de erro: sem login (401), comentário de outra pessoa (403),
post inexistente (404), conteúdo vazio (400), fotos demais (400) e `limit` inválido (400).

**Testes da Aula 05 que precisaram de ajuste:** em `posts.routes.test.ts`, dois testes passaram a enviar o
arquivo no campo `images` (antes `image`), e um deles passou a ler a URL em `post.images` (antes
`post.imageUrl`). Foi uma mudança de contrato feita de propósito (o enunciado pede `upload.array('images')`
e o fim da coluna `imageUrl`). O que esses testes verificam continua igual.

## Como conferir que não há reload

Abra o DevTools → aba **Network** → filtro **Fetch/XHR**. Curtir, comentar, abrir comentários e rolar até o
fim do feed geram só requisições `fetch` (`POST /posts/25/like`, `GET /api/feed?cursor=...` etc.), sem
nenhuma requisição do tipo "document".

---

# Aula 04 — Rede social mínima (Prisma)

Aula de camada de persistência com ORM. Uma API HTTP mínima de rede social, modelada com Prisma sobre SQLite, cobrindo as três formas de relação que a aula precisa demonstrar:

* **1:N** — `User → Post` (um autor tem muitos posts).
* **N:N implícita** — `Post ↔ Tag` (o Prisma cria e gerencia a tabela de junção sozinho).
* **Autorrelação N:N** — `User ↔ User` via `Follow` (seguidores/seguindo), com tabela de junção **explícita** porque há duas relações diferentes com `User` no mesmo model.

Ver o schema completo em [`prisma/schema.prisma`](prisma/schema.prisma).

## Rodando

### Rodando com Docker (recomendado)

Rodar em container resolve o problema de ambiente: todo mundo usa a mesma versão de Node e os módulos nativos (`better-sqlite3`, `bcrypt`) são compilados dentro da imagem, para Linux — não importa se a máquina é macOS, Windows ou Linux. Não é preciso ter Node nem `npm install` na máquina, só o Docker.

```bash
cp .env.example .env      # opcional: o compose já tem defaults para tudo
docker compose up         # constrói na primeira vez e sobe em http://localhost:3003
```

O container aplica as migrations sozinho ao subir ([`docker/entrypoint.sh`](docker/entrypoint.sh)). Para popular o banco com os dados de exemplo (3 usuários, senha `senha123`):

```bash
docker compose exec app npm run prisma:seed
```

**Refresh automático:** a pasta do projeto é montada dentro do container (bind mount), e o comando padrão é `tsx watch`. Salvar um arquivo `.ts` reinicia o servidor; salvar um `.ejs` já vale na próxima requisição — sem rebuild, sem `docker compose restart`.

Outros comandos úteis:

```bash
docker compose up --build                 # reconstrói a imagem (necessário só após mexer no package.json)
docker compose logs -f app                # acompanha os logs
docker compose exec app npm test          # roda a suíte dentro do container
docker compose exec app sh                # abre um shell no container
docker compose down                       # derruba
```

Se os logs estiverem verbosos demais, é o `DEBUG="prisma*"` do `.env` — comente essa linha e rode `docker compose restart app`.

#### O que cada arquivo faz

| Arquivo | Papel |
| --- | --- |
| [`Dockerfile`](Dockerfile) | Imagem de desenvolvimento em estágios: `base` (Node + openssl), `deps` (instala e compila `node_modules`), `dev` (a imagem que roda). |
| [`docker-compose.yml`](docker-compose.yml) | Orquestra o serviço `app`: variáveis de ambiente, porta 3003 e os volumes. |
| [`docker/entrypoint.sh`](docker/entrypoint.sh) | Roda `prisma migrate deploy` antes de iniciar o servidor. |
| [`.dockerignore`](.dockerignore) | Mantém `node_modules`, `dist`, `coverage` e os `.db` fora do contexto de build. |
| [`.env.example`](.env.example) | Documenta todas as variáveis que a aplicação lê. |

Dois detalhes do [`docker-compose.yml`](docker-compose.yml) que valem uma olhada em aula:

* **O volume anônimo `- /app/node_modules`.** O bind mount `.:/app` cobriria o `node_modules` compilado dentro da imagem com o da máquina host — que no macOS/Windows tem os binários nativos do SO errado. O volume anônimo por cima "protege" essa pasta.
* **O banco continua sendo o `dev.db` da pasta do projeto**, porque ele está dentro do bind mount. Ou seja: os dados sobrevivem ao `docker compose down` e o `npm run prisma:studio` na máquina host continua abrindo o mesmo banco que o container usa.

O upload de imagens segue a mesma lógica de sempre ([`src/uploads/createImageStorage.ts`](src/uploads/createImageStorage.ts)): sem `AWS_S3_BUCKET`/`AWS_REGION` no `.env`, os arquivos vão para `uploads/` — que também está no bind mount, então aparecem na pasta do projeto.

> Esta imagem é de **desenvolvimento** (roda TypeScript direto com `tsx`, inclui as devDependencies). Empacotar para produção — build com `tsc`, imagem só com `dist/` e dependências de runtime — é assunto de outra aula.

### Rodando direto na máquina (sem Docker)

```bash
npm install              # também roda `prisma generate` (postinstall)
npm run prisma:migrate    # cria dev.db e aplica a primeira migration
npm run prisma:seed       # popula com 3 usuários, 3 posts, 2 tags, 3 follows
npm run dev                 # sobe a API em http://localhost:3003
npm test                     # suíte de integração (usa um SQLite dedicado, test.db)
```

`npm run prisma:studio` abre o Prisma Studio (GUI) para inspecionar as tabelas — útil para mostrar em aula a tabela de junção implícita `_PostToTag`, que não existe no schema mas existe no banco.

### Testando manualmente com [`test.http`](test.http)

Com a extensão **REST Client** (Huachao Mao) instalada no VS Code, abra [`test.http`](test.http) e clique em "Send Request" acima de cada bloco. O arquivo cobre o fluxo completo (criar usuários, seguir, criar posts com tags, feed, busca por tag) e uma seção de casos de erro (400/404/409) — os requests estão encadeados via variáveis nomeadas (`{{createAna.response.body.$.id}}`), então rode de cima para baixo na primeira vez.

## Endpoints

| Método | Rota | O que demonstra |
| --- | --- | --- |
| `POST /users` | cria usuário (`{ name, email }`) | — |
| `GET /users/:id` | usuário + `_count` de posts/seguidores/seguindo | contagem via relação |
| `POST /users/:id/follow` | segue outro usuário (`{ targetId }`) | **autorrelação N:N** |
| `GET /users/:id/feed` | posts de quem o usuário segue | filtro relacional aninhado (`author.followers.some`) |
| `POST /posts` | cria post (`{ authorId, content, tags?: string[] }`) | **1:N** (`connect`) + **N:N** (`connectOrCreate`) na mesma escrita |
| `GET /posts/:id` | post com autor e tags | `include` |
| `GET /tags/:name/posts` | posts de uma tag | N:N do outro lado |

## Estrutura

```
prisma/
├── schema.prisma   → os 4 models e as 3 relações
└── seed.ts          → dados de exemplo

src/
├── db.ts                    fábrica de PrismaClient
├── users/UserController.ts   create, get, follow, feed
├── posts/PostController.ts   create, get, listByTag
├── shared/                   erros de domínio, error handler, asyncHandler
├── routes.ts, server.ts, index.ts

test/
├── globalSetup.ts            aplica as migrations no banco de teste antes da suíte
├── helpers/testDb.ts          PrismaClient de teste + reset de tabelas
└── integration/               rotas testadas ponta a ponta com Supertest + SQLite real
```

De propósito, os Controllers chamam o Prisma Client diretamente — **não há repositório nem porta de persistência ainda**. Essa separação (arquitetura em camadas/hexagonal, isolando o domínio do Prisma) é o tema da Aula 05, que reaproveita este mesmo Prisma Client como adaptador.

## Testes: por que usam SQLite real, não mocks

`test/globalSetup.ts` roda `prisma migrate deploy` contra um `test.db` isolado antes da suíte, e cada teste começa com `resetDatabase()` (limpa as tabelas na ordem certa: `Follow → Post → Tag → User`). Isso segue a mesma filosofia das Aulas 02/03: testar a colaboração real com o ORM, não uma simulação dele — um mock de Prisma não pegaria, por exemplo, uma violação de unicidade (`P2002`) real.

## Atividade em sala

1. Rodar `npm run prisma:studio` e abrir a tabela `_PostToTag` — perguntar: "isso está em algum lugar do `schema.prisma`?" (resposta: não, o Prisma cria sozinho).
2. Seguir o fluxo `POST /users` → `POST /users/:id/follow` → `GET /users/:id/feed` com dois usuários e comparar o feed antes/depois do follow.
3. Ler `UserController.follow` e discutir: por que validar `targetId === followerId` no código, em vez de deixar o banco rejeitar? E por que ainda assim existe um `try/catch` para `P2002`?
4. Alterar `Follow` para incluir um campo `createdAt` já existe — desafio: adicionar um endpoint `GET /users/:id/following` que lista quem o usuário segue (usar `user.following` com `include: { following: true }`).
