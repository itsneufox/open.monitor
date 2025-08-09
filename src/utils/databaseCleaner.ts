import { CustomClient, getServerDataKey } from '../types';

class DatabaseCleaner {
  private client: CustomClient;

  constructor(client: CustomClient) {
    this.client = client;
  }

  async cleanupServer(
    guildId: string,
    serverId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    console.log(`Cleaning up database data for server: ${serverId} in guild: ${guildId}`);
    const errors: string[] = [];

    try {
      const serverDataKey = getServerDataKey(guildId, serverId);
      await this.client.maxPlayers.delete(serverDataKey);
      console.log(`Removed chart data for ${serverDataKey}`);
    } catch (error) {
      const errorMsg = `Failed to remove chart data: ${error}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    try {
      const serverDataKey = getServerDataKey(guildId, serverId);
      await this.client.uptimes.delete(serverDataKey);
      console.log(`Removed uptime data for ${serverDataKey}`);
    } catch (error) {
      const errorMsg = `Failed to remove uptime data: ${error}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    return { success: errors.length === 0, errors };
  }

  async cleanupGuild(
    guildId: string
  ): Promise<{ success: boolean; serversProcessed: number; errors: string[] }> {
    console.log(`Cleaning up database data for guild: ${guildId}`);
    const errors: string[] = [];
    let serversProcessed = 0;

    try {
      const servers = (await this.client.servers.get(guildId)) || [];

      for (const server of servers) {
        const result = await this.cleanupServer(guildId, server.id);
        serversProcessed++;
        if (!result.success) {
          errors.push(...result.errors);
        }
      }

      await this.client.servers.delete(guildId);
      console.log(`Removed server list for guild ${guildId}`);

      await this.client.intervals.delete(guildId);
      console.log(`Removed interval config for guild ${guildId}`);

      this.client.guildConfigs.delete(guildId);
      console.log(`Removed guild config from cache`);
    } catch (error) {
      const errorMsg = `Guild cleanup error: ${error}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    return { success: errors.length === 0, serversProcessed, errors };
  }

  async cleanupOldChartData(): Promise<{
    serversProcessed: number;
    dataPointsRemoved: number;
    errors: string[];
  }> {
    console.log('Cleaning up old chart data...');
    const errors: string[] = [];
    let serversProcessed = 0;
    let dataPointsRemoved = 0;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const [guildId, guildConfig] of this.client.guildConfigs.entries()) {
      for (const server of guildConfig.servers) {
        try {
          const serverDataKey = getServerDataKey(guildId, server.id);
          const chartData = await this.client.maxPlayers.get(serverDataKey);
          if (chartData?.days) {
            const originalLength = chartData.days.length;
            chartData.days = chartData.days.filter(
              day => day.date > thirtyDaysAgo
            );
            const newLength = chartData.days.length;

            if (originalLength > newLength) {
              await this.client.maxPlayers.set(serverDataKey, chartData);
              dataPointsRemoved += originalLength - newLength;
              console.log(
                `Removed ${originalLength - newLength} old data points from ${serverDataKey}`
              );
            }
          }
          serversProcessed++;
        } catch (error) {
          errors.push(`Failed to clean chart data for ${server.id}: ${error}`);
        }
      }
    }

    return { serversProcessed, dataPointsRemoved, errors };
  }

  async runPeriodicCleanup(): Promise<{ summary: string; errors: string[] }> {
    console.log('Running periodic database cleanup...');

    const chartResult = await this.cleanupOldChartData();

    const summary = `Removed ${chartResult.dataPointsRemoved} old chart entries from ${chartResult.serversProcessed} servers`;

    if (chartResult.errors.length > 0) {
      console.warn(`Cleanup completed with ${chartResult.errors.length} errors`);
    } else {
      console.log(`Periodic cleanup completed: ${summary}`);
    }

    return { summary, errors: chartResult.errors };
  }
}

export { DatabaseCleaner };