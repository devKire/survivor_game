# Interesse espacial

WorldInterest mantém um índice incremental de células de 240 unidades. O AOI inicial usa raio de 720 unidades e consulta apenas células intersectadas, filtrando distância. Índices são separados por zona; não há broadcast de todas as regiões. Os valores são parâmetros iniciais sujeitos aos benchmarks da entrega.

Snapshots WORLD_SNAPSHOT são completos e limitados, 10 Hz, com IDs estáveis durante a presença. Entidades ausentes saem do conjunto do cliente; reentrada recupera dados atuais. Mudança de epoch substitui o conjunto integral, impedindo snapshots antigos de outra região de sobrescreverem o novo. Isso não altera Snapshot/RunSnapshot legados. Limites de payload e backpressure do socket existente permanecem.

Capacidade conservadora: 20 por zona. Cenários com 50 conexões são testes de limite, não uma capacidade pública prometida. CPU, bytes, objetos visíveis e tempo de snapshot serão medidos antes de recomendar rollout.
