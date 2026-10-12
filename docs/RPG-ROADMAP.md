# Continuidade após a Fase 3

Fase 4 implementada em branches para revisão; Fases 5–9 permanecem apenas planejadas. Cada fase
depende da aceitação da anterior, passa por auditoria da main atual, testes de
compatibilidade, migrações aditivas e PRs sem merge automático.

| Fase | Reuso e fronteira proposta | Critério antes da revisão |
| --- | --- | --- |
| 4 — Refúgio (revisão) | World/renderer/tiles existentes, conteúdo tipado de NPCs e serviços, interfaces de personagem/inventário e quadro de expedições. Separar armazenamento somente com semântica e transação próprias. | Entrar, preparar build, interagir com NPC e iniciar expedição; transferências não duplicam instâncias. |
| 5 — Exploração/gathering | Identidade procedural de POIs intacta; geometria separada de estado consumido e descoberta persistente. Intenção de interação verificada pelo servidor, evento limitado e receipt. | Coleta legítima persiste uma vez; distância, existência, requisitos, concorrência e reconexão verificados. |
| 6 — Quests/diálogos | Catálogos versionados fora de React; objetivos consomem evidência autoritativa, máquina de estados LOCKED/AVAILABLE/ACTIVE/COMPLETED/REWARDED. Definir escopo conta/personagem por quest. | Aceitar, acompanhar, concluir e resgatar uma vez, incluindo replay de diálogo; preservar lore estabelecido. |
| 7 — Crafting/comércio | Receitas e preços no servidor; reutilizar lock UserProgress, revisão RPG, receipt e ledger econômico para qualquer GOLD/GEMS. Materiais e resultado na mesma transação. | Crafting/compra/venda concorrentes sem duplicação ou perda; rollback integral; nenhuma moeda nova sem necessidade. |
| 8 — Dungeons/corrupção | Estender configuração versionada de expedições, participantes congelados, terminal durável e payout individual. Entradas autorizadas por POI; mudanças regionais limitadas e separadas da geometria. | Instância coop de até cinco, reconexão, boss e recompensa recuperável; corrupção não altera saves/IDs procedurais antigos. |
| 9 — Progressão avançada | Proposta a detalhar: habilidades, facções/reputação e endgame, conforme objetivos do prompt. Reutilizar modificadores, eventos e receipts; não aplicar progressão RPG ao PvP. | Escopo e critérios específicos aprovados antes de código, com orçamento de poder, narrativa e testes definidos. |

O texto mestre recebido termina no item 12.5 (bosses da Fase 8), no meio de uma
frase. A linha da Fase 9 é planejamento preliminar baseado nos objetivos gerais,
não uma especificação recebida nem autorização para implementar agora.

Antes de cada fase: conferir novas alterações na main e documentos de lore;
definir versões de conteúdo, origem de cada mutação, limites, locks, política de
erro/recuperação e impacto de migração; comprovar fluxo real e apresentar PRs.
Não reexecutar extração histórica do motor nem criar renderer paralelo.
