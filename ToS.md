# Terms of Service for open.monitor Discord Bot

**Last Updated: January 15, 2025**

## 1. Acceptance of Terms

By inviting, using, or interacting with the open.monitor Discord bot ("Bot," "Service," "we," "us," or "our"), you ("User," "you," or "your") agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you must not use the Bot.

**Age Requirement**: You must be at least 13 years old to use this Bot, in compliance with Discord's Terms of Service and COPPA regulations. If you are under 18, you must have parental consent to use this service.

## 2. Description of Service

open.monitor is a Discord bot designed to monitor SA:MP (San Andreas Multiplayer) and open.mp game servers. The Bot provides the following features:

- Real-time server status monitoring and updates
- Player count tracking and historical charts
- Automated channel updates with live server data
- Player list retrieval and display
- Daily activity charts and analytics
- Server uptime tracking and statistics

### 2.1 Bot Invitation and Setup
- The Bot must be invited to Discord servers by users with appropriate permissions
- Only server administrators or users with "Manage Server" permission should invite the Bot
- By inviting the Bot, server administrators agree to these Terms on behalf of their server
- Server administrators are responsible for ensuring compliance with these Terms

## 3. Data Collection and Usage

### 3.1 Data We Collect
The Bot collects and processes the following data:

**Server Data:**
- Server IP addresses and ports
- Server names and metadata
- Player counts and server status
- Response times and availability metrics
- Game server information (hostname, gamemode, language, version)

**Discord Data:**
- Guild (server) IDs and names
- Channel IDs where the Bot operates
- User IDs of Bot administrators and users who interact with commands
- Message IDs for status updates and charts
- Role IDs for permission management

**Monitoring Data:**
- Historical player count data (up to 30 days)
- Server uptime/downtime statistics
- Chart data and daily peak player information
- Timezone and daily reset hour preferences

**Security and Rate Limiting Data:**
- IP addresses of monitored game servers
- Query timestamps and frequency
- Failure rates and response times
- Behavioral analysis for abuse prevention
- Trust scores and security metrics

### 3.2 How We Use Data
We use collected data to:
- Provide server monitoring and status updates
- Generate charts and analytics
- Maintain service reliability and prevent abuse
- Implement rate limiting and security measures
- Troubleshoot and improve Bot functionality
- Comply with Discord's Terms of Service and API guidelines

### 3.3 Data Storage and Retention
- Data is stored in secure MySQL databases
- Cached data is stored in Valkey/Redis with automatic expiration
- Historical data (charts, uptime) is retained for functionality purposes
- Data is automatically cleaned up after periods of inactivity
- We implement database encryption and access controls

### 3.4 Data Retention
- Server monitoring data: Retained while server is actively monitored + 30 days
- Chart data: 30 days rolling window automatically maintained
- Uptime statistics: Retained while server is configured + 90 days
- Rate limiting data: 24 hours for security analysis
- Error logs: 7 days for troubleshooting
- Cached data: Automatic expiration (60 seconds to 24 hours)
- Inactive guild data: Automatically cleaned after 30 days of inactivity

## 4. Rate Limiting and Abuse Prevention

### 4.1 Rate Limiting
The Bot implements comprehensive rate limiting to protect both our service and monitored game servers:
- Maximum 2 queries per monitored server every 5 minutes
- Maximum 100 user requests per hour
- Maximum 500 guild requests per hour
- Enhanced behavioral analysis and abuse detection

### 4.2 Prohibited Activities
You may not:
- Attempt to bypass or circumvent rate limiting measures
- Use the Bot to overload or attack game servers
- Provide false or malicious server information
- Attempt to exploit security vulnerabilities
- Use the Bot for illegal activities or harassment
- Violate Discord's Terms of Service

### 4.3 Security Measures
We implement advanced security features including:
- Behavioral analysis and anomaly detection
- Circuit breaker patterns for failing servers
- IP-based and user-based rate limiting
- Input validation and sanitization
- Automated threat detection and mitigation

### 4.4 Security Vulnerability Reporting
If you discover a security vulnerability, we encourage transparent reporting:
- Create a detailed GitHub issue with the vulnerability information
- Include steps to reproduce the issue
- Provide suggestions for remediation if possible
- We will acknowledge and address security issues publicly
- Critical vulnerabilities will be prioritized for immediate fixes
- We believe in transparency and community-driven security

