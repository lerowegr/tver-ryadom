'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, authFetch } from '@/lib/api';
import { Card, Loading } from '@/components/ui';

/**
 * Подключение Telegram-бота.
 *
 * Регистрация вебхука и меню команд делается отсюда, а не руками: токен при
 * этом остаётся секретом Cloudflare и наружу не выходит ни разу. Раньше
 * вебхук не регистрировался нигде — бот молчал бы даже с верным токеном.
 */

interface BotStatus {
  tokenSet: boolean;
  username: string | null;
  webhookUrl: string | null;
  pendingUpdates: number | null;
  lastError: string | null;
}

export function TelegramSetup() {
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ['admin-telegram'],
    queryFn: () => authFetch<BotStatus>('/admin/telegram'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-telegram'] });

  const connect = useMutation({
    mutationFn: () => authFetch<BotStatus>('/admin/telegram/setup', { method: 'POST' }),
    onSuccess: refresh,
  });

  const disconnect = useMutation({
    mutationFn: () => authFetch<BotStatus>('/admin/telegram/disable', { method: 'POST' }),
    onSuccess: refresh,
  });

  const error = [connect.error, disconnect.error].find(Boolean);
  const data = status.data;
  const live = Boolean(data?.webhookUrl);

  return (
    <Card title="Telegram-бот">
      {status.isLoading || !data ? (
        <Loading />
      ) : !data.tokenSet ? (
        <div className="space-y-3">
          <p className="text-muted text-sm leading-relaxed">
            Токен бота не задан — бот выключен. Создайте бота у @BotFather и положите токен в
            секреты Cloudflare. Присылать его кому-либо в переписке не нужно.
          </p>
          <pre className="bg-surface-soft overflow-x-auto p-3 text-xs">
            pnpm --filter @tver/api exec wrangler secret put TELEGRAM_BOT_TOKEN
          </pre>
          <p className="text-faint text-xs leading-relaxed">
            После этого вернитесь сюда и нажмите «Подключить»: имя бота, адрес вебхука и меню
            команд заполнятся сами.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Состояние</dt>
            <dd className={live ? 'text-ink' : 'text-danger'}>
              {live ? 'Подключён и принимает сообщения' : 'Токен есть, но вебхук не зарегистрирован'}
            </dd>

            <dt className="text-muted">Имя бота</dt>
            <dd className="text-ink">{data.username ? `@${data.username}` : 'станет известно после подключения'}</dd>

            {data.webhookUrl ? (
              <>
                <dt className="text-muted">Вебхук</dt>
                {/* Адрес содержит секрет, поэтому показываем только начало. */}
                <dd className="text-ink truncate">{data.webhookUrl.replace(/\/[0-9a-f]{16,}$/, '/…')}</dd>
              </>
            ) : null}

            {data.pendingUpdates ? (
              <>
                <dt className="text-muted">В очереди</dt>
                <dd className="text-ink">{data.pendingUpdates} необработанных сообщений</dd>
              </>
            ) : null}

            {data.lastError ? (
              <>
                <dt className="text-muted">Последняя ошибка</dt>
                <dd className="text-danger">{data.lastError}</dd>
              </>
            ) : null}
          </dl>

          {error ? (
            <p className="text-danger text-sm">
              {error instanceof ApiRequestError ? error.message : 'Не удалось связаться с Telegram'}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="btn-primary"
            >
              {connect.isPending ? 'Подключаем…' : live ? 'Переподключить' : 'Подключить'}
            </button>
            {live ? (
              <button
                type="button"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className="btn-danger"
              >
                {disconnect.isPending ? 'Отключаем…' : 'Отключить'}
              </button>
            ) : null}
          </div>

          <p className="text-faint text-xs leading-relaxed">
            «Подключить» заново регистрирует вебхук и обновляет меню команд. Накопившиеся за время
            простоя сообщения при этом отбрасываются — отвечать на них поздно.
          </p>
        </div>
      )}
    </Card>
  );
}
