# Fase 6 — Ranked 1v1

Ranked utiliza Arena autoritativa da F5. Elo K=32, MMR inicial 1000, resultado apenas
servidor; rating/resultado/recompensa na mesma transação e claim de match único.
Ranks Ferro/Bronze/Prata/Ouro/Platina/Diamante/Obelisco/Limiar, thresholds 0/800/1000/
1200/1400/1600/1800/2000. Fila separada por modo/season, ±100 inicial, +50 por 30s,
até ±500; cinco segundos não abrem busca irrestrita.

Temporadas mensais UTC, soft reset aproxima 25% do rating de 1000. Season,
RankedRating, SeasonReward, ArenaReport; ArenaMatch compartilhada inclui seasonId.
Resgate após fim+1h, mínimo dez partidas: pico determina 10–80 Ouro, 100–800 Gemas,
moldura cosmética. Lock/ledger/unique impedem repetição. Sem bônus de poder.

/ranked mostra classificação, rating, histórico e resgate. Arena escolhe Casual ou
Ranked. Reports validam ambos como participantes da mesma match; motivos limitados;
nenhuma regra de ban por contagem. Log de abilities/hits/kills/disconnect limitado,
queue time, dano/casts/hits e rating antes/depois persistidos para investigação.

Typecheck passou. Migration 20260923233000_ranked preparada/aplicada via migrate deploy.
Nova bateria de testes não executada, conforme instrução. Não afirmar balanceamento
competitivo validado ou latência homologada com base apenas na compilação.
