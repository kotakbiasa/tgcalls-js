/** Sign in a Telegram user with teleproto QR login and save the session to .env. */

import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import QRCode from 'qrcode';

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH ?? '';
if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
  throw new Error('Fill API_ID and API_HASH in the project-root .env file first.');
}
if (process.env.SESSION) {
  throw new Error('SESSION is already set. Clear SESSION in .env before starting a new QR login.');
}

const session = new StringSession('');
const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
const rl = createInterface({ input: stdin, output: stdout });
const abortController = new AbortController();
process.once('SIGINT', () => abortController.abort());

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const qrPath = fileURLToPath(new URL('../.qr-login.png', import.meta.url));

try {
  await client.connect();
  const user = await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token, expires }) => {
        const loginUrl = `tg://login?token=${token.toString('base64url')}`;
        const secondsLeft = Math.max(0, expires - Math.floor(Date.now() / 1000));
        await QRCode.toFile(qrPath, loginUrl, { width: 480, margin: 2 });
        console.log(`QR image saved to .qr-login.png (about ${secondsLeft}s left).`);
      },
      password: async (hint) => rl.question(
        `2FA password${hint ? ` (${hint})` : ''}: `,
      ),
      onError: async (error) => {
        console.error(`QR login failed: ${error.message}`);
        return true;
      },
      abortSignal: abortController.signal,
    },
  );

  const savedSession = session.save();
  const existingEnv = await readFile(envPath, 'utf8');
  const sessionLine = `SESSION=${JSON.stringify(savedSession)}`;
  const nextEnv = /^SESSION=.*$/m.test(existingEnv)
    ? existingEnv.replace(/^SESSION=.*$/m, sessionLine)
    : `${existingEnv.trimEnd()}\n${sessionLine}\n`;
  await writeFile(envPath, nextEnv, { mode: 0o600 });
  const userLabel = 'firstName' in user && user.firstName
    ? user.firstName
    : 'username' in user && user.username ? user.username : 'Telegram user';
  console.log(`Signed in as ${userLabel}.`);
  console.log('Session saved locally in .env; it was not printed.');
} finally {
  rl.close();
  await client.disconnect();
  await unlink(qrPath).catch(() => undefined);
}
