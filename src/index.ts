import { Client, Collection } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import {
  ChartData,
  CustomClient,
  IntervalConfig,
  ServerConfig,
  UptimeStats,
} from './types';
import { RateLimitManager } from './utils/rateLimitManager';
import { WebhookLogger } from './utils/webhookLogger';
import { SecurityValidator } from './utils/securityValidator';
import { retryDatabaseOperation } from './utils/databaseReliability';

config();

// Initialize webhook logger
WebhookLogger.initialize();

const requiredEnvVars = ['TOKEN', 'CLIENT_ID', 'DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(
    'Missing required environment variables:',
    missingEnvVars.join(', ')
  );
  process.exit(1);
}

const client = new Client({
  intents: ['Guilds', 'GuildVoiceStates'],
}) as CustomClient;

client.rateLimitManager = new RateLimitManager();
SecurityValidator.setClient(client);

try {
  const createDatabase = <Value>(namespace: string): Keyv<Value> =>
    new Keyv<Value>({
      store: new KeyvMysql(process.env.DATABASE_URL!),
      namespace,
      throwOnErrors: true,
    });

  const intervals = createDatabase<IntervalConfig>('intervals');
  const servers = createDatabase<ServerConfig[]>('servers');
  const maxPlayers = createDatabase<ChartData>('maxplayers');
  const uptimes = createDatabase<UptimeStats>('uptimes');

  const databases = { intervals, servers, maxPlayers, uptimes };
  Object.entries(databases).forEach(([name, db]) => {
    db.on('error', err => console.error(`Database error (${name}):`, err));
  });

  client.intervals = intervals;
  client.servers = servers;
  client.maxPlayers = maxPlayers;
  client.uptimes = uptimes;
  client.guildConfigs = new Collection();

  console.log('MySQL database clients initialized');
} catch (error) {
  console.error('Failed to connect to MySQL database:', error);
  process.exit(1);
}

function getScriptFiles(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath)) return [];

  const files = fs.readdirSync(directoryPath);
  const hasTypeScript = files.some(
    file => file.endsWith('.ts') && !file.endsWith('.d.ts')
  );
  const hasJavaScript = files.some(file => file.endsWith('.js'));

  if (hasTypeScript && !hasJavaScript) {
    console.log('Development mode detected - loading .ts files');
    return files.filter(
      file => file.endsWith('.ts') && !file.endsWith('.d.ts')
    );
  } else if (hasJavaScript) {
    console.log('Production mode detected - loading .js files');
    return files.filter(file => file.endsWith('.js'));
  } else {
    return files.filter(
      file =>
        file.endsWith('.js') ||
        (file.endsWith('.ts') && !file.endsWith('.d.ts'))
    );
  }
}

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
  console.error('Commands directory not found:', commandsPath);
  process.exit(1);
}

const commandFiles = getScriptFiles(commandsPath);
const commands: Array<Record<string, unknown>> = [];

console.log('Loading commands...');
for (const file of commandFiles) {
  try {
    const filePath = path.join(commandsPath, file);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);

      // Skip guild-specific commands from global registration
      if (!command.guildOnly) {
        commands.push(command.data.toJSON());
      }

      console.log(
        `  Loaded command: ${command.data.name}${command.guildOnly ? ' (guild-specific)' : ''}`
      );
    } else {
      console.warn(
        `  Command at ${filePath} is missing required "data" or "execute" property.`
      );
    }
  } catch (error) {
    console.error(`  Failed to load command ${file}:`, error);
  }
}

const eventsPath = path.join(__dirname, 'events');

if (!fs.existsSync(eventsPath)) {
  console.error('Events directory not found:', eventsPath);
  process.exit(1);
}

const eventFiles = getScriptFiles(eventsPath);

console.log('Loading events...');
for (const file of eventFiles) {
  try {
    const filePath = path.join(eventsPath, file);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const event = require(filePath);

    if ('name' in event && 'execute' in event) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      console.log(`  Loaded event: ${event.name} (once: ${!!event.once})`);
    } else {
      console.warn(
        `  Event at ${filePath} is missing required "name" or "execute" property.`
      );
    }
  } catch (error) {
    console.error(`  Failed to load event ${file}:`, error);
  }
}

import { REST, Routes } from 'discord.js';
const rest = new REST().setToken(process.env.TOKEN!);

