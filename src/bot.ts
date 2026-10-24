import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  Client,
  Events,
  GatewayIntentBits,
  type Guild,
  type GuildTextBasedChannel,
  type Interaction,
  type Message,
  type User
} from 'discord.js';

import type { ChannelAccessStore } from './access.js';
import {
  ACCESS_COMMAND_NAMES,
  buildAccessCommand,
  isAdministrator,
  resolveAccessMode
} from './commands.js';
import type { DiscordPluginConfig } from './config.js';
import type { Logger } from './logger.js';
import {
  formatDiscordMessage,
  type MessageMedia,
  type ReplyTarget
} from './normalize.js';
import { classifyMessage } from './policy.js';
import { sendReply, type SendableChannel } from './sender.js';
import type { IncomingDiscordMessage, MessageHandler } from './types.js';

function displayName(user: Pick<User, 'globalName' | 'username'>): string {
  return user.globalName ?? user.username;
}

export const TAGGED_SILENT_FALLBACK = '？';

/**
 * A tag must always produce something visible. If the model chose [SILENT]
 * (removed by cleanDshReply) or returned nothing, fall back to a minimal
 * in-character acknowledgement instead of silently ignoring the tag.
 */
export function outboundReplyForTagged(reply: string | null): string {
  const text = typeof reply === 'string' ? reply.trim() : '';
  return text === '' ? TAGGED_SILENT_FALLBACK : text;
}

export class DiscordBridge {
  private readonly client: Client;
  private readonly commandStatus: Record<
    string,
    { at: string; commands: Record<string, { status: string; error?: string }> }
  > = {};

  constructor(
    private readonly config: DiscordPluginConfig,
    private readonly handler: MessageHandler,
    private readonly access: ChannelAccessStore,
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
      void this.registerCommands(guild);
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.handleInteraction(interaction).catch((error) => {
        this.logger.error('interaction handling failed', { error });
      });
    });

    this.client.on(Events.Error, (error) => {
      this.logger.error('Discord client error', { error });
    });

    this.client.once(Events.ClientReady, (client) => {
      this.logger.info('Discord connected', { user: client.user.tag });
      void this.registerCommandsForAllGuilds();
    });
  }

  async start(): Promise<void> {
    await this.client.login(this.config.discordToken);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  private async registerCommandsForAllGuilds(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      await this.registerCommands(guild);
    }
  }

  private async registerCommands(guild: Guild): Promise<void> {
    try {
      const existing = await guild.commands.fetch();
      for (const name of ACCESS_COMMAND_NAMES) {
        if (existing.some((command) => command.name === name)) {
          this.recordCommandStatus(guild.id, name, 'existing');
          continue;
        }
        try {
          await guild.commands.create(buildAccessCommand(name));
          this.recordCommandStatus(guild.id, name, 'created');
          this.logger.info('registered Discord access command', {
            guildId: guild.id,
            name
          });
        } catch (error) {
          this.recordCommandStatus(guild.id, name, 'error', error);
          this.logger.warn('failed to register Discord access command', {
            guildId: guild.id,
            name,
            error
          });
        }
      }
    } catch (error) {
      this.recordCommandStatus(guild.id, '*', 'fetch-error', error);
      this.logger.warn('failed to inspect guild commands', {
        guildId: guild.id,
        error
      });
    }
  }

  private recordCommandStatus(
    guildId: string,
    name: string,
    status: string,
    error?: unknown
  ): void {
    const path = this.config.commandStatusPath;
    if (!path) return;
    const entry = this.commandStatus[guildId] ?? { at: '', commands: {} };
    entry.at = new Date().toISOString();
    entry.commands[name] = {
      status,
      ...(error === undefined
        ? {}
        : { error: error instanceof Error ? error.message : String(error) })
    };
    this.commandStatus[guildId] = entry;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({ at: new Date().toISOString(), guilds: this.commandStatus }, null, 2) +
          '\n',
        { encoding: 'utf8', mode: 0o600 }
      );
    } catch {
      // Diagnostics must never affect Discord handling.
    }
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    if (!(ACCESS_COMMAND_NAMES as readonly string[]).includes(interaction.commandName)) {
      return;
    }
    if (!interaction.inGuild() || !interaction.channelId) {
      await interaction.reply({ content: '這個指令只能在伺服器頻道使用。', ephemeral: true });
      return;
    }
    if (!isAdministrator(interaction.memberPermissions)) {
      await interaction.reply({ content: '只有管理員可以切換讀取權限。', ephemeral: true });
      return;
    }
    const mode = resolveAccessMode(interaction.options.getString('mode'));
    if (mode === null) {
      await interaction.reply({ content: 'mode 只能是 on 或 off。', ephemeral: true });
      return;
    }
    this.access.setEnabled(interaction.channelId, mode === 'on');
    await interaction.reply({
      content: mode === 'on' ? '已開啟此頻道的讀取。' : '已關閉此頻道的讀取。',
      ephemeral: true
    });
    this.logger.info('channel access changed', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      mode,
      userId: interaction.user.id
    });
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

    if (!this.access.isEnabled(message.channelId)) return;

    const botId = this.client.user?.id;
    const mentionedBot = botId
      ? message.mentions.users.has(botId) ||
        new RegExp(`<@!?${botId}>`).test(message.content)
      : false;
    const repliedToBot = await this.isReplyToBot(message);
    const guildName = message.guild?.name ?? guildId;
    const channelName =
      'name' in message.channel && typeof message.channel.name === 'string'
        ? message.channel.name
        : message.channelId;

    const decision = classifyMessage({
      guildId,
      channelId: message.channelId,
      authorIsBot: message.author.bot,
      mentionedBot,
      repliedToBot,
      accessEnabled: true
    });

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
      guildName,
      channelId: message.channelId,
      channelName,
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

    const channel = message.channel as GuildTextBasedChannel;
    if (!channel.isTextBased()) return;

    if (typeof reply !== 'string' || reply.trim() === '') {
      this.logger.warn('tagged message produced no reply; sending fallback', {
        channelId: message.channelId,
        messageId: message.id
      });
    }
    await sendReply(this.asSendable(channel), outboundReplyForTagged(reply), {
      logger: this.logger
    });
  }

  private asSendable(channel: GuildTextBasedChannel): SendableChannel {
    return {
      send: (options) => channel.send(options),
      sendTyping: () => channel.sendTyping()
    };
  }
}
