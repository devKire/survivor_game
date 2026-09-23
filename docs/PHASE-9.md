# Fase 9 — Ranked Guerra do Limiar

## Auditoria / solução

ArenaService e Season/RankedRating/SeasonReward já atendem 1v1. Reutilizados por modo
WAR_RANKED, com filas e rating separados. Sem nova tabela nem migration nesta fase.
Arquivos: realtime/arena.ts, server/ranked.ts, game/network/pvp.ts,
app/arena/ArenaClient.tsx, app/ranked/page.tsx.

Fila exige dois Comandantes, dois Construtores e seis Soldados antes de criar match.
Cada par da mesma classe é dividido entre times; jogador de maior rating do par
vai ao time cuja soma atual é menor. Todos os candidatos respeitam janela de MMR
que começa ±100, cresce 50/30s até ±500. Não amplia precipitadamente nem insere bots.
Casual permite composição flexível, mas nunca dois Comandantes no mesmo time.

## Resultado, temporada, economia

Core destruído/limite de 30min/abandono de todo time definem resultado no servidor.
Abandono individual retira o combatente; após 30s desconectado a retirada é definitiva.
Quem abandona recebe derrota pessoal de rating e nenhuma moeda, mesmo se time vencer.
Demais participantes usam Elo K32 sobre média das equipes. Rank não deriva de wins
acumuladas. Atualização de MMR/ledger/resultado ocorre na mesma transação; claim de
status RUNNING e unique de recompensa impedem settlement duplicado.

Temporadas mensais UTC, soft reset 25% em direção a 1000; oito ranks de Ferro a Limiar.
Leaderboard por modo, histórico, reports, recompensas por pico após dez partidas.
Uma hora após fim: 10–80 Ouro, 100–800 Gemas e moldura; resgate único por modo/season.
Até seis partidas qualificadas/dia pagam 20 Gemas por vitória ou 10 por participação,
mais 1 Ouro por vitória. Mínimo 30s e dez casts; abandonantes não recebem. Esse teto
reduz farming simples, mas não substitui análise futura de conluio entre contas.

## Telemetria / segurança

Persistidos fila, ações, hits, kills, mortes, desconexões, classe, resultado, variação
MMR, tick médio/p95 da janela final de até 2.000 ticks, bytes totais de snapshots e
pico de entidades. Logs limitados a 4.000 eventos; não constituem replay completo.
Reports não banem automaticamente. Identidade/loadout vêm do servidor; comandos não
aceitam dano, saldo ou resultado. Progresso PvE nunca altera stats PvP.

## Validação

Prisma validate/generate, typecheck, lint e build são os gates finais do path.
Bateria de dez browsers, latência PvP e carga de 180 tropas não executadas a pedido
do usuário. Limite de entidades é configurado, não capacidade medida. Operação
realtime permanece em uma única instância; reinício interrompe matches sem inventar
vitórias/MMR. Sharding e recuperação de partida entre processos não implementados.
