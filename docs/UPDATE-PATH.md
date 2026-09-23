# LIMIAR — entrega do path econômico e competitivo

Implementação incremental registrada em [auditoria](ECONOMY-AUDIT.md) e relatórios
[F1](PHASE-1.md), [F2](PHASE-2.md), [F3](PHASE-3.md), [F4](PHASE-4.md),
[F5](PHASE-5.md), [F6](PHASE-6.md), [F7](PHASE-7.md), [F8](PHASE-8.md), [F9](PHASE-9.md).

## Economia / progressão

Gemas: drops comuns e progressão PvE; ledger autoritativo para contas.
Ouro: conclusões, conquistas importantes e recompensas competitivas limitadas;
coleção/cosméticos. Referência 1:10 sem câmbio livre.
Fragmentos: somente duplicatas/crafting, ledger próprio. Energia: somente 5v5,
sem saldo persistente nem conversão para moedas da conta.
Migração: nove contas, 995 Ouro legado → 995 Gemas e zero Ouro novo;
níveis e saves preservados, sem reset. Sem jogadores ativos durante a migração.

Obelisco: cinco ramos, 18 nodes, pré-requisitos, bifurcação, preview,
diminishing returns, compra server-side e efeitos somente PvE. Respec opcional
não implementado. Quatro personagens existentes disponíveis no PvP normalizado.

## Coleção

50 variantes visuais, dez tipos, cinco raridades. Inventário/equipar/loja com Ouro
ou Gemas em itens comuns; nenhum poder vendável. Banner cosmético 1x/11x, odds
públicas e condicionais, pity 10/50/100, duplicatas em fragmentos, oficina e histórico.
Animação pulável. Consumíveis/pacotes não lançados; categorias explicitam ausência.
Evolução visual aplica-se onde há evolução PvE; PvP não tem evolução de arma.

## Competitivo

Arena 1v1 casual/ranked: servidor decide movimento, ataques, dano, cooldown,
rounds, melhor de três (até cinco rounds em caso de empates), reconexão e resultado.
Cliente envia input, prediz movimento/reconcilia ACK, suaviza remotos; rewind de
hitscan limitado a quatro ticks/160ms; debug F7 mostra posições/hitboxes.
MMR Elo, oito ranks, temporadas, leaderboard, reports e recompensas únicas.

Guerra 5v5 casual/ranked: mapa 2600×1400, três rotas, dois Cores, seis torres,
minions em pool, objetivo central, respawn, três classes, ordens de grupo,
construção validada, Energia temporária e composição ranked 1/1/3. Sem poder da conta.
Máximo 180 minions, 90/time, LOD distante e interest management por observador;
estruturas/objetivos continuam globais. Não há alegação de milhares de entidades.

## Compatibilidade e operação

Single-player offline, co-op autoritativo, amigos, equipes, chat, personagens,
armas, bosses, mapas e saves legados permanecem integrados à arquitetura existente.
Save offline migra localmente; archive importado não concede riqueza online.
Gacha/Shop/Ranked exigem conta/conexão. PvE online solo usa equipe de um jogador.

Web e realtime precisam executar a mesma revisão do código: protocolo de carteira
mudou para Gemas. Realtime: npm run realtime, instância única. Migrations aditivas
aplicadas com prisma migrate deploy, sem migrate reset. GitHub recebe o código;
publicação no GitHub não equivale a reiniciar um servidor realtime externo.

## Verificações e limites

Antes de o usuário reduzir testes, F1 passou unitários, integração PostgreSQL,
WebSocket e Chrome, inclusive estabilidade co-op com cinco clientes/500 inimigos.
Carga co-op headless: cinco jogadores/1.100 inimigos, p95 18,24ms; heap 20,95MiB;
snapshots médios 30–47KB. Esses números NÃO validam Arena nem Guerra.

Fases seguintes: verificações essenciais de tipos/schema/lint/build; não executadas
simulação estatística 100.000 pulls, bateria adversarial PvP, dez browsers ou carga
5v5. O roadmap está implementado, mas balanceamento humano, latência competitiva e
capacidade 5v5 ainda precisam de medição antes de divulgação como produto validado.
Telemetria foi implementada para essa etapa; não se inventam métricas não coletadas.

Economia e gacha usam lock da carteira, transação única, constraints, ledger e
referências únicas. Ranked usa settlement autoritativo idempotente. Combate não
aceita client damage; construção/energia são resolvidas pelo servidor. Isso não
elimina necessidade futura de QA nem detecção de conluio/farming multi-conta.

## Resultado final dos comandos

- Prisma validate: aprovado.
- Prisma generate: aprovado (client 7.10.0).
- Prisma migrate deploy: executado; nenhuma migration pendente.
- Prisma migrate status: sete migrations; schema atualizado no Neon.
- Typecheck: aprovado; TypeScript do build final também aprovado.
- Lint: aprovado, sem erros ou avisos.
- Build de produção: aprovado, incluindo todas as novas rotas.
- Git diff --check: aprovado.
- Testes adicionais de gameplay: não executados após a orientação do usuário.

O primeiro migrate status falhou por acesso de rede no sandbox; repetido com
permissão, passou. Nenhum reset ou alteração destrutiva do banco foi executado.

O ensaio de cinco Chrome registrou FPS entre 14.7 e 15.1 no ambiente headless.
Aprovação de estabilidade/reconexão não representa atingir 60 FPS.
