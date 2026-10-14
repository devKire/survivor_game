# Objetivos e provas

| Tipo | Autoridade | Temporalidade / deduplicação |
|---|---|---|
| TALK_TO_NPC | Resposta autenticada de um nó permitido pelo cursor persistido | Prova por diálogo/versão/nó, somente quest ACTIVE e etapa correta |
| DISCOVER_POI | RpgDiscoveredPoi próprio + descriptor procedural canônico | ACCOUNT; ALREADY_DISCOVERED_ALLOWED; primeira descoberta por ID |
| GATHER_RESOURCE | RpgResourceClaim próprio, canônico, quantidade positiva | claim.revision > acceptedRevision; ID da claim; personagem participante se CHARACTER |
| COMPLETE_RPG_EXPEDITION | Receipt confirmado de expedição elegível e vitória | entryRevision >= acceptedRevision; uma prova por sessão |
| DEFEAT_BOSS | Origem de boss no receipt cruzada com evento do terminal validado | mesma regra temporal; boss conhecido; sessão contribui uma vez |

Expedições exigem kind RPG_EXPEDITION, GameSession COMPLETED, RPG SETTLED, perfil/versão conhecidos, hash de terminal correto, participante e receipt elegíveis. Derrota, terminal pendente, sala experimental, Survivor e Arena não contam. Uma sessão iniciada antes do aceite não passa a valer por ser liquidada depois.

Timestamps não determinam a ordem de coleta/aceitação: CURRENT_TIMESTAMP é o início da transação, que pode preceder espera por lock. Revisões e entryRevision são produzidas sob o mesmo lock da conta. Uma descoberta já registrada não pode ser exigida novamente com AFTER_ACCEPTANCE_ONLY: essa combinação falha fechada na versão atual.

Uma origem pode servir às duas quests de descoberta porque isso é declarado no conteúdo: reconhecimento de três vestígios inclui o vestígio da principal. Dentro de um objetivo, a chave única `(progress, objective, sourceKind, sourceId)` impede duplicação. Quantidades são limitadas ao alvo. Saldo de material nunca comprova gathering.

Reconciliação lê fontes confirmadas e insere provas na mesma transação do estado. Não avança um cursor global sobre expedições pendentes: resultados podem confirmar fora de ordem. Nenhuma escrita ou consulta de quest é feita no tick de combate/exploração.
