export const SILENT_TOKEN = '[SILENT]';

export function formatDshPrompt(
  normalizedMessage: string,
  replyRequired: boolean,
  cooldownActive = false,
  deliveryNote?: string,
  emojiNames?: readonly string[]
): string {
  const marker = replyRequired
    ? '[需回覆]'
    : cooldownActive
      ? '[冷卻]'
      : '[可回覆]';
  const note = deliveryNote === undefined ? '' : `\n${deliveryNote}`;
  const emojiNote =
    emojiNames !== undefined && emojiNames.length > 0
      ? `\n[可用應用表情] ${emojiNames.map((name) => `:${name}:`).join(' ')}`
      : '';
  return `${marker} ${normalizedMessage}${note}${emojiNote}`;
}

/**
 * `[SILENT]` is the model's way of saying "I read it but choose not to reply".
 * Remove it; an empty result means no Discord message for optional replies.
 */
export function cleanDshReply(text: string): string | null {
  const cleaned = text.replaceAll(SILENT_TOKEN, '').trim();
  return cleaned === '' ? null : cleaned;
}
