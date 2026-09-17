# Auditoria e validação — estabilidade online

Fonte de verdade: `package.json` inicia Next App Router e `src/realtime/server.ts`.
`src/app/account/AccountClient.tsx` importa `RemoteGame`, que herda `BrowserGame`.
Offline importa `BrowserGame` via `OfflineGame`; `game.js` legado não é entrypoint.
Prisma gerado permanece exclusivamente produto de `prisma generate`.

## Baseline e causas

- Suíte original: 39 testes passaram, 5 integrações condicionais não executadas inicialmente.
- Reprodução determinística (`tests/remote.test.ts`): três falhas antes da correção.
  1. `OnlineArena` effect depende de snapshot, RTT e settings. PONG reexecuta `apply`
     com delta já aplicado. Guarda permite tick igual; base anterior não corresponde
     ao tick atual. Resultado: RESYNC sem perda de pacote.
  2. Full limpa `pending`, inclusive inputs sem ACK, introduzindo salto de posição.
  3. Cada delta após base inválida envia outro RESYNC sem aguardar resposta.
- BrowserGame escreve width/height em todo evento resize, mesmo sem mudança real.
- RemoteGame aloca arrays/objetos de inimigos/status e colegas em cada frame.
- `setSnapshot` reprocessa toda a página da conta a cada snapshot e ainda pode
  condensar mensagens em um render React, quebrando uma cadeia de deltas.
- Primeiro teste amplo em Chrome excedeu 180 s (cold compile/registro/social/solo).
  Já chegou à partida, mas não completou a janela de medição. Cenário dedicado
  separa reprodução do custo de preparar conta/social e possui timeout explícito.

## Contrato de verificação

V16: `tests/remote.test.ts`: repetição, resync, ACK e preservação de cena.
V17: `tests/browser/stability.spec.ts`: engine/RAF, resize, taxa, erros, FPS/1% low;
fixture servidor usa auth/WS/simulação/snapshots reais e contas `stability_` isoladas.
A fixture adiciona inimigos e HP para observação contínua, sem comando de cheat em
HTTP/WS. Não é entrypoint de produção. Comparações de FPS identificam carga/modo.
Demais fases terão resultados e limites registrados após execução.
