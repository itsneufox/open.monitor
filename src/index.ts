import { Client, Collection } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import { CustomClient } from './types';
import { RateLimitManager } from './utils/rateLimitManager';

// Load environment variables
config();

// Validate required environment variables
const requiredEnvVars = ['TOKEN', 'CLIENT_ID', 'DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Initialize client with required intents
const client = new Client({
  intents: ['Guilds', 'GuildVoiceStates'],
}) as CustomClient;

// Initialize rate limit manager
client.rateLimitManager = new RateLimitManager();

// Set up database collections
try {
  const mysqlAdapter = new KeyvMysql(process.env.DATABASE_URL!);

  const intervals = new Keyv({ store: mysqlAdapter, namespace: 'intervals' });
  const servers = new Keyv({ store: mysqlAdapter, namespace: 'servers' });
  const maxPlayers = new Keyv({ store: mysqlAdapter, namespace: 'maxplayers' });
  const uptimes = new Keyv({ store: mysqlAdapter, namespace: 'uptimes' });

  // Add error handlers for database connections
  const databases = { intervals, servers, maxPlayers, uptimes };
  Object.entries(databases).forEach(([name, db]) => {
    db.on('error', err => console.error(`Database error (${name}):`, err));
  });

  // Attach databases to client
  client.intervals = intervals;
  client.servers = servers;
  client.maxPlayers = maxPlayers;
  client.uptimes = uptimes;
  client.guildConfigs = new Collection();

  console.log('MySQL database connections established');
} catch (error) {
  console.error('Failed to connect to MySQL database:', error);
  process.exit(1);
}

// File loading helper
function getScriptFiles(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath)) return [];

  const files = fs.readdirSync(directoryPath);
  const hasTypeScript = files.some(file => file.endsWith('.ts') && !file.endsWith('.d.ts'));
  const hasJavaScript = files.some(file => file.endsWith('.js'));

  if (hasTypeScript && !hasJavaScript) {
    console.log('Development mode detected - loading .ts files');
    return files.filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'));
  } else if (hasJavaScript) {
    console.log('Production mode detected - loading .js files');
    return files.filter(file => file.endsWith('.js'));
  } else {
    return files.filter(file => file.endsWith('.js') || (file.endsWith('.ts') && !file.endsWith('.d.ts')));
  }
}

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
  console.error('Commands directory not found:', commandsPath);
  process.exit(1);
}

const commandFiles = getScriptFiles(commandsPath);
const commands: any[] = [];

console.log('Loading commands...');
for (const file of commandFiles) {
  try {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      console.log(`  Loaded command: ${command.data.name}`);
    } else {
      console.warn(`  Command at ${filePath} is missing required "data" or "execute" property.`);
    }
  } catch (error) {
    console.error(`  Failed to load command ${file}:`, error);
  }
}

// Load events
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
    const event = require(filePath);

    if ('name' in event && 'execute' in event) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      console.log(`  Loaded event: ${event.name} (once: ${!!event.once})`);
    } else {
      console.warn(`  Event at ${filePath} is missing required "name" or "execute" property.`);
    }
  } catch (error) {
    console.error(`  Failed to load event ${file}:`, error);
  }
}

// Deploy slash commands
import { REST, Routes } from 'discord.js';
const rest = new REST().setToken(process.env.TOKEN!);

(async () => {
  try {
    console.log('Started refreshing application (/) commands...');
    const data = (await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: commands })) as any[];
    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Failed to deploy commands:', error);
  }
})();

// Simple rate limit monitoring
client.rest.on('rateLimited', (rateLimitInfo) => {
  console.warn('Rate limit hit:', {
    timeToReset: rateLimitInfo.timeToReset,
    method: rateLimitInfo.method,
    route: rateLimitInfo.route,
    global: rateLimitInfo.global
  });
});

// Monitor invalid requests
client.on('invalidRequestWarning', (data) => {
  console.warn(`Invalid requests: ${data.count}/10000 (${data.remainingTime}ms remaining)`);

  // Only log when approaching the limit
  if (data.count > 8000) {
    console.error(`⚠️  Approaching invalid request limit! Count: ${data.count}/10000`);
    console.error('Check for permission errors or malformed requests');
  }
});

// Cleanup old rate limit entries every hour
setInterval(() => {
  try {
    const { SecurityValidator } = require('./utils/securityValidator');
    SecurityValidator.cleanupOldEntries();
  } catch (error) {
    console.error('Error during rate limit cleanup:', error);
  }
}, 3600000); // 1 hour

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  try {
    await client.destroy();
    console.log('Client destroyed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Login to Discord
client.login(process.env.TOKEN).catch(error => {
  console.error('Failed to login to Discord:', error);
  process.exit(1);
});

export default commands;