### 4.5 Fair Use Policy
We encourage responsible use of the Bot:
- **Monitoring frequency**: Respect the built-in rate limits
- **Server load**: Don't monitor servers experiencing issues
- **Resource sharing**: Be considerate of shared infrastructure
- **Community guidelines**: Help maintain a positive ecosystem

Violations of fair use may result in temporary restrictions or permanent suspension.

## 5. User Responsibilities

### 5.1 Server Information
- You are responsible for providing accurate server information
- You must have permission to monitor the servers you add
- You must not add servers you do not own or lack permission to monitor

### 5.2 Discord Server Management
- Server administrators are responsible for Bot configuration
- Management roles and permissions are set by server administrators
- You must comply with Discord's Community Guidelines

### 5.3 Compliance
- You must use the Bot in accordance with all applicable laws
- You must respect the terms of service of monitored game servers
- You must not use the Bot to violate any third-party rights

### 5.4 Required Discord Permissions
The Bot requires the following Discord permissions to function:
- **Send Messages**: To post status updates and respond to commands
- **Embed Links**: To display server information in embedded format
- **Attach Files**: To send chart images
- **Manage Channels**: To update voice channel names with live data
- **View Channels**: To access configured monitoring channels
- **Read Message History**: To edit existing status messages

You are responsible for granting appropriate permissions and may revoke them at any time.

## 6. Privacy and Data Protection

### 6.1 Data Privacy
- We do not sell, trade, or transfer your data to third parties
- Data is used solely for Bot functionality and service improvement
- We implement appropriate technical and organizational security measures

### 6.2 Data Access
- Guild administrators can view data related to their servers
- Users can request information about data we have collected about them
- Server owners can request removal of their server data

### 6.3 Data Sharing
We may share data only in the following circumstances:
- When required by law or legal process
- To protect our rights, property, or safety
- With your explicit consent
- In anonymized, aggregated form for service improvement

### 6.4 GDPR and Data Protection Rights
Under GDPR and applicable data protection laws, you have the right to:
- **Access**: Request information about data we process about you
- **Rectification**: Request correction of inaccurate personal data
- **Erasure**: Request deletion of your personal data ("right to be forgotten")
- **Portability**: Request your data in a portable format
- **Restriction**: Request limitation of processing in certain circumstances
- **Objection**: Object to processing based on legitimate interests

To exercise these rights, contact us through the GitHub repository or website.

## 7. Service Availability and Modifications

### 7.1 Service Availability
- We strive to maintain high uptime but cannot guarantee 100% availability
- Maintenance windows may cause temporary service interruptions
- We are not liable for downtime or service interruptions

### 7.2 Service Modifications
- We reserve the right to modify, suspend, or discontinue the Bot
- We may update features, rate limits, or Terms of Service
- Significant changes will be communicated to users when possible

### 7.3 Service Limits
The following limits apply to Bot usage:
- **Maximum 10 servers per Discord guild**
- **Maximum 30 days of historical chart data**
- **Rate limiting as specified in section 4.1**
- **Cache retention as specified in section 3.4**
- **Maximum 1000 players displayed in player lists**

These limits may be adjusted based on service capacity and performance requirements.

## 8. Intellectual Property

### 8.1 Bot Ownership
- The Bot and its code are owned by the Bot developers
- The Bot is provided under MIT License for the open-source components
- You do not acquire any ownership rights by using the Bot

### 8.2 User Content
- You retain ownership of any server information you provide
- You grant us permission to use this information for Bot functionality
- You represent that you have the right to provide this information

### 8.3 Open Source License
- This Bot is open source software licensed under the MIT License
- Source code is available at: https://github.com/itsneufox/open.monitor
- You may view, fork, and contribute to the code subject to the MIT License terms
- The MIT License applies to the code; these Terms of Service apply to the hosted Bot service

## 9. Disclaimers and Limitation of Liability

### 9.1 Service Disclaimers
THE BOT IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
- Accuracy of server data or monitoring information
- Uninterrupted or error-free service operation
- Fitness for any particular purpose
- Non-infringement of third-party rights

### 9.2 Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR:
- Any indirect, incidental, special, or consequential damages
- Loss of data, profits, or business opportunities
- Damages resulting from Bot downtime or errors
- Any damages exceeding the amount you paid for the service (which is $0)

