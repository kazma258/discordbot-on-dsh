/** Normalize a Discord name for use inside a DSH session title. */
function clean(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The session title format requested for Discord: `[GuildName]ChannelName`. */
export function formatSessionTitle(
  guildName: string | null | undefined,
  channelName: string | null | undefined,
  guildId: string,
  channelId: string
): string {
  const guild = clean(guildName) || guildId;
  const channel = clean(channelName) || channelId;
  return `[${guild}]${channel}`.slice(0, 200);
}
