# Fase 4 — Ecos do Limiar

Banner permanente versionado; 100 Ouro/1000 Gemas por giro, onze pelo preço de dez.
Pesos centralizados: 60/25/10/4/1%. Servidor usa crypto.randomInt; UI publica chances
base e chances condicionais do próximo giro. Pity raro/épico/lendário após 9/49/99
falhas; prevalece a maior garantia, resultado superior reinicia contadores inferiores.
Lendário/Mítico naturais reiniciam pity lendário. Banner permanente sem expiração.

EchoPurchase registra banner/moeda/custo/resultados/raridade/duplicata/pity antes e
após/ativação/timestamp; unique(userId,requestId). Débito, RNG, inventário, pity,
fragmentos e recibo na mesma transação com lock da carteira. Cliente persiste UUID
até resposta, retry recupera recibo. Não aceita resultado enviado pelo cliente.

Duplicatas rendem 5/15/40/100/250 Fragmentos, com ledger próprio de coleção.
Oficina permite fabricar item específico por 25/75/200/500/1200 Fragmentos. Unique
ownership, debit transacional e referência craft:<id> evitam débito duplicado.
Animação pulável e puramente visual; resposta/resultado já persistidos antes dela.
Nenhuma recompensa altera combate. Gacha/oficina exigem conta online.

Migration 20260923223000_echoes aplicada; Prisma validate e typecheck passaram.
Simulação estatística e nova bateria de testes não executadas conforme orientação
explícita de priorizar implementação. Resultados estatísticos não são presumidos.
