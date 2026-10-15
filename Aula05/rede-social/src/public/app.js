// Trabalho II — JavaScript do cliente, sem framework.
//
// IDEIA CENTRAL: DELEGAÇÃO DE EVENTOS.
// Em vez de colocar um addEventListener em cada botão (o que não alcançaria
// os posts que chegam depois pelo scroll infinito), colocamos UM listener de
// "click" e UM de "submit" no `document`. Todo clique "sobe" (bubbling) até o
// document; lá olhamos com `closest()` qual botão foi clicado e o que fazer.
// Um post inserido no DOM agora mesmo já funciona, sem nenhum passo extra.

// ---------------------------------------------------------------------------
// fetch com JSON: manda e pede JSON e transforma erro HTTP em exceção.
// ---------------------------------------------------------------------------
async function sendJson(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json', // é isso que faz o servidor responder JSON
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    // A sessão expirou: manda a pessoa fazer login de novo.
    window.location.href = '/login';
    throw new Error('Faça login para continuar');
  }
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Algo deu errado. Tente de novo.');
  }
  return data;
}

// Mensagem rápida no canto da tela (substitui o "recarregar e ver o erro").
function showMessage(text) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 bg-slate-900 text-white text-sm rounded px-4 py-2 shadow-lg';
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---------------------------------------------------------------------------
// Curtidas (post e comentário) — com ATUALIZAÇÃO OTIMISTA (extra 8).
// ---------------------------------------------------------------------------
function paintLike(button, liked, count) {
  button.dataset.liked = String(liked);
  button.classList.toggle('text-rose-600', liked);
  button.classList.toggle('text-slate-500', !liked);
  const heart = button.querySelector('svg');
  if (heart) {
    heart.setAttribute('fill', liked ? 'currentColor' : 'none');
  }
  button.querySelector('[data-like-count]').textContent = String(count);
}

async function toggleLike(button, url) {
  // Duplo clique: enquanto o primeiro pedido não voltou, ignora os outros.
  // (Um <form> comum resolveria isso "de graça" trocando de página.)
  if (button.dataset.pending) return;

  const wasLiked = button.dataset.liked === 'true';
  const oldCount = Number(button.querySelector('[data-like-count]').textContent);

  // 1) Otimista: muda a tela NA HORA, antes de o servidor responder.
  paintLike(button, !wasLiked, oldCount + (wasLiked ? -1 : 1));
  button.dataset.pending = 'true';

  try {
    // 2) Confirma com o servidor e usa o número real que ele devolveu.
    const result = await sendJson(url, 'POST');
    paintLike(button, result.liked, result.likeCount);
  } catch (error) {
    // 3) Deu errado (rede caiu, post apagado...): desfaz a mudança (rollback).
    paintLike(button, wasLiked, oldCount);
    showMessage(`Não foi possível curtir: ${error.message}`);
  } finally {
    delete button.dataset.pending;
  }
}

// ---------------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------------
// Monta o HTML de UM comentário. O texto digitado pelas pessoas entra com
// `textContent` (nunca com innerHTML), para ninguém conseguir injetar HTML ou
// <script> num comentário.
function renderComment(comment) {
  const item = document.createElement('div');
  item.className = 'py-2';
  item.dataset.commentId = comment.id;
  item.innerHTML = `
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium text-slate-800" data-author></p>
      <p class="text-xs text-slate-400" data-date></p>
    </div>
    <p class="text-sm text-slate-700 mt-1" data-content></p>
    <div class="flex items-center gap-3 mt-1 text-xs" data-comment-actions>
      <button type="button" data-action="like-comment" data-liked="false"
        class="flex items-center gap-1 text-slate-500 hover:text-rose-600">
        <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
        <span data-like-count></span>
      </button>
    </div>
  `;
  item.querySelector('[data-author]').textContent = comment.author.name;
  item.querySelector('[data-date]').textContent = new Date(comment.createdAt).toLocaleString('pt-BR');
  item.querySelector('[data-content]').textContent = comment.content;
  paintLike(item.querySelector('[data-action="like-comment"]'), comment.likedByMe, comment.likeCount);

  // Editar/apagar só aparecem para quem escreveu. Isso é só conforto visual:
  // quem garante a regra de verdade é o servidor (requireOwnComment).
  if (comment.isMine) {
    const actions = item.querySelector('[data-comment-actions]');
    actions.insertAdjacentHTML(
      'beforeend',
      `<button type="button" data-action="edit-comment" class="text-slate-500 hover:underline">Editar</button>
       <button type="button" data-action="delete-comment" class="text-red-600 hover:underline">Apagar</button>`,
    );
  }
  return item;
}

function changeCommentCount(card, delta) {
  const counter = card.querySelector('[data-comment-count]');
  counter.textContent = String(Number(counter.textContent) + delta);
}

async function loadComments(section) {
  if (section.dataset.loaded) return;
  section.dataset.loaded = 'true';

  const card = section.closest('[data-post-id]');
  const list = section.querySelector('[data-comments-list]');
  list.innerHTML = '<p class="text-sm text-slate-400 py-2">Carregando comentários...</p>';

  try {
    const comments = await sendJson(`/posts/${card.dataset.postId}/comments`);
    list.innerHTML = '';
    if (comments.length === 0) {
      list.innerHTML = '<p class="text-sm text-slate-500 py-2" data-empty>Nenhum comentário ainda. Seja o primeiro.</p>';
    }
    comments.forEach((comment) => list.appendChild(renderComment(comment)));
  } catch (error) {
    delete section.dataset.loaded; // deixa tentar de novo no próximo clique
    list.innerHTML = '';
    showMessage(`Não foi possível carregar os comentários: ${error.message}`);
  }
}

