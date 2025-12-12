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

- `/manage` – Management panel that includes the **Setup Server** wizard, channel selectors, and monitoring controls.
- `/status` – Public server status embed with optional fresh query (`fresh:true`).
- `/players` – Snapshot of who is online right now.
- `/chart` – 30-day player activity chart (generated from the 2‑minute polling data).
- `/help` – Ephemeral help center with command drill-downs.
- `/reportbug` – Sends users to [GitHub issues](https://github.com/itsneufox/open.monitor/issues).

Owner-only:
- `/update` – Force a status/chart refresh across guilds.
- `/maintenance` – Clean old data or fix DB entries.
- `/ban`, `/reboot`, `/debug` – Restricted bot-owner tooling.

## Requirements

- Discord bot (create at [Discord Developer Portal](https://discord.com/developers/applications))
- Docker & Docker Compose

## Updates

- Status embeds: Every 2 minutes
- Voice channels: Every 2 minutes  
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
