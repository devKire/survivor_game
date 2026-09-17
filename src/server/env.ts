import "server-only";

// Never capture credentials at module scope: generation, builds and offline do
// not need a database. Each service validates when it is actually used.
export class ServerConfigurationError extends Error {}

export function hasDatabaseConfiguration() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value)
    throw new ServerConfigurationError(
      "DATABASE_URL não está disponível no ambiente do servidor. O modo offline continua disponível.",
    );
  // URL's native error can contain its input, including credentials.
  const url = URL.canParse(value) ? new URL(value) : null;
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname
  )
    throw new ServerConfigurationError(
      "DATABASE_URL inválida no ambiente do servidor.",
    );
  return value;
}

function getSecret(name: "BETTER_AUTH_SECRET" | "REALTIME_SECRET") {
  const value = process.env[name];
  if (!value || value.trim().length < 32)
    throw new ServerConfigurationError(
      `${name} precisa de pelo menos 32 caracteres aleatórios no ambiente do servidor.`,
    );
  // Preserve existing signing keys byte for byte.
  return value;
}

export const getBetterAuthSecret = () => getSecret("BETTER_AUTH_SECRET");
export const getRealtimeSecret = () => getSecret("REALTIME_SECRET");

function getOrigin(name: "BETTER_AUTH_URL" | "REALTIME_ORIGIN") {
  const production = process.env.NODE_ENV === "production";
  const value =
    process.env[name]?.trim() || (production ? "" : "http://localhost:3000");
  const url = URL.canParse(value) ? new URL(value) : null;
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (production && (url.protocol !== "https:" || isLoopback(url.hostname)))
  )
    throw new ServerConfigurationError(
      `${name} precisa conter a origem ${production ? "HTTPS pública" : "HTTP/HTTPS"} da aplicação no ambiente do servidor.`,
    );
  return url.origin;
}

function isLoopback(host: string) {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host.startsWith("127.")
  );
}

export const getBetterAuthUrl = () => getOrigin("BETTER_AUTH_URL");
export const getRealtimeOrigin = () => getOrigin("REALTIME_ORIGIN");

export function getRealtimePort() {
  const value = Number(process.env.REALTIME_PORT?.trim() || "3001");
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new ServerConfigurationError(
      "REALTIME_PORT precisa ser uma porta entre 1 e 65535.",
    );
  return value;
}
