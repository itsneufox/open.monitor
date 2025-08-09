import { CustomClient } from '../types';

class DatabaseCleaner {
  private client: CustomClient;

  constructor(client: CustomClient) {
    this.client = client;
  }

  // Clean up data for a specific server
  async cleanupServer(
    serverId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    console.log(`🧹 Cleaning up database data for server: ${serverId}`);
    const errors: string[] = [];

    try {
      // Remove chart data
      await this.client.maxPlayers.delete(serverId);
      console.log(`  ✅ Removed chart data for ${serverId}`);
    } catch (error) {
      const errorMsg = `Failed to remove chart data: ${error}`;
      errors.push(errorMsg);
      console.error(`  ❌ ${errorMsg}`);
    }

    try {
      // Remove uptime data
      await this.client.uptimes.delete(serverId);
      console.log(`  ✅ Removed uptime data for ${serverId}`);
    } catch (error) {
      const errorMsg = `Failed to remove uptime data: ${error}`;
      errors.push(errorMsg);
      console.error(`  ❌ ${errorMsg}`);
    }

    return { success: errors.length === 0, errors };
  }

  // Clean up data for an entire guild
  async cleanupGuild(
    guildId: string
  ): Promise<{ success: boolean; serversProcessed: number; errors: string[] }> {
    console.log(`🧹 Cleaning up database data for guild: ${guildId}`);
    const errors: string[] = [];
    let serversProcessed = 0;

    try {
      // Get all servers for this guild
      const servers = (await this.client.servers.get(guildId)) || [];

      // Clean up each server's data
      for (const server of servers) {
        const result = await this.cleanupServer(server.id);
        serversProcessed++;
        if (!result.success) {
          errors.push(...result.errors);
        }
      }

      // Remove guild's server list
      await this.client.servers.delete(guildId);
      console.log(`  ✅ Removed server list for guild ${guildId}`);

      // Remove guild's interval config
      await this.client.intervals.delete(guildId);
      console.log(`  ✅ Removed interval config for guild ${guildId}`);

      // Remove from cache
      this.client.guildConfigs.delete(guildId);
      console.log(`  ✅ Removed guild config from cache`);
    } catch (error) {
      const errorMsg = `Guild cleanup error: ${error}`;
      errors.push(errorMsg);
      console.error(`  ❌ ${errorMsg}`);
    }

    return { success: errors.length === 0, serversProcessed, errors };
  }

  // Clean old chart data (keep only last 30 days)
  async cleanupOldChartData(): Promise<{
    serversProcessed: number;
    dataPointsRemoved: number;
    errors: string[];
  }> {
    console.log('🧹 Cleaning up old chart data...');
    const errors: string[] = [];
    let serversProcessed = 0;
    let dataPointsRemoved = 0;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const [guildId, guildConfig] of this.client.guildConfigs.entries()) {
      for (const server of guildConfig.servers) {
        try {
          const chartData = await this.client.maxPlayers.get(server.id);
          if (chartData?.days) {
            const originalLength = chartData.days.length;
            chartData.days = chartData.days.filter(
              day => day.date > thirtyDaysAgo
            );
            const newLength = chartData.days.length;

            if (originalLength > newLength) {
              await this.client.maxPlayers.set(server.id, chartData);
              dataPointsRemoved += originalLength - newLength;
              console.log(
                `  🗑️  Removed ${originalLength - newLength} old data points from ${server.id}`
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

  // Simple periodic cleanup
  async runPeriodicCleanup(): Promise<{ summary: string; errors: string[] }> {
    console.log('🧹 Running periodic database cleanup...');

    // Just clean old chart data for now
    const chartResult = await this.cleanupOldChartData();

    const summary = `Removed ${chartResult.dataPointsRemoved} old chart entries from ${chartResult.serversProcessed} servers`;

    if (chartResult.errors.length > 0) {
      console.warn(
        `⚠️  Cleanup completed with ${chartResult.errors.length} errors`
      );
    } else {
      console.log(`✅ Periodic cleanup completed: ${summary}`);
    }

    return { summary, errors: chartResult.errors };
  }
}

export { DatabaseCleaner };
