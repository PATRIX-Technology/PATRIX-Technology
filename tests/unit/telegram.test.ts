import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTelegramMessage } from '@/lib/notifications/telegram';

describe('sendTelegramMessage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is a no-op when the bot token/chat id are not configured', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_CHAT_ID', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('hello');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the Telegram Bot API with the configured token and chat id', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('New story idea suggestion');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '12345', text: 'New story idea suggestion' }),
      }),
    );
  });

  it('swallows a failed send instead of throwing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(sendTelegramMessage('hello')).resolves.toBeUndefined();
  });
});
