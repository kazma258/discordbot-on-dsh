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
import { APPLICATION_EMOJI_NOTES } from './emoji-catalog.js';
import {
  applicationEmojiPrompt,
  buildApplicationEmojiMap,
  renderApplicationEmojis,
  type ApplicationEmojiInfo
} from './emoji.js';
import type { IncomingDiscordMessage, MessageHandler } from './types.js';
import { VideoAnalyzer, type VideoAnalysis } from './video/analyzer.js';
import { VideoJobManager, type VideoJob } from './video/jobs.js';
import { extractVideoLink } from './video/links.js';

function displayName(user: Pick<User, 'globalName' | 'username'>): string {
  return user.globalName ?? user.username;
}

export const TAGGED_SILENT_FALLBACK = '？';

export type DeliveryStatus = 'sent' | 'unsent' | 'failed';

/**
 * Tell the model whether its previous visible reply reached Discord. The
 * assistant message already exists in the session log, so without this
 * receipt a cooldown-suppressed reply looks as if the user saw it.
 */
export function formatDeliveryStatus(
  status: DeliveryStatus | undefined
): string | undefined {
  if (status === 'sent') {
    return '[發送狀態] 上一則回覆已送到 Discord；使用者能看到它。';
  }
  if (status === 'unsent') {
    return '[發送狀態] 上一則回覆沒有送到 Discord（發言冷卻）；使用者沒有看到它。不要假設使用者看過它。';
  }
  if (status === 'failed') {
    return '[發送狀態] 上一則回覆傳送失敗；使用者沒有看到它。';
  }
  return undefined;
}

/**
 * The speech cooldown only suppresses optional replies. Required replies
 * (mentions and replies to the bot) always bypass the cooldown.
 */
export function isOptionalReplyCoolingDown(
  lastSpokenAt: number | undefined,
  now: number,
  cooldownMs: number
): boolean {
  return (
    cooldownMs > 0 &&
    lastSpokenAt !== undefined &&
    now - lastSpokenAt < cooldownMs
  );
}

/**
 * An optional reply is sent whenever the model produced text; an empty/[SILENT]
 * reply stays silent. A required (tag/reply) turn always produces something,
 * falling back to a minimal acknowledgement if the model stayed silent.
 */
export function outboundReply(
  reply: string | null,
  replyRequired: boolean
): string | null {
  const text = typeof reply === 'string' ? reply.trim() : '';
  if (text !== '') return text;
  return replyRequired ? TAGGED_SILENT_FALLBACK : null;
}

