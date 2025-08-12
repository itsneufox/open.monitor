# open.monitor

Discord bot for monitoring SA-MP and open.mp servers.

## What it does

- Monitors your SA-MP/open.mp server
- Updates Discord channels with live player counts  
- Shows server status with player info and banners
- Generates daily player activity charts

## Quick Start

1. **Clone and setup**
   ```bash
   git clone https://github.com/itsneufox/open.monitor.git
   cd open.monitor
   cp .env.example .env
   ```

2. **Edit `.env` with your Discord bot token and database info**

3. **Run with Docker**
   ```bash
   docker-compose up -d
   ```

## Commands

- `/server add ip:your.server.com port:7777` - Add your server
- `/monitor setup status_channel:#status` - Setup monitoring
- `/chart` - View player activity chart
- `/players` - See who's online

## Requirements

- Discord bot (create at [Discord Developer Portal](https://discord.com/developers/applications))
- Docker & Docker Compose

## Updates

- Status embeds: Every 5 minutes
- Voice channels: Every 10 minutes  
- Charts: Daily at midnight

## Bot Permissions

The bot needs:
- Send Messages
- Embed Links
- Attach Files
- Manage Channels (for voice channel names)

## Support

Open an issue on GitHub if something breaks.

## License

MIT