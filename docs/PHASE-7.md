# Fase 7 — Protótipo Guerra do Limiar

WarSimulation estende o combate autoritativo PvpSimulation. Dez jogadores, duas
bases, três rotas, seis torres iniciais, ondas de minions, combate, respawn e vitória
por Core. Sem réplica da engine PvE. Matchmaking agrupa dez contas em dois times de
cinco; persistência usa ArenaMatch/Participant/Seat existentes.

Pool de tropas com cap 180 (não milhares), LOD de simulação a cinco ticks longe de
jogadores. Snapshot filtra minions/projéteis/jogadores por ±650×430 do observador;
bases/estruturas são objetivos globais. Câmera acompanha jogador; cliente recebe só
entidades relevantes. Banco armazena resultado/eventos, nunca frames.

Partida tem limite de 30min: no limite o Core com menos HP é destruído; empate de
HP destrói ambos e resulta empate. Forfeit individual remove o combatente, equipe
só perde automaticamente quando todos abandonam. Reconexão mantém a janela de 30s.

Typecheck passou. Sem migration nova. Carga 10 clientes/180 tropas não foi medida
neste checkpoint por orientação do usuário; métricas runtime de tick/bytes estão
instrumentadas. Nenhuma alegação de suporte a milhares de entidades.
