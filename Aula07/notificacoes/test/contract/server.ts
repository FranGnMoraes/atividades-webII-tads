import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

// ETAPA 1 — rede de segurança CAIXA-PRETA.
//
// Os testes de contrato não importam nada de `src/`: sobem o servidor de
// verdade num processo separado (`tsx <entrada>`) e conversam com ele só por
// HTTP, como o REST Client faria. Por isso a MESMA suíte roda contra o código
// original (legacy/index.ts) e contra o refatorado (src/index.ts):
//
//   npm run test:contract           → versão refatorada (padrão)
//   npm run test:contract:legacy    → versão original, de um arquivo só
//
// O que dificultou testar o original (sintoma que a arquitetura resolve):
// - não existe uma função que crie o app: o arquivo já conecta no banco e
//   chama `app.listen` ao ser importado, então só dá para testar subindo o
//   processo inteiro;
// - a falha do SMS usa `Math.random()` direto. O único controle possível é a
//   variável SMS_FAILURE_RATE: 0 = nunca falha, 1 = sempre falha. Para testar o
//   retry, sobem DOIS servidores no mesmo banco (um que sempre falha e outro
//   que nunca falha);
// - o limite por minuto usa `Date.now()` direto: não dá para "avançar o
//   relógio", só para testar dentro do mesmo minuto;
// - a latência fixa (150 ms SMS, 300 ms e-mail) deixa a suíte lenta.
const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const CONTRACT_DB_URL = `file:${path.join(ROOT, 'contract.db')}`;
const ENTRY = process.env.CONTRACT_ENTRY ?? 'src/index.ts';

export interface RunningServer {
  url: string;
  stop(): Promise<void>;
}

export async function startServer(port: number, env: Record<string, string> = {}): Promise<RunningServer> {
  const child: ChildProcess = spawn('npx', ['tsx', ENTRY], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: CONTRACT_DB_URL, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk) => (output += chunk));
  child.stderr?.on('data', (chunk) => (output += chunk));

  const url = `http://localhost:${port}`;
  await waitUntilUp(url, () => output);

  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}

async function waitUntilUp(url: string, output: () => string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${url}/contacts`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`servidor não subiu em ${url}\n${output()}`);
}

// Pequeno cliente HTTP: devolve status + corpo já convertido de JSON.
export async function api(baseUrl: string, method: string, route: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, body: json, text, contentType: response.headers.get('content-type') ?? '' };
}
