import { CustomClient, ServerConfig } from '../types';

const DEFAULT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

export class DatabaseUnavailableError extends Error {
  public readonly originalError: unknown;

  constructor(operation: string, originalError: unknown) {
    super(`Database unavailable while ${operation}`);
    this.name = 'DatabaseUnavailableError';
    this.originalError = originalError;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  description: string,
  attempts = DEFAULT_ATTEMPTS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.error(
        `[Database] Failed ${description} (attempt ${attempt}/${attempts}):`,
        error
      );

      if (attempt < attempts) {
        await wait(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new DatabaseUnavailableError(description, lastError);
}

/**
 * Read a guild's server configuration from MySQL. If MySQL is temporarily
 * unavailable after startup, use the last known-good in-memory configuration.
 */
export async function getGuildServers(
  client: CustomClient,
  guildId: string
): Promise<ServerConfig[]> {
  try {
    const servers =
      (await retryDatabaseOperation(
        () => client.servers.get(guildId),
        `loading servers for guild ${guildId}`
      )) || [];

    const cachedConfig = client.guildConfigs.get(guildId);
    client.guildConfigs.set(guildId, {
      ...(cachedConfig?.interval ? { interval: cachedConfig.interval } : {}),
      servers,
    });

    return servers;
  } catch (error) {
    const cachedServers = client.guildConfigs.get(guildId)?.servers;
    if (cachedServers !== undefined) {
      console.warn(
        `[Database] Using cached server configuration for guild ${guildId}`
      );
      return cachedServers;
    }

    throw error;
  }
}

export function isDatabaseUnavailableError(
  error: unknown
): error is DatabaseUnavailableError {
  return error instanceof DatabaseUnavailableError;
}
