import {
  ServerConfig,
  ServerMetadata,
  getServerDataKey,
  CustomClient,
} from '../types';
import { SAMPQuery } from './sampQuery';

export class ServerMetadataCache {
  private static cache = new Map<string, ServerMetadata>();
  private static readonly METADATA_CACHE_DURATION = 24 * 60 * 60 * 1000;

  static async getMetadata(
    server: ServerConfig,
    guildId: string,
    client: CustomClient
  ): Promise<ServerMetadata | null> {
    const cacheKey = getServerDataKey(guildId, server.id);
    const cached = this.cache.get(cacheKey);

    if (
      cached &&
      Date.now() - cached.lastUpdated < this.METADATA_CACHE_DURATION
    ) {
      return cached;
    }

    if (client) {
      try {
        const dbKey = `metadata:${cacheKey}`;
        const dbCached = (await client.maxPlayers.get(dbKey)) as ServerMetadata;

        if (
          dbCached &&
          Date.now() - dbCached.lastUpdated < this.METADATA_CACHE_DURATION
        ) {
          this.cache.set(cacheKey, dbCached);
          return dbCached;
        }
      } catch (error) {
        console.log('Failed to get metadata from database');
      }
    }

    const sampQuery = new SAMPQuery();
    const metadata = await sampQuery.getServerMetadata(server, guildId);

    if (metadata) {
      this.cache.set(cacheKey, metadata);

      if (client) {
        try {
          const dbKey = `metadata:${cacheKey}`;
          await client.maxPlayers.set(dbKey, metadata);
        } catch (error) {
          console.log('Failed to save metadata to database');
        }
      }
    }

    return metadata;
  }

  static invalidateMetadata(guildId: string, serverId: string): void {
    const cacheKey = getServerDataKey(guildId, serverId);
    this.cache.delete(cacheKey);
  }

  static cleanup(): void {
    const now = Date.now();
    for (const [key, metadata] of this.cache.entries()) {
      if (now - metadata.lastUpdated > this.METADATA_CACHE_DURATION * 2) {
        this.cache.delete(key);
      }
    }
  }

  static getStats(): { cached: number; oldEntries: number } {
    const now = Date.now();
    let oldEntries = 0;

    for (const metadata of this.cache.values()) {
      if (now - metadata.lastUpdated > this.METADATA_CACHE_DURATION) {
        oldEntries++;
      }
    }

    return {
      cached: this.cache.size,
      oldEntries,
    };
  }
}
