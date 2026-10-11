# Fase 4 — auditoria e acompanhamento

Base confirmada: main `6029231db7c6c251b16b6c12e8b25f6a733388bb`, merge #19 da Fase 3. Branch `codex/rpg-phase4`.
Baseline executado em banco local isolado: npm test, 258 aprovados / 59 ignorados; migrações da main aplicadas.

## Auditoria antes de implementação

Fases anteriores presentes integralmente. Perfil/revisão, actions, equipamentos, loadouts, expedições, receipts e histórico serão reutilizados. Nenhum serviço de recompensa novo é necessário.
WorldRenderer exige run/world e contém combate. Reutilizar suas primitivas TileRenderer e CharacterSpriteRenderer evita inventar RunState ou iniciar GameSimulation/WaveDirector. Player será somente o adaptador visual existente, sem update de combate. Terreno estático próprio não modifica World/worldVersion/chunks.
Quatro sprites canônicos disponíveis; manifest e sidecars de terrenos/props existentes. Não há sprites específicos aprovados dos quatro NPCs, depósito ou quadro; fallbacks geométricos estilizados serão identificados como provisórios.

## Plano e riscos

A: domínio estático versionado, NPCs e movimento puro. B: Canvas único, primitivas compartilhadas, input e cleanup. C: location na mesma instância, depósito de até 100 instâncias, locks/revisão/receipts existentes e migração aditiva. D: rota protegida, diálogos e links/serviços reais, controles acessíveis. E: banco, browser, regressão, performance e capturas reais.
Movimento/proximidade são locais e não autorizam mutações. Flags server-side separadas permitem rollout sem liberar expedições. Depósito exige desequipar; itens armazenados não entram em loadouts. Materiais não ganham outra carteira. Não há grants, posição persistida, loot ou settlement no Refúgio.
Falhas históricas de stability 2/5 clientes serão registradas separadamente, sem enfraquecer asserções.
