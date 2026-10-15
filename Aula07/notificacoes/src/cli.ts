// Ponto de partida da linha de comando (Etapa 9). Igual ao src/index.ts:
// pede a aplicação montada ao composition root e entrega a um adaptador
// primário — aqui, o de CLI em vez do HTTP.
//
//   npm run cli -- send --contact 1 --channels fake,whatsapp --message "Oi!"
import { composeApplication, loadConfig } from './main/compositionRoot.js';
import { runCli } from './adapters/cli/runCli.js';

const app = await composeApplication(loadConfig());
process.exitCode = await runCli(process.argv.slice(2), app.useCases);
await app.close();
