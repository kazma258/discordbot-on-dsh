export const SILENT_TOKEN = '[SILENT]';

export function formatDshPrompt(normalizedMessage: string, replyRequired: boolean): string {
  const marker = replyRequired ? '[需回覆]' : '[僅記錄]';
  return `${marker} ${normalizedMessage}`;
}

/**
 * `[SILENT]` is the model's way of saying "I read it but have nothing to say".
 * Remove it; if the remaining text is empty, the bridge sends nothing.
 */
export function cleanDshReply(text: string): string | null {
  const cleaned = text.replaceAll(SILENT_TOKEN, '').trim();
  return cleaned === '' ? null : cleaned;
}