async function submitComment(form) {
  const button = form.querySelector('button[type="submit"]');
  const textarea = form.querySelector('textarea');
  const card = form.closest('[data-post-id]');
  const list = card.querySelector('[data-comments-list]');

  button.disabled = true; // evita mandar o mesmo comentário duas vezes
  try {
    const comment = await sendJson(form.action, 'POST', { content: textarea.value });
    list.querySelector('[data-empty]')?.remove();
    list.appendChild(renderComment(comment)); // entra na tela sem reload
    changeCommentCount(card, +1);
    textarea.value = '';
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
  }
}

async function editComment(item) {
  const contentEl = item.querySelector('[data-content]');
  const newContent = window.prompt('Editar comentário:', contentEl.textContent);
  if (newContent === null || newContent.trim() === contentEl.textContent) return;

  try {
    const updated = await sendJson(`/comments/${item.dataset.commentId}`, 'PATCH', { content: newContent });
    contentEl.textContent = updated.content;
  } catch (error) {
    showMessage(error.message);
  }
}

async function deleteComment(item) {
  if (!window.confirm('Apagar este comentário?')) return;
  const card = item.closest('[data-post-id]');

  try {
    await sendJson(`/comments/${item.dataset.commentId}`, 'DELETE');
    item.remove();
    changeCommentCount(card, -1);
  } catch (error) {
    showMessage(error.message);
  }
}

// ---------------------------------------------------------------------------
// Carrossel de fotos
// ---------------------------------------------------------------------------
function moveCarousel(carousel, step) {
  const slides = carousel.querySelectorAll('[data-slide]');
  const dots = carousel.querySelectorAll('[data-dot]');
  // Dá a volta: depois da última foto vem a primeira (e vice-versa).
  const index = (Number(carousel.dataset.index) + step + slides.length) % slides.length;
  carousel.dataset.index = String(index);

  slides.forEach((slide, i) => slide.classList.toggle('hidden', i !== index));
  dots.forEach((dot, i) => {
    dot.classList.toggle('bg-white', i === index);
    dot.classList.toggle('bg-white/50', i !== index);
  });
}

// ---------------------------------------------------------------------------
// OS DOIS LISTENERS DELEGADOS
// ---------------------------------------------------------------------------
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const card = button.closest('[data-post-id]');
  const commentItem = button.closest('[data-comment-id]');

  if (action === 'toggle-comments') {
    const section = card.querySelector('[data-comments]');
    section.classList.toggle('hidden');
    loadComments(section);
  } else if (action === 'like-comment') {
    toggleLike(button, `/comments/${commentItem.dataset.commentId}/like`);
  } else if (action === 'edit-comment') {
    editComment(commentItem);
  } else if (action === 'delete-comment') {
    deleteComment(commentItem);
  } else if (action === 'carousel-prev') {
    moveCarousel(button.closest('[data-carousel]'), -1);
  } else if (action === 'carousel-next') {
    moveCarousel(button.closest('[data-carousel]'), +1);
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;

  if (form.matches('[data-like-form]')) {
    event.preventDefault(); // não deixa o navegador recarregar a página
    toggleLike(form.querySelector('button'), form.action);
  } else if (form.matches('[data-comment-form]')) {
    event.preventDefault();
    submitComment(form);
  }
});

// Página do post: os comentários já começam abertos.
document.querySelectorAll('[data-comments][data-autoload]').forEach(loadComments);

// ---------------------------------------------------------------------------
// Scroll infinito (só existe na página do feed)
// ---------------------------------------------------------------------------
const sentinel = document.getElementById('feed-sentinel');

if (sentinel) {
  const feedList = document.getElementById('feed-list');
  const status = document.getElementById('feed-status');
  let loading = false;

  async function loadNextPage() {
    const cursor = sentinel.dataset.nextCursor;
    if (loading || !cursor) return;

    loading = true;
    status.textContent = 'Carregando mais posts...';
    try {
      const page = await sendJson(`/api/feed?cursor=${cursor}&limit=10`);
      // O servidor já manda os cartões prontos (mesmo partial do feed).
      // Como os botões usam delegação, eles já funcionam assim que entram.
      feedList.insertAdjacentHTML('beforeend', page.html);
      sentinel.dataset.nextCursor = page.nextCursor ?? '';
      status.textContent = page.nextCursor ? '' : 'Você chegou ao fim do feed.';
      if (page.nextCursor) {
        // Se o sentinela continua visível (tela grande, página curta), o
        // observer não dispara de novo sozinho: observar de novo força
        // uma nova checagem.
        observer.unobserve(sentinel);
        observer.observe(sentinel);
      } else {
        observer.disconnect();
      }
    } catch (error) {
      status.textContent = 'Não foi possível carregar mais posts. Role de novo para tentar.';
    } finally {
      loading = false;
    }
  }

  // IntersectionObserver avisa quando o "sentinela" (um div vazio no fim da
  // lista) chega perto da área visível — 300px antes, para não dar tempo de
  // a pessoa ver o fim da lista.
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
    },
    { rootMargin: '300px' },
  );

  if (sentinel.dataset.nextCursor) observer.observe(sentinel);
}
