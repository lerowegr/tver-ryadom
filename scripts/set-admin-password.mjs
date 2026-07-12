/**
 * Устанавливает пароль администратора (admin@tver-ryadom.ru) в D1.
 *
 *   node scripts/set-admin-password.mjs <пароль>            # локальная база
 *   node scripts/set-admin-password.mjs <пароль> --remote   # продакшен
 *
 * Формат хеша совпадает с apps/api/src/lib/crypto.ts (PBKDF2-SHA256).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const password = process.argv[2];
const remote = process.argv.includes('--remote');

if (!password || password.length < 8) {
  console.error('Использование: node scripts/set-admin-password.mjs <пароль от 8 символов> [--remote]');
  process.exit(1);
}

const ITERATIONS = 100_000;

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
  key,
  256,
);

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hash = `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api');
const command = `UPDATE users SET password_hash='${hash}', updated_at=unixepoch() WHERE email='admin@tver-ryadom.ru';`;

execSync(
  `pnpm exec wrangler d1 execute DB ${remote ? '--remote' : '--local'} --command "${command}"`,
  { cwd: apiDir, stdio: 'inherit' },
);

console.log(`\nПароль администратора обновлён (${remote ? 'remote' : 'local'} база).`);
