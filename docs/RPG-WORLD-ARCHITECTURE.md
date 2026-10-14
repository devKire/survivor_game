# ADR — mundo compartilhado, Fase 6.5

Base auditada: main `48db2c433cbd40ea70c3f256e482370fb12e1551`, Fases 0–6 integradas (PR #37). Baseline executado: 282 aprovados, 96 condicionais ignorados. Banco de QA local separado; nenhuma migração/teste desta implementação usa o Neon configurado no `.env`.

## Diagnóstico

RefugeScene é local e valida apenas conveniência visual. RPG_EXPLORATION usa Team/GameSession, READY/START, 1–5 participantes congelados e 900 s. Não basta ocultar os botões: são lifecycles inadequados ao mundo aberto. O servidor já autentica tickets, normaliza input, valida sessão, limita mensagens e processa comandos discretos em fila. Core contém movimento, colisão, IA, armas e dano reutilizáveis. Renderers de tiles/personagens e painéis persistentes já existem. Quests reconciliam claims/descobertas/receipts duráveis.

## Decisão antes da implementação

O WorldCoordinator possui zonas compartilhadas indexadas por worldId/zoneId/version/instanceId, população independente da Team e sem GameSession. Solo e grupos entram na mesma instância pública. Uma presença por conta, última conexão autenticada vence. Epoch novo na entrada/transferência rejeita inputs antigos. AOI usa células de 240 unidades e raio inicial 720, sujeitos a medição; capacidade inicial conservadora 20 por zona, não promessa de escala massiva.

WorldZone reutiliza GameSimulation/Player/Weapon/World para combate, sem chamar WaveDirector ou settlement Survivor. Refúgio usa geometria/movimento puros existentes; Ruínas conserva seed, chunks e geração de recursos/POIs v1. Nenhuma segunda engine de armas, IA ou sprites. Protocolo WORLD_* é aditivo e versionado, independente de Snapshot/RunSnapshot/RunState legados. Dados privados não integram snapshots públicos.

Game Shell possui um Canvas, RAF e socket durante painéis/transições. Painéis reutilizam serviços e componentes com transporte de intenções autenticadas. NPC/Depósito são autorizados pela posição no coordenador e rechecados após locks. Alterações de build/personagem só são aplicadas no Refúgio; o mundo não aceita loadout do cliente.

Persistência proposta: visitas/checkpoints seguros (sem posição por tick), proveniência de claim de mundo na mesma tabela de gathering e ledger específico de eventos/recompensas PvE. Claims históricos mantêm a chave conta/região/versão/nó/dia UTC e os caps. Provas de quest continuam lendo o mesmo ledger. Recompensas de campo dependem de morte observada pelo motor e resultado durável; nenhuma concessão por entrada, tempo online ou resultado declarado pelo cliente.

O realtime mantém uma conexão PostgreSQL dedicada com advisory lock de autoridade antes de qualquer recuperação. Perder o lock encerra o processo; outro processo não pode assumir silenciosamente zonas ou interromper partidas existentes. Uma autoridade por banco continua sendo limite operacional. Transferência segura prepara destino/capacidade, persiste checkpoint e troca presença sem duplicação; pacotes antigos são descartados. Crash recupera checkpoint seguro, nunca posição/kill não durável.

## Ordem de entrega e riscos

A domínio/ADR; B coordenador/protocolo; C shell/HUD; D zonas/serviços/gathering; E social/PvE; F migração/compatibilidade; G QA/rollout. Migrações e suporte persistente podem anteceder seus consumidores por dependência, mantendo PRs pequenos e revisáveis. Branch consolidada codex/rpg-phase6-5. Sem merge e sem Fase 7.

Riscos a verificar: lifecycle de Team versus grupo social, corrida de mudança de build, alteração aditiva do vínculo de claims, callbacks/inputs de painéis, catálogo de zonas, recuperação de payouts, fechamento de sockets antigos, retenção de eventos, exclusividade de autoridade e custo de AOI/renderer. Flags web e realtime devem concordar; RPG_SHARED_WORLD_ENABLED=false preserva rotas legadas. Assets de NPCs/serviços ainda são fallbacks documentados. A conclusão depende de QA multiusuário real, banco, browser e benchmarks, não apenas deste ADR.
