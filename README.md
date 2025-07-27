# open.monitor - Discord Bot for SA-MP & open.mp

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14+-blue.svg)](https://discord.js.org/)

open.monitor is a powerful Discord bot designed specifically for SA-MP and open.mp server communities. 
It enhances your server management experience by providing real-time monitoring, automated status updates, and comprehensive analytics.

## Features

### Real-time Server Monitoring
- **Live Status Updates**:
  - Server online/offline status
  - Current player count and server capacity
  - Gamemode and language information
  - Password protection status
  - Automatic version detection (SA:MP vs open.mp)

### Advanced Analytics
- **Player Activity Charts**:
  - 30-day player activity trends with professional styling
  - Peak player tracking and statistics
  - Server utilization percentage
  - Weekly trend analysis with growth indicators
  - Interactive tooltips with detailed information

### Automated Channel Updates
- **Dynamic Channel Management**:
  - Voice channels with live player counts
  - Server IP display channels
  - Automated status embed updates every 3 minutes
  - Daily chart generation at midnight

### Multi-Server Support
- **Flexible Server Management**:
  - Monitor multiple servers per Discord guild
  - Easy server switching and activation
  - Individual server configuration and data tracking
  - Automatic first-server activation

### Role-Based Permissions
- **Advanced Access Control**:
  - Admin-only commands by default
  - Configurable management roles
  - Public read-only commands (charts, status)
  - Flexible permission inheritance

### Comprehensive Data Tracking
- **Performance Analytics**:
  - Uptime/downtime statistics
  - Historical data retention (30 days)
  - Peak player tracking
  - Server reliability metrics

## Installation

### Prerequisites
- Node.js 18 or higher
- MySQL 8.0 or higher
- Discord Bot Token and Application

### Quick Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/itsneufox/open.monitor.git
   cd open.monitor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build and start**
   ```bash
   npm run build
   npm start
   ```

## Configuration

### Environment Variables

Configure the bot through your `.env` file:

| Variable | Description |
|----------|-------------|
| `TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application client ID |
| `DATABASE_URL` | MySQL connection string |

### Discord Bot Setup

1. Create application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create bot and copy token to `.env`
3. Invite bot using this URL:
   ```
   https://discord.com/oauth2/authorize?client_id=1398997044219216073
   ```

### Required Permissions

The bot requires these Discord permissions:
- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Use Slash Commands
- Manage Channels
- Manage Messages

## Commands

### Server Management
- `/server add <ip> [port] [name]` - Add server to monitoring (auto-activates if first)
- `/server list` - Display all configured servers with status indicators
- `/server activate <server>` - Set active monitoring target
- `/server remove <server> <confirm>` - Remove server and all associated data
- `/server status [server]` - Get detailed server status information

### Monitoring Configuration
- `/monitor setup <status_channel> [chart_channel] [player_count_channel]` - Quick monitoring setup wizard
- `/monitor enable` - Enable automatic monitoring with current settings
- `/monitor disable` - Disable all monitoring functions
- `/monitor status` - Show current monitoring configuration

### Analytics & Utilities
- `/chart [server]` - Generate 30-day player activity chart with statistics
- `/forceupdate [server]` - Force immediate status and channel updates
- `/role set <role>` - Configure management role (admin only)
- `/role remove` - Remove role requirements (admin only)
- `/role show` - Display current role configuration

## Usage Examples

### Basic Server Setup
```bash
# Add your first server (automatically becomes active)
/server add ip:127.0.0.1 port:7777 name:"My SA:MP Server"

# Configure monitoring channels
/monitor setup status_channel:#server-status chart_channel:#analytics

# Server is now being monitored automatically!
```

### Multi-Server Configuration
```bash
# Add multiple servers
/server add ip:192.168.1.100 port:7777 name:"Main Server"
/server add ip:192.168.1.101 port:7778 name:"Test Server"

# Switch active monitoring
/server activate "Test Server"

# View all servers
/server list
```

### Permission Management
```bash
# Allow server moderators to manage the bot
/role set @Server Moderators

# View current permissions
/role show

# Remove role requirement (admin-only again)
/role remove
```

## Docker Deployment

### Using Docker Compose
```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: your_password
      MYSQL_DATABASE: openmonitor
    volumes:
      - mysql_data:/var/lib/mysql

  bot:
    build: .
    depends_on:
      - mysql
    environment:
      - DATABASE_URL=mysql://root:your_password@mysql:3306/openmonitor
    restart: unless-stopped

volumes:
  mysql_data:
```

### Quick Docker Start
```bash
# Clone and setup
git clone https://github.com/itsneufox/open.monitor.git
cd open.monitor
cp .env.example .env

# Edit .env with your configuration
# Build and start
npm run build
docker-compose up -d
```
## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [SA-MP Team](https://www.youtube.com/watch?v=dQw4w9WgXcQ) for the original San Andreas Multiplayer mod
- [open.mp Team](https://open.mp/) for the modern server implementation

## Author

Created and maintained by [itsneufox](https://github.com/itsneufox)