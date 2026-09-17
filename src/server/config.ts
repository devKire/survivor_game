import "server-only";
import {
  getDatabaseUrl,
  getBetterAuthSecret,
  getRealtimeSecret,
  getBetterAuthUrl,
  ServerConfigurationError,
} from "./env";

export function configurationError() {
  try {
    getDatabaseUrl();
    getBetterAuthSecret();
    getRealtimeSecret();
    getBetterAuthUrl();
    return null;
  } catch (error) {
    if (error instanceof ServerConfigurationError) return error.message;
    throw error;
  }
}
