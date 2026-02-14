# Privacy Policy for open.monitor Discord Bot

**Last Updated: January 01, 2026**

This Privacy Policy explains how the open.monitor Discord bot ("Bot," "Service," "we," "us," or "our") collects, uses, stores, and shares information when you invite or use the Bot.

## 1. Scope

This Policy applies to:
- Discord guilds (servers) where the Bot is installed
- Users who interact with the Bot
- Game servers monitored by the Bot

By using the Bot, you agree to the practices described in this Policy.

## 2. Information We Collect

### 2.1 Discord Data
- Guild IDs and guild names
- Channel IDs where the Bot operates
- User IDs of administrators and users who run commands
- Message IDs for status updates and charts
- Role IDs used for permission checks

### 2.2 Server Monitoring Data
- Game server IP addresses and ports
- Server names and metadata
- Player counts and server status
- Response times and availability metrics
- Game server information (hostname, gamemode, language, version)

### 2.3 Monitoring and Analytics Data
- Historical player count data (up to 30 days)
- Server uptime/downtime statistics
- Daily peak player information
- Timezone and daily reset preferences

### 2.4 Security and Rate Limiting Data
- Query timestamps and frequency
- Failure rates and response times
- Behavioral signals for abuse prevention

## 3. How We Use Information

We use collected data to:
- Provide server monitoring, status updates, and charts
- Maintain service reliability and prevent abuse
- Enforce rate limits and security measures
- Troubleshoot issues and improve Bot functionality
- Comply with Discord's Terms of Service and Developer Terms

## 4. Data Storage and Retention

- Primary data is stored in secure MySQL databases
- Cached data is stored in Valkey (Redis-compatible) with automatic expiration
- Data is automatically cleaned after periods of inactivity

Retention periods:
- Server monitoring data: retained while actively monitored + 30 days
- Chart data: 30-day rolling window
- Uptime statistics: retained while server is configured + 90 days
- Rate limiting data: 24 hours
- Error logs: 7 days
- Cached data: 60 seconds to 24 hours depending on data type
- Inactive guild data: cleaned after 30 days of inactivity

## 5. Data Sharing

We do not sell or rent your data. We share data only when:
- Required by law or legal process
- Necessary to protect our rights, property, or safety
- You provide explicit consent
- Data is anonymized and aggregated for service improvement

## 6. Data Security

We implement appropriate technical and organizational safeguards, including:
- Database encryption
- Access controls
- Input validation and sanitization
- Rate limiting and abuse detection

## 7. Your Rights

Depending on your jurisdiction (including GDPR), you may have the right to:
- Access data we process about you
- Request correction of inaccurate data
- Request deletion of your data
- Restrict or object to certain processing
- Request a portable copy of your data

To exercise these rights, contact us using the details in Section 10.

## 8. Children's Privacy

The Bot is not intended for children under 13. If you are under 18, you must have parental consent to use the Bot.

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. Changes take effect when posted. Continued use of the Bot after changes constitutes acceptance of the updated Policy.

## 10. Contact

For questions, concerns, or data requests:
- GitHub Repository: https://github.com/itsneufox/open.monitor
- Website: https://itsneufox.xyz
- GitHub Issues: https://github.com/itsneufox/open.monitor/issues
- Developer: @itsneufox

---

By using the open.monitor Discord Bot, you acknowledge that you have read and understood this Privacy Policy.

---

open.monitor Discord Bot - Developed by itsneufox
Website: https://itsneufox.xyz | GitHub: https://github.com/itsneufox/open.monitor