export class DiscordBridge {
  private readonly client: Client;
  private readonly lastSpokenAt = new Map<string, number>();
  private readonly deliveryStatus = new Map<string, DeliveryStatus>();
  private applicationEmojis = new Map<string, ApplicationEmojiInfo>();
  private applicationEmojiPromptText?: string;
  private readonly videoJobs?: VideoJobManager;
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
    const video = config.videoJobs;
    if (video !== undefined) {
      this.videoJobs = new VideoJobManager({
        analyzer: new VideoAnalyzer({
          packageSpec: video.packageSpec,
          cacheDir: video.cacheDir,
          binDir: video.binDir,
          cookiesFile: video.cookiesFile,
          jobsDir: video.jobsDir,
          logger,
          maxFrames: video.maxFrames,
          timeoutMs: video.timeoutMs,
          maxDurationSec: video.maxDurationSec,
          maxEvidenceChars: video.maxEvidenceChars,
          ocrLanguage: video.ocrLanguage
        }),
        logger,
        maxConcurrent: video.maxConcurrent,
        maxQueue: video.maxQueue,
        onComplete: (job, result) => this.deliverVideoResult(job, result)
      });
    }

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
      void this.loadApplicationEmojis();
      void this.registerCommandsForAllGuilds();
    });
  }

  async start(): Promise<void> {
    await this.client.login(this.config.discordToken);
  }

  private async loadApplicationEmojis(): Promise<void> {
    try {
      const application = this.client.application;
      if (!application) return;
      const fetched = await application.emojis.fetch();
      this.applicationEmojis = buildApplicationEmojiMap(fetched.values(), APPLICATION_EMOJI_NOTES);
      this.applicationEmojiPromptText = applicationEmojiPrompt(this.applicationEmojis);
      this.logger.info('loaded application emojis', {
        count: this.applicationEmojis.size,
        described: [...this.applicationEmojis.values()].filter((emoji) => emoji.localNote).length
      });
    } catch (error) {
      this.logger.warn('failed to load application emojis', { error });
    }
  }

  async stop(): Promise<void> {
    this.videoJobs?.dispose();
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
    const videos = message.attachments
      .filter((attachment) => attachment.contentType?.startsWith('video/') ?? false)
      .map((attachment) => attachment.url);
    const files = Math.max(0, message.attachments.size - images - videos.length);

    return {
      stickers: message.stickers.size,
      images,
      videos,
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

    const videoAttachment = message.attachments.find(
      (attachment) => attachment.contentType?.startsWith('video/') ?? false
    );
    const videoLink =
      extractVideoLink(message.content) ??
      (videoAttachment ? { site: 'direct' as const, url: videoAttachment.url } : null);
    if (videoLink !== null && this.videoJobs !== undefined) {
      const outcome = this.videoJobs.enqueue({
        id: message.id,
        message,
        link: videoLink,
        normalizedText: text,
        originalContent: message.content,
        authorName,
        guildName,
        channelName,
        createdAt: message.createdAt
      });
      if (outcome === 'queued') {
        this.logger.info('video message moved to background analysis', {
          channelId: message.channelId,
          messageId: message.id,
          site: videoLink.site
        });
        void message.react('👀').catch((error: unknown) => {
          this.logger.debug('could not add video reaction', { messageId: message.id, error });
        });
      } else if (outcome === 'full') {
        await this.replyVideoQueueFull(message);
      } else {
        this.logger.debug('duplicate video message ignored', { messageId: message.id });
      }
      return;
    }

    const coolingDown =
      !decision.replyRequired &&
      isOptionalReplyCoolingDown(
        this.lastSpokenAt.get(message.channelId),
        Date.now(),
        this.config.speechCooldownMs
      );
    const deliveryNote = formatDeliveryStatus(this.deliveryStatus.get(message.channelId));
    this.deliveryStatus.delete(message.channelId);
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
      replyRequired: decision.replyRequired,
      cooldownActive: coolingDown,
      ...(deliveryNote ? { deliveryNote } : {}),
      ...(this.applicationEmojiPromptText
        ? { emojiPrompt: this.applicationEmojiPromptText }
        : {})
    };

    const reply = await this.handler.onMessage(incoming);
    const outbound = outboundReply(reply, decision.replyRequired);
    if (outbound === null) return;
    const rendered = renderApplicationEmojis(outbound, this.applicationEmojis);

    if (decision.replyRequired && (typeof reply !== 'string' || reply.trim() === '')) {
      this.logger.warn('tagged message produced no reply; sending fallback', {
        channelId: message.channelId,
        messageId: message.id
      });
    }

    const channel = message.channel as GuildTextBasedChannel;
    if (!channel.isTextBased()) return;

    if (coolingDown) {
      this.deliveryStatus.set(message.channelId, 'unsent');
      this.logger.info('suppressed optional reply by speech cooldown', {
        channelId: message.channelId,
        messageId: message.id,
        cooldownMs: this.config.speechCooldownMs
      });
      return;
    }

    try {
      await sendReply(this.asSendable(channel), rendered, {
        logger: this.logger
      });
    } catch (error) {
      this.deliveryStatus.set(message.channelId, 'failed');
      throw error;
    }
    this.lastSpokenAt.set(message.channelId, Date.now());
    this.deliveryStatus.set(message.channelId, 'sent');
  }

  private async replyVideoQueueFull(message: Message): Promise<void> {
    const channel = message.channel as GuildTextBasedChannel;
    if (!channel.isTextBased()) return;
    try {
      await sendReply(this.asSendable(channel), '影片分析排隊已滿，請稍後再貼一次。', {
        logger: this.logger,
        replyToMessageId: message.id
      });
    } catch (error) {
      this.logger.warn('failed to report full video queue', {
        channelId: message.channelId,
        messageId: message.id,
        error
      });
    }
  }

  private async deliverVideoResult(job: VideoJob, result: VideoAnalysis): Promise<void> {
    if (!this.access.isEnabled(job.message.channelId)) {
      this.logger.debug('video result skipped; channel access disabled', {
        channelId: job.message.channelId,
        messageId: job.id
      });
      return;
    }

    const channel = job.message.channel as GuildTextBasedChannel;
    if (!channel.isTextBased()) return;

    const original = job.originalContent.replace(/https?:\/\/\S+/gi, '[影片連結]').trim();
    const body = result.ok
      ? result.evidenceText
      : `[影片分析失敗] ${result.error ?? '未知錯誤'}`;
    const prompt = [
      '[影片分析完成] 使用者剛剛貼的影片已在背景分析完成。',
      `原始訊息：${original === '' ? '(只有影片連結)' : original}`,
      body,
      '請用你的角色回覆這位使用者；用 [mm:ss] 標出時間；不要提到背景工作、工具、下載或分析流程。'
    ].join('\n');

    const imageParts = result.frames.map((frame) => ({
      type: 'image' as const,
      mediaType: frame.mediaType,
      data: frame.data,
      name: frame.name
    }));
    const incoming: IncomingDiscordMessage = {
      guildId: job.message.guildId ?? '',
      guildName: job.guildName,
      channelId: job.message.channelId,
      channelName: job.channelName,
      messageId: `${job.id}:video`,
      authorId: job.message.author.id,
      authorName: job.authorName,
      createdAt: job.createdAt,
      text: prompt,
      replyRequired: true,
      cooldownActive: false,
      ...(this.applicationEmojiPromptText
        ? { emojiPrompt: this.applicationEmojiPromptText }
        : {}),
      ...(imageParts.length > 0 ? { imageParts } : {})
    };

    let reply: string | null = null;
    try {
      reply = await this.handler.onMessage(incoming);
    } catch (error) {
      this.logger.warn('video completion prompt failed', { messageId: job.id, error });
      if (imageParts.length > 0) {
        try {
          reply = await this.handler.onMessage({ ...incoming, imageParts: undefined });
        } catch (retryError) {
          this.logger.error('video completion text-only retry failed', {
            messageId: job.id,
            error: retryError
          });
        }
      }
    }

    const text =
      typeof reply === 'string' && reply.trim() !== ''
        ? reply.trim()
        : '影片分析完成，但這次沒有整理出內容。';
    const rendered = renderApplicationEmojis(text, this.applicationEmojis);

    try {
      await sendReply(this.asSendable(channel), rendered, {
        logger: this.logger,
        replyToMessageId: job.message.id
      });
      this.lastSpokenAt.set(job.message.channelId, Date.now());
      this.deliveryStatus.set(job.message.channelId, 'sent');
      this.logger.info('video result delivered', {
        messageId: job.id,
        channelId: job.message.channelId,
        frames: imageParts.length,
        chars: rendered.length
      });
    } catch (error) {
      this.deliveryStatus.set(job.message.channelId, 'failed');
      this.logger.error('failed to deliver video result', {
        messageId: job.id,
        channelId: job.message.channelId,
        error
      });
    }
  }

  private asSendable(channel: GuildTextBasedChannel): SendableChannel {
    return {
      send: (options) => channel.send(options),
      sendTyping: () => channel.sendTyping()
    };
  }
}
