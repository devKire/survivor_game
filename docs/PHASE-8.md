# Fase 8 — Classes e Energia

## Auditoria e arquitetura

A fase 7 já compartilha Player/combat/input/rewind/projéteis com Arena 1v1.
WarSimulation acrescenta regras de objetivo e classes, sem segunda engine ou carteira.
FighterSeed recebe papel; snapshot contém visão pessoal da Energia e ordens do time.
Estado temporário vive na simulação e desaparece com a partida.

## Implementação

Arquivos: game/content/war.ts, game/core/war.ts, game/core/pvp.ts,
game/network/pvp.ts, realtime/arena.ts e server.ts, app/arena/ArenaClient.tsx e
WarControls.tsx. Nenhum model/migration adicional: ArenaParticipant.result registra
classe/abandono/estatísticas; ChatMessage.arenaMatchId reaproveita a migration ranked.

- Soldado: três habilidades além do básico, melhorias temporárias de dano (+4%),
  HP (+10) e velocidade (+2%), máximo três níveis cada, custo 50/100/150.
- Construtor: torre (80), barricada (30), reparo (20 por 50 HP). Servidor valida
  classe, vida, alcance 160, recarga, território, colisão com estruturas/jogadores,
  máximo quatro construções próprias e oito por time. Reparo 2s, construção 4s.
- Comandante: máximo um/time. Ordens por rota: atacar, defender, recuar, focar torre
  ou base. Recruta 1–10 Soldados/Tanques/Suportes por 10/25/20 cada; formação em linha,
  coluna ou dispersa; recarga 6s, limite 90 tropas/time. Upgrade 100/200/300 aumenta
  vida/dano de novas tropas em 10% por nível. Ondas gratuitas continuam com Soldados.
- Energia inicial 100 (Comandante 120), cap 500; renda 5/10s, baixas 5/10,
  estruturas 20 por aliado /45 pelo golpe final, PvP 20 + bounty até 40 e assistências
  próximas 5. Obelisco central exige presença não contestada por 10s e concede 30
  por aliado a cada 60s de controle presencial. Não existe conversão para Gemas/Ouro.
- Defesa: time com Core mais danificado recebe 15% adicional na renda de Energia;
  caps pessoais, custos crescentes e upgrades limitados restringem snowball.

## Segurança e compatibilidade

Comandos estritos aceitam intenção; servidor calcula saldo, posição válida e efeito.
Gastos são síncronos no tick/processo autoritativo, sem persistência financeira da conta.
Chat é texto escapado pelo React, limitado a 500 caracteres, bloqueia controles,
rate limit 20/10s, entregue somente aos aliados. Party/DM existentes são preservados.
Obelisco, consumíveis e saldo da conta não entram no construtor dos atributos PvP.

## Validação e limites

Typecheck após integrar controles: aprovado. Lint identificou acesso a ref no render;
roster passou para estado React. Reconexão após abandono foi impedida explicitamente.
Verificação final compartilhada no relatório do path. Não executados novos testes
multiplayer/load conforme pedido do usuário. Valores são configuração inicial,
sem alegação de balanceamento competitivo medido. Geradores, armadilhas e postos
adicionais não fazem parte deste primeiro conjunto de construções.
