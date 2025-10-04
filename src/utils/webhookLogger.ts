import { EmbedBuilder, WebhookClient } from 'discord.js';

interface LogOptions {
  title: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  color?: number;
  footer?: string;
}

export class WebhookLogger {
  private static client: WebhookClient | null = null;
  private static enabled: boolean = false;
  private static queue: LogOptions[] = [];
  private static isProcessing: boolean = false;
  private static lastLog: number = 0;
  private static readonly MIN_DELAY = 2000; // 2 seconds between logs

  static initialize() {
    const webhookUrl = process.env.WEBHOOK_LOG_URL;

    if (!webhookUrl) {
      console.log('Webhook logging disabled (no WEBHOOK_LOG_URL in .env)');
      return;
    }

    try {
      this.client = new WebhookClient({ url: webhookUrl });
      this.enabled = true;
      console.log('Webhook logging enabled');
    } catch (error) {
      console.error('Failed to initialize webhook logger:', error);
    }
  }

  private static async processQueue() {
    if (this.isProcessing || this.queue.length === 0 || !this.client) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastLog = now - this.lastLog;

      if (timeSinceLastLog < this.MIN_DELAY) {
        await new Promise(resolve =>
          setTimeout(resolve, this.MIN_DELAY - timeSinceLastLog)
        );
      }

      const logOptions = this.queue.shift();
      if (!logOptions) continue;

      try {
        const embed = new EmbedBuilder()
          .setTitle(logOptions.title)
          .setColor(logOptions.color || 0x5865f2)
          .setTimestamp();

        if (logOptions.description) {
          embed.setDescription(logOptions.description);
        }

        if (logOptions.fields && logOptions.fields.length > 0) {
          embed.addFields(logOptions.fields);
        }

        if (logOptions.footer) {
          embed.setFooter({ text: logOptions.footer });
        }

        await this.client.send({ embeds: [embed] });
        this.lastLog = Date.now();
      } catch (error) {
        console.error('Failed to send webhook log:', error);
      }
    }

    this.isProcessing = false;
  }

  static async info(options: LogOptions) {
    if (!this.enabled) return;

    this.queue.push({
      ...options,
      color: options.color || 0x5865f2, // Blurple
    });

    this.processQueue();
  }

  static async success(options: LogOptions) {
    if (!this.enabled) return;

    this.queue.push({
      ...options,
      color: options.color || 0x57f287, // Green
    });

    this.processQueue();
  }

  static async warning(options: LogOptions) {
    if (!this.enabled) return;

    this.queue.push({
      ...options,
      color: options.color || 0xfee75c, // Yellow
    });

    this.processQueue();
  }

  static async error(options: LogOptions) {
    if (!this.enabled) return;

    this.queue.push({
      ...options,
      color: options.color || 0xed4245, // Red
    });

    this.processQueue();
  }

  static async ban(options: LogOptions) {
    if (!this.enabled) return;

    this.queue.push({
      ...options,
      color: options.color || 0xff6b6b, // Red/Orange
    });

    this.processQueue();
  }

  static async critical(options: LogOptions) {
    if (!this.enabled) return;

    // Critical logs skip the queue and send immediately
    if (!this.client) return;

    try {
      const embed = new EmbedBuilder()
        .setTitle(`🚨 ${options.title}`)
        .setColor(0xed4245)
        .setTimestamp();

      if (options.description) {
        embed.setDescription(options.description);
      }

      if (options.fields && options.fields.length > 0) {
        embed.addFields(options.fields);
      }

      if (options.footer) {
        embed.setFooter({ text: options.footer });
      }

      await this.client.send({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to send critical webhook log:', error);
    }
  }
}
