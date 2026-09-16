# Entrega — LIMIAR 2.0

Data: 16/09/2026. Implementação local, migration aplicada no Neon e validações executadas. A publicação do código no GitHub é separada do deploy dos dois serviços.

## Arquitetura anterior

`index.html`, `style.css` e `game.js` formavam um jogo Canvas independente. O monólito reunia conteúdo, simulação, DOM, áudio, entrada, renderização e armazenamento local. Havia mundo por seed/chunks, pooling, grid espacial, armas, inimigos, bosses, inventário, achievements, Codex e meta progression.

Não havia contas, servidor autoritativo ou transporte realtime. O snapshot perdia escolhas pendentes e referências de métodos das armas em status; estruturas e progressão geravam decisões frequentes. [Auditoria integral](AUDIT.md). A [baseline 1.3.0](../baseline/v1.3.0/) foi preservada byte a byte e executada em Chrome antes da migração.

## Migração

- Next.js App Router + React; TypeScript strict, sem `any` explícito no código do jogo.
- `src/game/content`: catálogo existente, incluindo 4 personagens, 8 armas, 24 paths, 15 tipos de inimigo, 2 mapas, 16 estruturas, 8 itens e 13 achievements.
- `src/game/core`: simulação, mundo, diretor, entidades, ataques, coleções, status, saves e progressão.
- `src/game/client`: Canvas/renderer, input, áudio, UI original extraída, ciclo de montagem/desmontagem e cliente remoto.
- `src/game/network`: schemas, predição de movimento e cliente WebSocket.
- `src/realtime`: servidor, geração de deltas por interesse e liquidação de resultados.
- `src/server`: autenticação, banco, progresso, social, equipes e Server Actions.

`CoopSimulation` coordena jogadores sobre o mesmo mundo, diretor e coleções do core. Não cria mundos separados por jogador. O solo executa localmente os mesmos sistemas de combate e mundo. Renderer/input/áudio ficaram fora da simulação headless.

## Database

Prisma 7 + PostgreSQL/Neon, namespace exclusivo `limiar`. Models: User, Session, Account, Verification, UserProgress, Friendship, Team, TeamMember, ChatMessage, GameSession, GameSessionMember e RateLimit.

`Account.password` mapeia para a coluna SQL `passwordHash`, conforme o adapter Better Auth. `username` e `email` são normalizados e únicos. Dados públicos usam seleção explícita que exclui e-mail.

A migration `20260915220000_initial` foi aplicada e conferida. Contém índices, FKs e constraints para slots 0–4, party size 1–5, proibição de self-friend e destino único de mensagem. Não foi usado `migrate reset`.

Configuração: [`.env.example`](../.env.example). DATABASE_URL permanece somente no servidor. BETTER_AUTH_SECRET e REALTIME_SECRET precisam ser valores aleatórios independentes; URLs/origem/porta completam a configuração. Valores reais não foram versionados. Configuração ausente produz erro explícito.

## Auth

Cadastro, login e logout por Server Actions; Better Auth fornece o gerenciamento de sessão e os handlers necessários. Username 3–24 caracteres; senha 12–128; confirmação validada na interface e no servidor. Hash Argon2id, 64 MiB, três iterações, paralelismo 1. Cookies HttpOnly, SameSite=Lax e Secure em produção. Sem token de autenticação no localStorage. Sessão expirada ou revogada é rejeitada; sockets revalidam a sessão periodicamente.

## Social

Busca por username, solicitação, aceite, recusa e remoção. Uma relação canônica impede duplicatas entre A/B. Presença vem dos sockets: menu, equipe, partida e offline. LastSeenAt é atualizado em eventos de conexão, não por frame.

DM exige amizade aceita. Chat de equipe exige membership. Histórico usa cursor e páginas de 30 mensagens. Conteúdo é texto limitado a 500 caracteres, com controle de spam e sem HTML arbitrário. Remoções e solicitações notificam os participantes pelo realtime.

## Team

Código aleatório de oito caracteres, sem caracteres ambíguos, comparado sem distinguir maiúsculas/minúsculas; expira em uma hora. Criação, ingresso, ready, personagem, mapa, modo, saída e kick pré-game autorizados no servidor.

Lock transacional da equipe e constraint de slot garantem máximo cinco, inclusive na corrida da última vaga. Líder inicia apenas com todos prontos. Personagens repetidos são permitidos. Saída transfere liderança; desconexão do líder no lobby transfere para um membro conectado após 15 s. O líder não hospeda a simulação.

## Realtime

Node + `ws` em processo persistente separado do Next. HELLO transporta ticket HMAC de 30 s, uso único, ligado à sessão autenticada. Não há senha, cookie ou userId usado como autenticação na URL.

