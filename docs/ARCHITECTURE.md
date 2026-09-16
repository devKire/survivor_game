# Arquitetura e operação

## Processo web e processo realtime

- Next.js 16 App Router: páginas, autenticação Better Auth, Server Actions discretas.
- PostgreSQL/Neon via Prisma 7, schema exclusivo `limiar`. Sem posição/frame no banco.
- Processo Node/WebSocket persistente: presença, distribuição de chat, salas e simulação.
- Canvas 2D preservado. O mesmo core roda localmente no solo e no servidor para co-op.
- Uma instância realtime é a autoridade. Não executar várias réplicas sem roteamento de
  salas/coordenação, pois os estados efêmeros ficam em memória.

Não houve definição de hospedagem na conversa. A implementação prepara processos separados,
compatíveis com web em Vercel + realtime em VPS/container, ou ambos em Docker/VPS.
WebSocket precisa de proxy com upgrade, TLS (`wss://`) e timeout maior que o heartbeat.

## Módulos

`src/game/content`: catálogo preservado. `core`: coleções, matemática, entidades, mundo,
diretor, ataques, simulação, save e orquestração co-op. `client`: entrada, UI, áudio,
renderer Canvas, montagem/dispose e renderização remota. `network`: protocolo validado,
movimento previsto e conexão. `realtime`: autenticação do socket, rooms, deltas e
persistência idempotente. `server`: autenticação, Prisma, amizades, equipes e progresso.

A extração conserva algoritmos e oito estratégias de ataque do engine original.
`CoopSimulation` coordena vários jogadores sobre os mesmos arrays de inimigos, projéteis,
chunks e WaveDirector. Não executa cinco cópias do mundo. A UI e o áudio são portas
injetáveis, com implementações vazias para execução headless.

## Fonte de verdade

| Dado/modo | Autoridade |
|---|---|
| Solo offline | Core local, save `limiar.save.v1`, migrado para schema 3 |
| Solo na conta | Core local; arquivo solo com revisão na conta, cache recuperável |
| Sessão de conta | Better Auth + cookie HttpOnly; sessão consultada no servidor |
| Progresso econômico online | Resultados calculados pelo servidor, transação idempotente |
| Save legado importado | Arquivo solo na conta, com proveniência local, sem virar mérito online |
| Equipe/código/ready | Serviços autenticados; lock transacional e slots 0–4 únicos |
| Posição/HP/inimigos/XP | Memória da room autoritativa |
| Presença | Sockets em memória; lastSeenAt apenas nos eventos de conexão |
| Chat | Mensagem autorizada/persistida; transmissão via WebSocket |

Saves offline não possuem assinatura histórica. Não é possível provar sua veracidade.
Importar mantém o arquivo completo e configurações na conta, mas não concede ouro ou
achievements online a partir de declarações do cliente. O save local nunca é apagado no logout.

## Transporte

Ticket HMAC de 30 s, uso único, enviado na primeira mensagem do socket (nunca na URL).
Sessão é validada no banco e revalidada periodicamente. Origem precisa corresponder a
REALTIME_ORIGIN. Limites por conexão/IP, maxPayload, backpressure e expiração de ociosidade.

Simulação: 25 Hz. Render: requestAnimationFrame. Snapshots: 10 Hz; regiões ±1000×800
unidades por jogador, com bosses globais. Estado anterior por conexão, remoções e
resync. Cliente prevê movimento e reaplica inputs ainda não confirmados sobre a posição
autoritativa; demais entidades interpolam entre snapshots. Efeitos decorativos permanecem locais.

Desconexão mantém o jogador por 60 s. Não há ingresso novo após start. Uma reconexão usa
mesmo jogador, room e partySizeAtStart. Reinício do processo realtime marca partidas
interrompidas; não fabrica resultados nem recompensas a partir de estado perdido.

## Co-op e design

COOP_SCALING define HP, spawn, limite, frequência de elite, HP de boss, formação e divisor
XP para 1–5. O tamanho fica fixo na criação. Growth contribui com média do bônus da equipe,
capada em +15%; divisor XP cresce até 2.9 para cinco jogadores. Ajustes dependem de telemetria.

XP/nível compartilhados; decisões e builds individuais. Escolhas pendentes visíveis no HUD.
Boss chest concede recompensa individual a cada membro. Urna: TEAM. Fonte, cofre,
obelisco e troca/memória: PERSONAL. Fenda e silêncio: maioria da equipe, votação de 15 s.
Sem friendly fire e sem bloqueio entre jogadores. Revive: 3 s segurando E, a 65 unidades,
interrompido por movimento/dano. Sem bleedout; todos caídos termina a run.

Decisões exigem XP e janelas de tempo (26 alvo em 30 min). Paths após 6 min; evolução após
10 min. Após as escolhas manuais, conversão automática em intervalos de 20 s. Upgrade de arma/passivo pode conceder até dois níveis; baús comuns não abrem modal.
Seis bosses agendados, sem sobreposição no modo normal; conteúdo dos dez bosses permanece disponível. Respiro de 14 s após
morte de boss. Runs legadas conservam pesos de geração antigos por worldVersion. POIs raros têm pesos menores, preservando urnas/decoração. Telemetria guarda
níveis nos marcos, escolhas, paths, evoluções, boss kills, menus, revives e desconexões.

## Execução local

1. `npm ci`
2. Copiar `.env.example` para `.env` apenas em instalação nova; preencher DATABASE_URL.
3. Gerar dois segredos independentes com `openssl rand -base64 48` para BETTER_AUTH_SECRET
   e REALTIME_SECRET. Configurar URLs/origem.
4. `npx prisma validate && npx prisma generate && npx prisma migrate deploy`
5. Terminal web: `npm run dev`. Terminal realtime: `npm run realtime`.
6. Abrir `http://localhost:3000` (mesmo host da configuração de origem).

Sem DATABASE_URL, operações online falham com mensagem de configuração. Offline permanece
local. Sem segredos, não se habilita autenticação/realtime com credenciais inventadas.

Produção: configurar URLs HTTPS/WSS, `NODE_ENV=production`, reverse proxy confiável e
secrets do ambiente. `docker compose build` usa o `.env` como secret de build apenas para
geração Prisma; não o copia na imagem. Aplicar migrations uma vez antes de iniciar serviços.
A construção Docker precisa de acesso à rede para dependências; não foi presumida infraestrutura deployada.

## Verificações

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
`RUN_DATABASE_TESTS=1 npm test -- tests/database.test.ts` executa fixtures reais e limpa-as.
`npm run test:browser` inicia web/realtime e Chrome, usa contas identificadas de teste.
`node --import tsx scripts/benchmark.ts` mede uma room com 5 jogadores e 1100 inimigos.

`RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts` executa cinco clientes reais.
`PLAYWRIGHT_PRODUCTION=1 npm run test:browser` usa o build de produção pronto.
`node --import tsx scripts/balance.ts` simula três runs completas com RNG fixo.

O proxy reverso deve suportar Upgrade e conservar conexões. O limite de conexão usa o endereço do socket; quando tudo passa por um proxy, este deve limitar conexões na borda e a política por endereço deve ser ajustada à topologia antes de oferecer muitas salas públicas.
