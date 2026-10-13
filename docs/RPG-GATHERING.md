# Gathering v1

| Recurso | Categoria | Material | Quantidade | Duração mínima | Raio |
|---|---|---|---:|---:|---:|
| Veio mineral | MINERAL | weathered-ore / Minério Gasto | 2 | 1800 ms | 65 |
| Erva das ruínas | VEGETAL | ruins-fiber / Fibra das Ruínas | 2 | 1200 ms | 65 |
| Cristal residual | CRYSTAL | obelisk-dust / Pó do Obelisco | 1 | 2200 ms | 65 |

Nível mínimo 1, independente de sorte, equipamento ou nível temporário. Novos materiais entram em RpgMaterialBalance; não há segunda carteira. Sem consumo/receitas nesta fase. Os materiais serão insumos futuros, com balanceamento inicial conservador.

Uma coleta por conta/nó/versão/dia UTC; até 12 claims por sessão, 18 por ciclo. Quantidade máxima teórica: 24/sessão, 36/dia por conta; cinco contas no máximo 120/sessão e 180/dia, cada qual com claims próprios. Níveis novo/intermediário/avançado têm a mesma oferta; trocar personagem não muda a chave. Novas sessões não renovam o nó. Ao atingir saldo 1e9, registra a quantidade efetiva limitada (inclusive zero) e consome o direito, sem incrementar revisão quando o saldo não muda.

GATHER_START recebe somente nodeId, requestId e expectedRevision. O socket identifica a conta. O servidor valida descritor gerado, sessão/contexto, proximidade e nível congelado; fixa ciclo UTC no início. A conclusão exige simultaneamente ticks decorridos e relógio monotônico real. Movimento, sair do raio, desconexão, cancelamento, encerramento ou rollout desligado cancela coleta pendente. A animação/progress bar apenas apresenta o estado do servidor.

Após duração válida, o writer interno revalida a capacidade da simulação durante a transação; material, claim e revisão confirmam juntos. Falha de revisão informa que o perfil mudou; atualizar estado e iniciar outra intenção. Mesmo requestId com payload diferente falha. Repetição da mesma origem não paga novamente. Cruzar meia-noite não muda o ciclo da coleta em andamento; uma nova coleta iniciada no dia seguinte usa o novo ciclo do servidor.

Confirmação é pessoal por EXPLORATION_STATE. Não há dados de claims, saldo, seed privada ou inventário global nos snapshots. A UI indica explicitamente “pessoal” e “esgotado neste ciclo UTC”.
