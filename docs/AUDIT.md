# Auditoria — LIMIAR 1.3.0

Leitura integral dos quatro arquivos em 2026-09-15, antes de mudanças no código.
Base Git: `e21e683`. Não existem package.json, testes, servidor ou dependências.
`.env` contém DATABASE_URL configurada; valor confidencial, preservado e ignorado pelo Git.

## Arquitetura e inventário

| Sistema | Local original | Destino / tratamento |
|---|---|---|
| Conteúdo | game.js:25–773 | Extrair tabelas tipadas, preservar todos os IDs |
| Save | game.js:790–963 | Migrador puro + adaptador local; chave `limiar.save.v1`, schema 2 |
| Pool / SpatialGrid | game.js:967–1055 | Extrair genéricos headless; limites e remoção por troca preservados |
| RNG / World | game.js:1057–1293 | Extrair chunks determinísticos; separar interação de UI |
| Sound | game.js:1309–1382 | Adaptador browser, eventos sem áudio no servidor |
| Player / Weapon | game.js:1384–1499 | Tipar; injetar meta upgrades, eliminar save global |
| Input | game.js:1501–1608 | Browser somente; input normalizado; limpar no foco do chat |
| WaveDirector | game.js:1610–1704 | Headless; mesmo mundo e cronograma para toda equipe |
| Game | game.js:1706–3268 | Separar lifecycle browser, simulação e persistência |
| Attacks | game.js:3271–3469 | Reaproveitar oito estratégias; explicitar dono do ataque |
| UI | game.js:3471–4208 | Menu/HUD/Canvas client; operações online autenticadas |
| Renderer | game.js:4211–4720 | Preservar desenho Canvas, telegraphs, mapas e personagens |
| Bootstrap | game.js:4723–4783 | Lifecycle explícito com dispose, sem loop duplicado |

Conteúdo: 4 personagens, 8 armas/evoluções, 12 passivos, 24 paths, 6 sinergias,
15 tipos de inimigos, 10 bosses nomeados + final, 3 fases, 2 mapas, 16 estruturas,
8 consumíveis, 8 meta upgrades, 13 achievements. Modos Padrão, Pesadelo,
Infinito e Teste. Inventário 4 slots; 6 armas e 6 passivos. Export/import e
resume existentes. Nada desse catálogo será removido.

## Acoplamentos e riscos comprovados

- Game inicializa DOM, Canvas, input, áudio, UI e requestAnimationFrame no construtor.
- Player.recalculate lê save global; impede jogadores com meta independente.
- World.update carrega 3×3 chunks apenas ao redor de um jogador.
- Spawn e alcance de bomba dependem da câmera/view; precisam de limites autoritativos.
- Inimigos, projéteis e áreas usam `this.player`; dono/alvo devem ser explícitos no co-op.
- Math.random mistura simulação e efeitos; só geração de chunks usa seed determinística.
- Snapshot guarda até 320 inimigos e 80 itens/baús, sem gems, projéteis ou escolhas pendentes.
- Status contém referência a Weapon; JSON perde protótipo ao restaurar.
- Restore usa Object.assign em objetos parcialmente validados. Aceitável apenas como dado local;
  nunca como prova de resultado online.
- Save import permite até 1e9 de ouro. Uma validação de forma não prova mérito offline.
- HUD mostra kills, ouro, 6 slots de armas, 6 de passivos e 4 itens mesmo vazios.
- Level-up abre quatro escolhas e quatro botões de banir; pode encadear path/chest/level-up.
- XP necessário `6 + 2*level + floor(level^1.4)`; Growth até +50%, meta +25%, Sena ×1.25,
  nevoeiro ×1.25. Elites dão 40 XP e baú com upgrade; bosses 125 XP + baú.
- Elites chegam a cada 12 s, spawn base a 27/s após 14 min; bosses de 2 em 2 min,
  dez até 17:30. Isso acelera builds por várias fontes simultâneas.
- Estruturas relevantes e decoração compartilham distribuição por chunk, sem orçamento de descoberta.

## Checkpoints e preservação

`baseline/v1.3.0/` contém cópia byte a byte dos três arquivos executáveis; nenhum segredo.
O original será comparado em navegador e por testes de conteúdo/save antes do design pass.
Migração em etapas: extração preserva comportamento primeiro; regras de ritmo depois.

## Novos sistemas necessários

Next App Router/TS strict, banco/migrations, auth consolidada, progresso de conta,
amizades/DM/presença, lobby atômico, tickets WS, autoridade por room, snapshots delta,
interest management, prediction/reconciliation/interpolation, reconexão, revive e
resultados idempotentes. Não havia nenhum desses sistemas no projeto original.

## Fontes verificadas

- https://nextjs.org/llms.txt — documentação corrente e orientação por versão.
- https://better-auth.com/docs/integrations/next — integração Next e cookies.
- https://better-auth.com/docs/adapters/prisma — adapter Prisma/PostgreSQL.
- https://better-auth.com/docs/authentication/email-password — hash e fluxo de sessão.

Topologia alvo: web separável de processo WebSocket persistente. Hospedagem pendente de
resposta; preparar execução local/Docker sem pressupor sockets em ambiente serverless.
