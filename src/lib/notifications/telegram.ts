import 'server-only';

/**
 * Sends a message via the Telegram Bot API — see docs/DECISIONS.md
 * "Telegram notifications for story suggestions" for why Telegram over
 * a WhatsApp Business API integration: free forever (no per-message
 * cost, no business account or verification), and setup is a 5-minute
 * chat with @BotFather rather than a founder-side vendor onboarding.
 *
 * Silently a no-op if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set
 * yet, and swallows any send failure — a notification is a
 * nice-to-have on top of an already-saved database row, never a
 * reason to fail the action that triggered it.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Best-effort — see module comment above.
  }
}