### 9.3 Third-Party Services
- We are not affiliated with Rockstar Games, SA:MP, or open.mp
- We are not responsible for the content or availability of monitored game servers
- Game server data accuracy depends on third-party server responses
- Discord service availability is outside our control
- We are not liable for any issues with monitored game servers

## 10. Indemnification

You agree to indemnify and hold harmless the Bot developers, contributors, and service providers from any claims, damages, losses, or expenses arising from:
- Your use of the Bot
- Your violation of these Terms
- Your violation of any third-party rights
- Any server information you provide

## 11. Termination

### 11.1 Termination by You
- You may stop using the Bot at any time
- You may remove the Bot from your Discord server
- You may request deletion of your data

### 11.2 Termination by Us
We may terminate or suspend your access to the Bot if:
- You violate these Terms of Service
- You engage in abusive or harmful behavior
- Required by law or Discord's requirements
- At our sole discretion for any reason

### 11.3 Effect of Termination
Upon termination:
- Your access to the Bot will cease
- Data may be retained for security and legal purposes
- These Terms will survive termination where applicable

## 12. Discord Terms Compliance

This Bot complies with Discord's Terms of Service and Developer Terms of Service. By using this Bot, you also agree to comply with:
- Discord's Terms of Service
- Discord's Community Guidelines
- Discord's Developer Terms of Service

## 13. Contact Information

For questions, concerns, or requests regarding these Terms or the Bot:

- **GitHub Repository**: https://github.com/itsneufox/open.monitor
- **Website**: https://itsneufox.xyz
- **GitHub Issues**: https://github.com/itsneufox/open.monitor/issues
- **Developer**: @itsneufox

## 14. Governing Law and Dispute Resolution

### 14.1 Governing Law
These Terms are governed by European Union law and regulations, including GDPR compliance and applicable EU directives, without regard to conflict of law principles.

### 14.2 Dispute Resolution
Any disputes arising from these Terms or the Bot will be resolved through:
1. Good faith negotiation
2. Mediation through EU-recognized dispute resolution mechanisms
3. In the courts of any EU member state with competent jurisdiction
4. European Small Claims Procedure for applicable disputes under €5,000

### 14.3 Jurisdiction
For the purpose of legal proceedings:
- Users may bring claims in the courts of their EU member state of residence
- We may bring claims in any EU member state court with competent jurisdiction
- Cross-border disputes will follow EU regulations on jurisdiction and enforcement
- All parties acknowledge the supremacy of EU law and ECJ decisions

## 15. Severability and Entire Agreement

### 15.1 Severability
If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will remain in full force and effect.

### 15.2 Entire Agreement
These Terms constitute the entire agreement between you and us regarding the Bot and supersede all prior agreements and understandings.

## 16. Changes to Terms

We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Your continued use of the Bot after changes constitutes acceptance of the new Terms.

**Version History:**
- All changes to these Terms are tracked in our [Git commit history](https://github.com/itsneufox/open.monitor/commits/main/ToS.md)
- Major changes will be announced via GitHub releases
- Users can view the exact differences between versions using Git diff

---

## Additional Information

- **Current Version**: See [package.json](https://github.com/itsneufox/open.monitor/blob/main/package.json) or [latest release](https://github.com/itsneufox/open.monitor/releases/latest)
- **Commit History**: View all changes on [GitHub](https://github.com/itsneufox/open.monitor/commits/main)
- **Supported Protocols**: SA:MP query protocol, open.mp extensions
- **Status Page**: Check https://itsneufox.xyz for service status updates
- **Documentation**: Available in the [GitHub repository README](https://github.com/itsneufox/open.monitor#readme)
- **Contributing**: Contributions welcome via [GitHub pull requests](https://github.com/itsneufox/open.monitor/pulls)

---

**By using the open.monitor Discord Bot, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.**

---

**open.monitor Discord Bot - Developed by itsneufox**  
**Website: https://itsneufox.xyz | GitHub: https://github.com/itsneufox/open.monitor**

---
**TL;DR**: We monitor SA:MP/open.mp servers for you, store minimal data (30 days max), respect your privacy, implement strong rate limiting, and believe in transparency. You must be 13+ to use this bot and follow fair use guidelines. Full source code available on GitHub.
