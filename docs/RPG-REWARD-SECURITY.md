# Segurança de recompensas RPG

- Entrada: sessão Better Auth e ticket WebSocket existentes; conexão define userId.
  CONFIG aceita apenas tipo/mapa/modo/duração/personagem; START não recebe seed,
  builds, XP, itens ou resultado. Schemas estritos rejeitam chaves extras.
- Flags: RPG_ENABLED e RPG_EXPEDITIONS_ENABLED são verificadas no servidor antes
  da autorização e do payout. Ausência desativa. Histórico e preparação de build
  dependem de RPG_ENABLED; desligar expedições não apaga recibos já confirmados.
- Fonte: factory privada associa a simulação ao START persistido. Somente término
  do motor pode produzir terminal; harness de desenvolvimento não possui essa
  capacidade. Writer interno não está exportado por actions, rotas ou protocolo.
- Aleatoriedade: root de 256 bits criado no servidor, separado de worldSeed.
  HMAC vincula sessão, usuário, fonte, evento, índice e versão. Builds e terminal
  têm hash canônico; regras v1 falham fechadas perante versões desconhecidas.
- Banco: ownership composto, activeUserId único, receipt único por usuário/sessão,
  constraints de limites e triggers de imutabilidade. Lock estável Team → sessão
  RPG → UserProgress ordenado. Serializable com retry limitado de abortos seguros.
- Entrega: todos os membros confirmam juntos. Nunca incrementar saldo fora da
  transação; nunca recalcular loot por timestamp/retry; nunca aceitar valores de
  saves locais ou CloudSolo. Revisão RPG aumenta uma vez por mudança efetiva.
- Leitura: paginação de vinte entradas, cursor restrito ao usuário autenticado,
  projeção explícita de receipts, sem seeds ou campos privados. Consulta alheia
  retorna indisponível; inputs extras são rejeitados. Callbacks usam allowlist.
- Prévia: action autenticada somente de leitura, rate limit e ownership. Fórmulas
  continuam no resolver compartilhado. Falhas internas recebem mensagem genérica.
- Recuperação: resultado terminal é salvo antes do payout. Falha de banco ou flag
  desligada deixa entrega pendente, sem alegar confirmação. Reinício sem terminal
  interrompe sem grant. Nenhum replay depende de estado ou confirmação do cliente.

Elegibilidade é uma política inicial, não detecção completa de bots: mede tempo
conectado e movimento realizado, com tolerância de desconexão. Cooldown de entrada
e duração mínima limitam repetição. Telemetria futura pode aprimorar essa política
em outra versão sem reinterpretar terminais v1.

Restrições operacionais: uma autoridade realtime por banco; seeds privadas exigem
proteção e backup como os demais dados financeiros. Falta de participante ou
corrupção de dados causa falha fechada e exige investigação. Exclusão de conta
durante um terminal pendente pode causar esse caso; não há payout parcial
automático. O sistema não resolve a política de exclusão histórica da Arena.