- Simulação a **25 Hz**; snapshots a **10 Hz**; renderização por requestAnimationFrame.
- Inputs de movimento normalizados; servidor determina posição, colisão, HP, dano e cooldown.
- Predição imediata do jogador local; reconciliação com ack e reaplicação dos inputs pendentes.
- Interpolação dos demais jogadores e entidades.
- Interesse de ±1000×800 unidades por jogador; bosses globais continuam relevantes.
- Criação, patches de campos alterados e remoção de entidades; resync quando a base não corresponde.
- Identidade nova por projétil disparado, mesmo quando seu objeto vem de um pool.
- Partículas, números, efeitos de impacto, anéis e áudio são gerados no cliente a partir do estado/impactos. Não são transmitidos como frames de partículas ou áudio.
- DEBUG mostra FPS, RTT, inputs/s, snapshots/s, correções, entidades, jogadores, sala e tick.

Novos membros não entram após o start. Reconexão de participante existente tem janela de 60 s e conserva estado/party size. Inputs param quando a conexão fica inativa; presença e sala são estados em memória. PostgreSQL recebe somente operações discretas e resultados.

## Co-op

XP coletado alimenta o nível comum. `COOP_SCALING` combina HP, spawns, cap, elites, formação e boss HP; não multiplica tudo pelo número de jogadores. PartySizeAtStart fica imutável. O divisor de XP chega a 2,9 em cinco jogadores. Growth contribui com a média do bônus pessoal, limitada a +15% para a equipe.

As builds, banimentos, inventários e escolhas são individuais. Level-up gera melhorias pendentes; o painel lateral não pausa o mundo. Ouro de pickups e recompensas de boss não são divididos pelo tamanho da equipe. Boss chest concede a cada jogador sua recompensa de build. Itens que não cabem no inventário ficam no mundo para o dono.

Urnas são compartilhadas. Fonte, cofre, obelisco e altares de troca/memória têm uso pessoal. Fenda e silêncio exigem maioria, com 15 s para votar; o iniciador precisa estar perto. Drops pessoais não podem ser recolhidos por colegas.

HP zero coloca o jogador caído. Segurar E por 3 s próximo a ele revive com 35% de HP e proteção breve; movimento/dano interrompem a canalização. Não há bleedout. Todos caídos encerra a run. Friendly fire está desligado; jogadores não bloqueiam colegas. HUD mostra nome/HP/estado; outlines e marcadores ajudam a localizar aliados. Chat é recolhível e capturar WASD em um campo não move o personagem.

Resultado é calculado pelo servidor. A transação de liquidação só altera uma GameSession ainda RUNNING, concedendo uma vez recompensas, achievements e records para cada membro.

## Game design

A curva exige XP conquistado e espaço entre decisões. Elites deixaram de fornecer baús de build; XP de elites/bosses e Growth foram reduzidos. Melhorias de arma/passivo podem conceder dois ranks, tornando cada escolha mais perceptível.

Há 26 janelas de escolha nos 30 minutos, progressivamente espaçadas. Uma opção relevante à build ajuda a oferecer especialização sem obrigar sua seleção. Três cards por padrão; Luck/efeito especial pode liberar o quarto. Banir é um modo de seleção com um único controle, ao lado de reroll e skip.

Paths entram após 6 min; evoluções após 10 min e exigem requisitos da arma. O excedente depois das decisões manuais vira recuperação/ouro em intervalos de 20 s. Baús não encadeiam modais. Seis encontros são agendados, sem sobrepor um novo boss ao anterior, com respiro de 14 s após a morte. O catálogo de bosses e o pós-limiar solo permanecem disponíveis.

HUD normal: HP, XP, nível discreto, timer e armas ocupadas. Boss, interação e itens são contextuais. Kills, passivos, estatísticas, ouro, sinergias, mapa e resumo ficam no painel de build. POIs relevantes receberam pesos menores; decoração/urnas continuam comuns.

As simulações com RNG fixo registraram 26 decisões em solo, dupla e cinco jogadores; primeiro path em **6:45**; primeira evolução entre **12:09 e 12:16**. São bots invulneráveis com estratégia declarada no [artefato de balanceamento](balance-results.json), não evidência de dificuldade adequada para todos os jogadores humanos.

## Compatibilidade e fonte de verdade

| Modo | Save e autoridade |
|---|---|
| Offline | Core local + `limiar.save.v1`; servidor não é necessário para simular |
| Solo na conta | Core local + arquivo solo versionado na conta; cache recuperável e conflito explícito |
| Co-op | Core no servidor; resultados e economia verificados pelo servidor |

Importação local nunca sobrescreve a conta silenciosamente. O jogador escolhe importar ou usar a conta. O arquivo inteiro fica utilizável no solo da conta, com export/import/resume. Como saves históricos não têm assinatura, ouro e achievements declarados pelo cliente não são convertidos em mérito verificado de co-op. Configurações podem ser importadas.

