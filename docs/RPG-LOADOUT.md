# Combat Loadout — Fase 2

O servidor carrega um perfil sob snapshot consistente, filtra personagens pelos
desbloqueios atuais e lê apenas os equipamentos vinculados àquele personagem e
àquela conta. `buildRpgCombatLoadout` valida orçamento, catálogo, requisitos,
versão e rolagem antes de criar uma cópia imutável, sem ownership ou inventário
completo. A revisão identifica o perfil usado na entrada; nenhuma consulta ao
banco ocorre durante ataques ou ticks.

`CombatContext` separa `SURVIVOR`, `PVP` e `RPG_EXPEDITION`. O padrão continua
Survivor. `Player` valida a build uma vez, compila modificadores uma vez e aplica
o resolver depois do cálculo original de personagem, meta e passivas. A vida
atual acompanha a diferença de vida máxima uma única vez. Armas, evoluções,
colisão, nível temporário, XP e inventário Survivor continuam no motor existente.
PvP rejeita contexto RPG. Um equipamento WEAPON não troca a arma inicial.

`CoopSimulation` exige correspondência exata entre participantes e loadouts.
Cada Player recebe sua própria cópia; reconectar reutiliza o mesmo Player.
Mudanças no Hub afetam somente futuras sessões. Snapshots continuam transmitindo
stats efetivos pelo contrato existente; não incluem affixes, seeds ou inventários.

## Ativação controlada

Não existe modo RPG público. `normal`, `nightmare` e `endless` continuam clássicos.
`createDevelopmentRpgSession` é interno, exige `RPG_ENABLED=true`,
`RPG_DEVELOPMENT_HARNESS=1` e recusa `NODE_ENV=production`. Os participantes devem
vir de identidade autenticada do servidor. O harness usa meta Survivor vazia
para comparação reproduzível, equipamentos reais da conta e não possui grants.

Em ambiente local com banco de testes e usuários já preparados por fixtures:

```sh
RPG_ENABLED=true RPG_DEVELOPMENT_HARNESS=1 node --conditions=react-server --import tsx scripts/rpg-combat-harness.ts USER_ID:nara
```

Esse comando não cria itens nem concede XP. O teste realtime usa IPC de processo
local protegido por `NODE_ENV=test` para instalar uma sessão no servidor real;
nenhum comando novo é adicionado ao WebSocket. Tickets e autenticação existentes
continuam obrigatórios.

Sessões RPG não serializam saves solo nem executam achievements/persistência
Survivor. O settlement rejeita essas sessões antes de acessar recompensas.
Portanto não existe caminho de conversão de cliente, save local, CloudSolo ou
sessão experimental para XP, item, material ou moeda online.

## Limites

A build está congelada na memória da sessão; reinício do processo segue o
comportamento atual de encerramento de sessões, sem restaurar RPG de save local.
A futura expedição pública precisará definir autorização, ciclo de vida e
recompensas autoritativas. A Fase 2 não fornece nenhuma dessas origens.
