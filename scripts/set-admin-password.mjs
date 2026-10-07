/**
 * Устанавливает пароль администратора (admin@tver-ryadom.ru) в D1.
 *
 *   node scripts/set-admin-password.mjs            # спросит пароль без эха
 *   node scripts/set-admin-password.mjs --remote   # продакшен
 *
 * Пароль больше не принимается аргументом: он светился в history и `ps`.
 * Формат хеша совпадает с apps/api/src/lib/crypto.ts (PBKDF2-SHA256).
 */
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const remote = process.argv.includes('--remote');
if (process.argv[2] && !process.argv[2].startsWith('--')) {
  console.error('Пароль аргументом больше не принимается (светится в history/ps). Запустите без аргументов.');
  process.exit(1);
}

function askPassword(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Глушим эхо ввода: вместо символов рисуем звёздочки.
    rl._writeToOutput = (chunk) => {
      const s = String(chunk);
      if (s === '\n' || s === '\r' || s === '\r\n') rl.output.write(s);
      else if (s.startsWith(prompt)) rl.output.write(s);
      else rl.output.write('*');
    };
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const password = await askPassword('Новый пароль администратора (мин. 12 символов): ');
if (!password || password.length < 12) {
  console.error('Пароль должен быть не короче 12 символов.');
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

// Без shell: аргументы массивом, инъекции через хеш невозможны в принципе.
const result = spawnSync(
  'pnpm',
  ['exec', 'wrangler', 'd1', 'execute', 'DB', ...(remote ? ['--remote'] : ['--local']), '--command', command],
  { cwd: apiDir, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`\nПароль администратора обновлён (${remote ? 'remote' : 'local'} база).`);
