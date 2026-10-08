# Fase 1.5 — auditoria e validação

Base inspecionada: `main`, `9378aa802813eca177428f0d6381da1ef8c107f4`.

## Auditoria inicial

| Área | Estado encontrado | Correção/validação necessária |
| --- | --- | --- |
| Separação Survivor/RPG | Completa: tabelas e módulos próprios, sem grants de saves | Manter contratos e testar import/sync e economia em paralelo |
| Ownership | FKs compostas isolam equipamento/personagem por usuário | Testar também personagem ativo, consultas e exclusão completa |
| Cascatas | Testes existentes removem apenas perfis sem itens equipados | Exercitar ciclo perfil → personagem ativo e filhos equipados no PostgreSQL |
| Itens | Slots, raridade e quantidades limitados; slot único por personagem | Falta impedir equipamento de uma pilha com quantidade maior que um |
| Concorrência | Seleção usa Serializable e revisão própria | Não há retry de abortos de serialização nem testes simultâneos |
| Idempotência | Recibo por usuário/requestId e hash do comando | Testar concorrência, replay antigo, payload divergente e rollback real |
| Atributos | Ausentes | Definir saldo derivável e persistência consistente com nível |
| Actions | Autenticação na borda; flag apenas na action/página | Campos FormData extras são descartados; erros lançados quebram formulário; serviços diretos ignoram flag |
| Leitura | Toda consulta executa upsert/createMany e FOR UPDATE | Separar leitura consistente sem locks de escrita de inicialização lazy |
| Compatibilidade | Testes básicos de constantes e ausência de campos | Ampliar regressões funcionais e executar banco/realtime/browser |

Esta entrega não adiciona equipamentos funcionais, fontes de XP, loot, affixes, crafting, quests nem modificadores de combate.

## Resultados

Em execução; os resultados finais serão registrados após as verificações.
