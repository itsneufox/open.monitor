import { LRUCache } from 'lru-cache';

export interface CachedPlayerInfo {
  players: number;
  maxPlayers: number;
  name: string;
}

const MAX_CACHE_ENTRIES = 10_000;

const playerCountCache = new LRUCache<string, CachedPlayerInfo>({
  max: MAX_CACHE_ENTRIES,
});

export function getCachedPlayerInfo(
  cacheKey: string
): CachedPlayerInfo | undefined {
  return playerCountCache.get(cacheKey);
}

export function setCachedPlayerInfo(
  cacheKey: string,
  value: CachedPlayerInfo,
  ttlSeconds: number
): void {
  playerCountCache.set(cacheKey, value, { ttl: ttlSeconds * 1000 });
}
