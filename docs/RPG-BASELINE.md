# RPG híbrido — baseline de compatibilidade

Este documento fixa o contrato anterior ao RPG. As Fases 0, 1 e 1.5 são aditivas e ficam atrás de `RPG_ENABLED=false`.

## Invariantes do Survivor

- `SAVE_SCHEMA` continua `3` e `ECONOMY_VERSION` continua `2`.
- `GOLD`, `GEMS`, desbloqueios, upgrades e saves continuam em `UserProgress.data`.
- `UserProgress.version` continua controlando apenas o progresso existente. Uma mutação exclusivamente RPG não o incrementa.
- `RunState`, `RunSnapshot`, `Player.level`, inventário temporário e `worldVersion` não recebem campos RPG.
- O protocolo realtime, multiplayer, PvP, Ranked, settlement, IDs de estruturas, geração procedural e snapshots não mudam nas Fases 1 e 1.5.
- Saves offline, importados e `CloudSolo` nunca são fonte de XP, itens ou materiais RPG online.

## Limite das Fases 0 e 1

A Fase 0 registra este baseline, a flag e os testes de compatibilidade. A Fase 1 cria persistência, regras puras, catálogo, leitura autenticada, seleção idempotente de personagem e páginas protegidas. Não concede recompensas, não cria endpoint público de grant e não conecta o RPG ao loop de gameplay.

O perfil nasce sob demanda a partir do `UserProgress` atual. Cada personagem desbloqueado ganha progressão RPG própria; personagens bloqueados não podem ser selecionados. Toda mutação bloqueia a linha de `UserProgress`, valida a revisão RPG, usa `requestId` idempotente e grava um recibo no mesmo commit.

## Limite da Fase 1.5

A Fase 1.5 fortalece constraints, concorrência, replay e validação; adiciona atributos persistentes com orçamento derivável do nível e uma intenção autenticada de alocação. Também separa leitura consistente de inicialização lazy. Não conecta atributos ao combate nem cria fontes de XP ou recursos. A migração altera apenas tabelas RPG e preserva todos os saves, moedas e versões existentes.

Os testes de compatibilidade incluem save/restore real do Survivor, inventário de quatro slots, seed/worldVersion, XP temporário e cálculos PvP antes/depois de alocação RPG. Integração real exercita importação local/CloudSolo sem grants e transações econômicas paralelas. O relatório de execução é [RPG-HARDENING.md](RPG-HARDENING.md).
