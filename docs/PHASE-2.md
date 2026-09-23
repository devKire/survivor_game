# Fase 2 — Obelisco

Anterior: oito melhorias planas; fórmulas de efeito duplicadas em Player e apresentação.
Solução: catálogo versionado content/obelisk.ts, reutilizando save.upgrades e compra
transacional da F1. Cinco ramos, posições/arestas por pré-requisito, 18 nodes,
pré-requisitos, rank máximo, exclusão Resistência/Regeneração e especializações.
Níveis legados preservados, inclusive escolhas conflitantes já existentes.

Efeitos pequenos: primeiro rank geralmente 1–2%; ranks seguintes aplicam 80/65/50/40%
do primeiro incremento. Especializações afetam apenas a arma inicial do personagem.
Player aceita ruleset PVP e ignora todos os nodes, inclusive especializações de Weapon.
Sem respec nesta fase (opcional no pedido), portanto sem fluxo de reembolso/pagamento.

UI: /obelisk na conta; menu Obelisco no Canvas offline; previews atual/próximo,
custo, rank, pré-requisitos e bifurcação. AccountClient aponta para a tela dedicada.
Arquivo de progressão permanece o mesmo; nenhuma tabela estática nova ou migration.
Ledger meta:<node>:<rank> e rank esperado preservam idempotência.

Typecheck passou. Bateria adicional dispensada conforme orientação do usuário.
Efeitos foram rebalanceados; ranks e propriedade anteriores permanecem. PvP ainda
não possui modo jogável nesta fase; a separação de efeitos prepara a fase 5.
