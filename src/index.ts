import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import { CustomClient } from './types';

// Load environment variables
config();

// Validate required environment variables
const requiredEnvVars = ['TOKEN', 'CLIENT_ID', 'DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Initialize client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
}) as CustomClient;

// Set up database collections with error handling
try {
  // Create MySQL adapter
  const mysqlAdapter = new KeyvMysql(process.env.DATABASE_URL!);
  
  // Initialize Keyv instances with proper options
  const intervals = new Keyv({
    store: mysqlAdapter,
    namespace: 'intervals'
  });
  
  const servers = new Keyv({
    store: mysqlAdapter,
    namespace: 'servers'
  });
  
  const maxPlayers = new Keyv({
    store: mysqlAdapter,
    namespace: 'maxplayers'
  });
  
  const uptimes = new Keyv({
    store: mysqlAdapter,
    namespace: 'uptimes'
  });

  // Add error handlers for database connections
  const databases = { intervals, servers, maxPlayers, uptimes };
  Object.entries(databases).forEach(([name, db]) => {
    db.on('error', (err) => console.error(`❌ Database error (${name}):`, err));
  });

  // Attach databases to client for access in other files
  client.intervals = intervals;
  client.servers = servers;
  client.maxPlayers = maxPlayers;
  client.uptimes = uptimes;
  client.guildConfigs = new Collection();

  console.log('✅ MySQL database connections established');
} catch (error) {
  console.error('❌ Failed to connect to MySQL database:', error);
  process.exit(1);
}

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
  console.error('❌ Commands directory not found:', commandsPath);
  process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands: any[] = [];

console.log('📝 Loading commands...');
for (const file of commandFiles) {
  try {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Set command in collection
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      console.log(`  ✅ Loaded command: ${command.data.name}`);
    } else {
      console.warn(`  ⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
    }
  } catch (error) {
    console.error(`  ❌ Failed to load command ${file}:`, error);
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');

if (!fs.existsSync(eventsPath)) {
  console.error('❌ Events directory not found:', eventsPath);
  process.exit(1);
}

const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log('🎭 Loading events...');
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
      console.log(`  ✅ Loaded event: ${event.name} (once: ${!!event.once})`);
    } else {
      console.warn(`  ⚠️  Event at ${filePath} is missing required "name" or "execute" property.`);
    }
  } catch (error) {
    console.error(`  ❌ Failed to load event ${file}:`, error);
  }
}

// Deploy slash commands
const rest = new REST().setToken(process.env.TOKEN!);

(async () => {
  try {
    console.log('🔄 Started refreshing application (/) commands...');

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID!),
      { body: commands },
    ) as any[];

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
  }
})();

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  try {
    await client.destroy();
    console.log('✅ Client destroyed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Login to Discord
client.login(process.env.TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});

export default commands;