(async () => {
  try {
    // Register global commands
    console.log('Started refreshing application (/) commands...');
    const data = (await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID!),
      { body: commands }
    )) as Array<Record<string, unknown>>;
    console.log(
      `Successfully reloaded ${data.length} global application (/) commands.`
    );

    // Register guild-specific commands
    const ownerGuildId = '1409643885726138380';
    const guildCommands: Array<unknown> = [];

    type SlashCommandData = { toJSON: () => unknown };
    for (const [, command] of client.commands.entries()) {
      if ('guildOnly' in command && command.guildOnly) {
        const slashData = command.data as Partial<SlashCommandData>;
        if (slashData && typeof slashData.toJSON === 'function') {
          guildCommands.push(slashData.toJSON());
        }
      }
    }

    if (guildCommands.length > 0) {
      console.log(
        `Registering ${guildCommands.length} owner-only commands to guild ${ownerGuildId}...`
      );
      const guildData = (await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID!, ownerGuildId),
        { body: guildCommands }
      )) as Array<Record<string, unknown>>;
      console.log(
        `Successfully reloaded ${guildData.length} guild-specific commands.`
      );
    }
  } catch (error) {
    console.error('Failed to deploy commands:', error);
  }
})();

client.rest.on('rateLimited', rateLimitInfo => {
  console.warn('Rate limit hit:', {
    timeToReset: rateLimitInfo.timeToReset,
    method: rateLimitInfo.method,
    route: rateLimitInfo.route,
    global: rateLimitInfo.global,
  });
});

client.on('invalidRequestWarning', data => {
  console.warn(
    `Invalid requests: ${data.count}/10000 (${data.remainingTime}ms remaining)`
  );

  if (data.count > 8000) {
    console.error(
      `Approaching invalid request limit! Count: ${data.count}/10000`
    );
    console.error('Check for permission errors or malformed requests');

    WebhookLogger.critical({
      title: 'Invalid Request Limit Warning',
      description: 'Bot is approaching Discord invalid request limit',
      fields: [
        { name: 'Count', value: `${data.count}/10000`, inline: true },
        {
          name: 'Time Remaining',
          value: `${Math.floor(data.remainingTime / 1000)}s`,
          inline: true,
        },
      ],
    });
  }
});

setInterval(() => {
  try {
    SecurityValidator.cleanupOldEntries();
  } catch (error) {
    console.error('Error during rate limit cleanup:', error);
  }
}, 3600000);

async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  try {
    // Save shutdown timestamp for downtime tracking
    await client.maxPlayers.set('bot_last_shutdown', Date.now());
    console.log('Saved shutdown timestamp');

    await client.destroy();
    console.log('Client destroyed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);

  WebhookLogger.error({
    title: 'Unhandled Promise Rejection',
    description: `\`\`\`${String(reason).substring(0, 1900)}\`\`\``,
  });
});

process.on('uncaughtException', async error => {
  console.error('Uncaught Exception:', error);

  WebhookLogger.critical({
    title: 'Uncaught Exception',
    description: `\`\`\`${error.stack?.substring(0, 1900) || error.message}\`\`\``,
  });

  // Save shutdown timestamp before crash
  try {
    await client.maxPlayers.set('bot_last_shutdown', Date.now());
  } catch {
    // Ignore errors during emergency shutdown
  }

  process.exit(1);
});

async function startBot(): Promise<void> {
  try {
    await retryDatabaseOperation(
      async () => {
        await Promise.all([
          client.intervals.get('__healthcheck__'),
          client.servers.get('__healthcheck__'),
          client.maxPlayers.get('__healthcheck__'),
          client.uptimes.get('__healthcheck__'),
        ]);
      },
      'verifying the MySQL connection',
      3
    );
    console.log('MySQL database connection verified');
  } catch (error) {
    console.error('Failed to verify MySQL database connection:', error);
    process.exit(1);
  }

  try {
    await client.login(process.env.TOKEN);

    try {
      const { valkeyReady } = await import('./utils/valkey');
      await valkeyReady;
      console.log('All systems ready!');
    } catch {
      console.warn('Valkey not available, continuing without cache');
    }
  } catch (error) {
    console.error('Failed to login to Discord:', error);
    process.exit(1);
  }
}

void startBot();

export default commands;
