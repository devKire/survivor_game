# Recompensas narrativas

V1: introdução 20 XP + 1 pó; vestígios 35 XP + 2 pós; amostras 50 XP + 1 fragmento, custando 4 minérios e 4 fibras; reconhecimento 25 XP + 2 pós; travessia 60 XP + 1 fragmento. Conteúdo limita XP/quest a 100 e cada grant/custo de material a 20. Não há GOLD/GEMS ou equipamentos nesta recompensa.

XP usa o cálculo compartilhado de progressão, mantendo o wrapper de expedições com seu teto histórico 200. Saturação, nível legado maior, pontos já distribuídos e comportamento de zero XP são preservados. O beneficiário foi congelado no aceite; ownership e desbloqueio são revalidados no resgate.

Custos, XP, nível, pontos disponíveis, materiais, flags, status e receipts confirmam juntos em Serializable. Qualquer custo insuficiente ou falha posterior faz rollback integral. Materiais saturam em 1 bilhão; o receipt mostra quantidades efetivamente concedidas e indicação de teto, não apenas a oferta. Um receipt por quest impede resgate duplicado mesmo com outro requestId. Não há grants públicos ou importação de provas de saves locais/CloudSolo.
