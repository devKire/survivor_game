# POIs e diário

O tipo inicial RUINS (`ruins-remnant`) representa vestígios descritivos, sem evento narrativo novo, quest ou recompensa automática. Nome e descrição ficam no catálogo, fora dos componentes. Há no máximo nove POIs por região. Cada descritor possui namespace/versão, coordenadas reproduzíveis e raio de descoberta 95.

O servidor observa a posição do participante conectado e em atividade. Ao entrar no raio, enfileira uma única descoberta relevante, fora do tick de simulação. A transação revalida sessão, participante e proximidade antes de confirmar. Cache por participante impede consultas repetidas de locais conhecidos; uma falha transitória usa espera entre tentativas. SQL não é usado para procurar minérios ou POIs a cada frame.

Descoberta é por conta, não compartilhada implicitamente com a equipe. Unicidade conta/região/versão/POI impede duplicação por retry, reconexão ou outro personagem. A revisão RPG cresce apenas na primeira descoberta. Não há XP nem material por descoberta.

`/rpg/discoveries` exige autenticação e flags RPG/exploração. Mostra apenas locais realmente registrados, data UTC, descrição, região e estado. Não lista coordenadas secretas de locais desconhecidos. O histórico de claims possui paginação de 20 entradas, ordenação por createdAt/id e cursor validado contra a mesma conta/região. Uma única região é permitida como filtro nesta versão; seeds privadas, loadouts e inventários alheios nunca são enviados.
