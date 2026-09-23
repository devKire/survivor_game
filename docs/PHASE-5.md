# Fase 5 — Arena 1v1 Casual

Modo próprio sobre o mesmo servidor autenticado/tickets/ws. PvpSimulation reutiliza
Player em ruleset PVP, predictMove e colisão varrida/segmentDistance2; regras PvP em
content/pvp.ts, sem copiar engine PvE. Quatro personagens acessíveis em condições
normalizadas: 100 HP/220 movimento, ataque básico + projétil + pulso + deslocamento.
Atributos/consumíveis/meta da conta não entram na simulação.

Arena simétrica 1000×600, melhor de três (primeiro a duas vitórias), rounds de 90s,
empates repetem até limite de cinco rounds. Autoridade decide input, movimento,
cooldown, hitscan, projéteis, dano, vitória e forfeit. Rewind de hitscan limitado a
quatro ticks/160ms, origin/target históricos; skillshots usam colisão varrida atual.
Reconexão 30s mantém mesmo jogador/ACK; forfeit após janela. Cliente prevê movimento,
reconcilia por ACK e mostra debug F7 de hitbox/posição autoritativa/predição/RTT.

ArenaMatch/Participant/Seat persistem apenas início e resultado; nenhuma posição por
frame no PostgreSQL. Slot único por usuário; lobby co-op verifica ArenaSeat, criação
de Arena bloqueia equipes relevantes antes de verificar expedição. Reboot marca
interrompida e não inventa vitória. Resultado/ledger em transação idempotente.

Recompensas moderadas com teto diário de seis partidas remuneradas, duração mínima
30s e ao menos dez casts: 20/10 Gemas vitória/demais, 1 Ouro por vitória. Sem moeda
comprável influenciando combate. Event log limitado e métricas de tick/bytes persistidas.

Migration 20260923230000_arena aplicada; Prisma generate/typecheck passaram.
Não executada nova bateria de latência/browser por instrução do usuário. Métricas
co-op da F1 não são prova de qualidade competitiva desta implementação nova.
