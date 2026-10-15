// =============================================================================
// Aula 07 / Trabalho III — Serviço de notificações multicanal, agora em
// Ports and Adapters (arquitetura hexagonal).
//
// Este arquivo só dá a partida no servidor HTTP: pede ao composition root a
// aplicação montada e a entrega ao adaptador HTTP. A versão original, com
// tudo num arquivo só, está guardada em legacy/index.ts.
// =============================================================================
import { composeApplication, loadConfig } from './main/compositionRoot.js';
import { createHttpApp } from './adapters/http/createHttpApp.js';

const config = loadConfig();
const { useCases, fakeInbox } = await composeApplication(config);

createHttpApp({ useCases, fakeInbox }).listen(config.port, () => {
  console.log(
    `Aula 07 - notificações rodando em http://localhost:${config.port} ` +
      `(persistência: ${config.persistence}, e-mail: ${config.emailProvider})`,
  );
});
