import {
  Client,
  Events,
  GatewayIntentBits,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type User
} from 'discord.js';

import type { DiscordPluginConfig } from './config.js';
import type { Logger } from './logger.js';
import {
  formatDiscordMessage,
  type MessageMedia,
  type ReplyTarget
} from './normalize.js';
import { classifyMessage, shouldLeaveGuild } from './policy.js';
import { sendReply, type SendableChannel } from './sender.js';
import type { IncomingDiscordMessage, MessageHandler } from './types.js';

function displayName(user: Pick<User, 'globalName' | 'username'>): string {
  return user.globalName ?? user.username;
}

export class DiscordBridge {
  private readonly client: Client;

  constructor(
    private readonly config: DiscordPluginConfig,
    private readonly handler: MessageHandler,
    private readonly logger: Logger
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.client.on(Events.MessageCreate, (message) => {
      void this.handleMessage(message).catch((error) => {
        this.logger.error('message handling failed', {
          messageId: message.id,
          channelId: message.channelId,
          error
        });
      });
    });

    this.client.on(Events.GuildCreate, (guild) => {
      if (shouldLeaveGuild(guild.id, this.config)) {
        void this.leaveGuild(guild);
      }
    });

    this.client.on(Events.Error, (error) => {
      this.logger.error('Discord client error', { error });
    });

    this.client.once(Events.ClientReady, (client) => {
      this.logger.info('Discord connected', { user: client.user.tag });
      void this.leaveUnknownGuilds();
    });
  }

  async start(): Promise<void> {
    await this.client.login(this.config.discordToken);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  private async leaveUnknownGuilds(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      if (shouldLeaveGuild(guild.id, this.config)) {
        await this.leaveGuild(guild);
      }
    }
  }

  private async leaveGuild(guild: Guild): Promise<void> {
    try {
      await guild.leave();
      this.logger.warn('left unknown guild', { guildId: guild.id });
    } catch (error) {
      this.logger.error('failed to leave unknown guild', { guildId: guild.id, error });
    }
  }

  private async isReplyToBot(message: Message): Promise<boolean> {
    if (!message.reference) return false;
    const botId = this.client.user?.id;
    if (!botId) return false;

    if (message.mentions.repliedUser) {
      return message.mentions.repliedUser.id === botId;
    }

    try {
      const referenced = await message.fetchReference();
      return referenced.author.id === botId;
    } catch (error) {
      this.logger.debug('could not fetch referenced message', {
        messageId: message.id,
        error
      });
      return false;
    }
  }

  private async resolveReplyTarget(message: Message): Promise<ReplyTarget | null> {
    if (!message.reference) return null;

    const repliedUser = message.mentions.repliedUser;
    if (repliedUser) {
      return { authorName: displayName(repliedUser), authorId: repliedUser.id };
    }

    try {
      const referenced = await message.fetchReference();
      return {
        authorName: displayName(referenced.author),
        authorId: referenced.author.id
      };
    } catch {
      return {
        authorName: '未知使用者',
        authorId: message.reference.messageId ?? 'unknown'
      };
    }
  }

  private mediaOf(message: Message): MessageMedia {
    const images = message.attachments.filter(
      (attachment) => attachment.contentType?.startsWith('image/') ?? false
    ).size;
    const files = Math.max(0, message.attachments.size - images);

    return {
      stickers: message.stickers.size,
      images,
      files
    };
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || message.system || !message.inGuild()) return;

    const guildId = message.guildId;
    if (!guildId) return;

    const mentionedBot = this.client.user
      ? message.mentions.users.has(this.client.user.id)
      : false;
    const repliedToBot = await this.isReplyToBot(message);

    const decision = classifyMessage(
      {
        guildId,
        channelId: message.channelId,
        authorIsBot: message.author.bot,
        mentionedBot,
        repliedToBot
      },
      this.config
    );

    if (decision.action === 'ignore') return;

    const replyTo = await this.resolveReplyTarget(message);
    const mentions = new Map<string, string>();
    for (const user of message.mentions.users.values()) {
      mentions.set(user.id, displayName(user));
    }

    const authorName = message.member?.displayName ?? displayName(message.author);
    const text = formatDiscordMessage({
      authorName,
      authorId: message.author.id,
      createdAt: message.createdAt,
      messageId: message.id,
      content: message.content,
      replyTo,
      media: this.mediaOf(message),
      mentions
    });

    const incoming: IncomingDiscordMessage = {
      guildId,
      channelId: message.channelId,
      messageId: message.id,
      authorId: message.author.id,
      authorName,
      createdAt: message.createdAt,
      text,
      replyRequired: decision.replyRequired
    };

    const reply = await this.handler.onMessage(incoming);

    if (!decision.replyRequired) {
      if (typeof reply === 'string' && reply.trim() !== '') {
        this.logger.warn('discarded non-trigger reply', {
          channelId: message.channelId,
          messageId: message.id
        });
      }
      return;
    }

    if (typeof reply !== 'string' || reply.trim() === '') return;

    const channel = message.channel as GuildTextBasedChannel;
    if (!channel.isTextBased()) return;

    await sendReply(this.asSendable(channel), reply, { logger: this.logger });
  }

  private asSendable(channel: GuildTextBasedChannel): SendableChannel {
    return {
      send: (options) => channel.send(options),
      sendTyping: () => channel.sendTyping()
    };
  }
}
