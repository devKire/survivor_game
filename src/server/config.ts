export function configurationError() {
  if (!process.env.DATABASE_URL?.trim())
    return "Configure DATABASE_URL no arquivo .env para usar contas e recursos online. O modo offline continua disponível.";
  if ((process.env.BETTER_AUTH_SECRET?.length || 0) < 32)
    return "Configure BETTER_AUTH_SECRET no arquivo .env com pelo menos 32 caracteres aleatórios.";
  if ((process.env.REALTIME_SECRET?.length || 0) < 32)
    return "Configure REALTIME_SECRET no arquivo .env com pelo menos 32 caracteres aleatórios.";
  return null;
}
