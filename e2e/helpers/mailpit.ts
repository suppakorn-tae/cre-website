import { MAILPIT_URL } from './env';

type Message = { ID: string };

/** Poll Mailpit for the newest message to `email` and return its 6-digit OTP. */
export async function readOtp(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const q = encodeURIComponent(`to:${email}`);
    const list = await fetch(`${MAILPIT_URL}/api/v1/search?query=${q}`);
    const { messages } = (await list.json()) as { messages: Message[] };
    const newest = messages[0]; // Mailpit lists newest first.
    if (newest) {
      const res = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
      const { Text } = (await res.json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no OTP e-mail for ${email} within ${timeoutMs} ms`);
}

/** Delete the messages to `email` so the next readOtp sees only fresh mail. */
export async function clearMail(email: string): Promise<void> {
  const q = encodeURIComponent(`to:${email}`);
  await fetch(`${MAILPIT_URL}/api/v1/search?query=${q}`, { method: 'DELETE' });
}