Schemas anteriores são migrados; dano fracionário, escolhas pendentes e fontes de status são preservados. Runs antigas mantêm a versão do gerador e os pesos originais, evitando que os chunks mudem ao retomar a mesma seed. Logout não apaga o save offline. A sincronização solo usa revisão para impedir sobrescrita concorrente; cache não sincronizado exige escolha explícita.

## Segurança

Schemas fechados de mensagens/inputs, autenticação derivada da sessão, autorização por amizade/equipe/sala, limites de conexão/mensagem, fila de comandos limitada, maxPayload de 16 KiB, origem permitida, backpressure, tickets de uso único e limites persistentes nas operações discretas.

Cliente não informa dano, recompensa ou posição autoritativa. Uso de item, upgrade, distância de interação e estado da partida são verificados. Chat usa React/textContent ou escape no UI legado. A varredura do código e dos bundles não encontrou os três segredos reais do ambiente. `npm audit` não reportou vulnerabilidades após atualizar dependências transitivas.

## Testes executados

- **31 testes unitários/core:** conteúdo/baseline, headless, todas as armas, fases de boss, saves, layouts legados, progressão, equipes 1–5, XP, builds, revive/wipe, ownership, banimentos, votação, ouro, loot, interesse/deltas, identidade do pool e regressões de dano recursivo/duplicado.
- **4 integrações reais no Neon:** cadastro/hash/login/logout/expiração/duplicatas, amizade/DM/paginação/spam, corrida da quinta vaga/liderança/ready/no mid-run/recompensa idempotente, importação e conflito do save solo.
- **WebSocket real com 5 clientes:** seed/sala comum, mensagens inválidas, sexto membro recusado, inputs externos sem membership, atrasos 0/50/100/150/250 ms, descarte de deltas, resync e reconexão sem duplicação. TCP retransmite perdas; o teste descarta snapshots no cliente para exercitar recuperação, não afirma simular datagramas UDP.
- **Chrome:** solo migrado e save legado; dois e três contextos autenticados, importação para conta/solo sincronizado, amigos/DM, código copiado, ready, movimento observado por outro cliente, chat com script inerte e reconexão. Execução também contra build de produção.
- **30 minutos simulados:** solo, dois e cinco jogadores, com timestamps de decisões, paths, evolução e seis bosses.
- **Carga:** sala de cinco, 1.100 inimigos resistentes e seis armas evoluídas por membro. [Resultados de carga](load-results.json), [rede](network-results.json), [balanceamento](balance-results.json).

`npm test` pula intencionalmente as cinco integrações dependentes de ambiente; elas foram executadas separadamente pelos comandos documentados.

## Performance medida

<!-- METRICS -->

Esses números descrevem o cenário e a máquina dos testes. FPS do começo da run não estabelece FPS no clímax. Não se atribui ao teste de uma sala a capacidade para dezenas de salas simultâneas.

## Validação

| Comando | Resultado |
|---|---|
| Prisma validate | Aprovado |
| Prisma generate | Aprovado |
| Prisma migrate status | Uma migration aplicada; schema atualizado |
| Tests | 31 unit/core aprovados; integrações executadas separadamente |
| Integração Neon | 4 aprovadas |
| Realtime | 5 clientes; aprovado |
| Browser | 3 cenários aprovados, incluindo 2 e 3 navegadores |
| Typecheck | Aprovado — strict |
| Lint | Aprovado, sem avisos |
| Build | Aprovado — produção |
| Audit | Zero vulnerabilidades reportadas |

## Problemas e limites restantes

1. A simulação em curso não é restaurada depois de reinício/crash do processo realtime. Sessões são marcadas INTERRUPTED; reconexão de 60 s cobre perda de conexão do jogador, não perda da memória do servidor.
2. A topologia atual usa uma única autoridade realtime. Escala horizontal exige roteamento/coordenação de salas; a carga medida cobre uma sala.
3. O deploy público e o build Docker não foram executados; Docker não está instalado neste ambiente. Produção requer hospedagem persistente para realtime, HTTPS/WSS, origens e segredos próprios. O push no GitHub não faz esse deploy.
4. Balanceamento humano prolongado e FPS de clímax em diferentes dispositivos ainda precisam de sessões reais. Os testes completos de 30 minutos são headless; os browsers verificaram os fluxos e trechos de gameplay. As medições de múltiplos browsers no mesmo ambiente ficaram abaixo de 60 FPS.

## Operação e evidências

[README](../README.md) · [Arquitetura/topologia](ARCHITECTURE.md) · [SPEC e regressões](../SPEC.md) · [Screenshot com três browsers](coop-3-browsers.png).
