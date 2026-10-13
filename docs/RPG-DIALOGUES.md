# Diálogos narrativos

O catálogo v1 contém grafos para Guardião, Orientador, Responsável pelo Depósito e Armeiro. IDs funcionais `refuge:guardian`, `refuge:guide`, `refuge:keeper`, `refuge:armorer` e seus serviços anteriores permanecem iguais.

OPEN valida o NPC e posiciona o cursor persistido no início. CHOOSE valida cursor, requisitos do nó/resposta/destino, personagem ativo e escolha exclusiva. Apenas uma resposta com efeito TALK pode inserir prova para o objetivo que corresponde ao NPC e ao nó. Abrir ou fechar o modal local não produz prova. Proximidade no Refúgio é conveniência visual: a alternativa acessível oferece o mesmo serviço autenticado.

Os grafos têm retornos explícitos; fechar a conversa é sempre possível. O modal nativo do Refúgio preserva Escape, contenção de foco e retorno ao canvas. O diário também oferece conversas por botões, sem exigir movimento. A opção Preparação de Vanguarda requer Nara ativa e é revalidada no servidor.

Escolher vestígios ou ecos grava `investigation-priority` uma única vez. A alternativa oposta fica indisponível; falas posteriores e o diário mostram a decisão. Ambos os caminhos seguem o mesmo arco, sem bloqueio permanente. Não existe interpretador de JavaScript de conteúdo nem consequências arbitrárias enviadas pelo cliente.
