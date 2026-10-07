'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { Card, Loading } from '@/components/ui';

/**
 * Каналы общения: ВКонтакте и MAX.
 *
 * Telegram настраивается в своём блоке выше — там есть кнопка подключения.
 * Здесь два канала, которым нужны значения из чужих кабинетов: строка
 * подтверждения ВК и адрес API у MAX. Токены при этом остаются секретами
 * Cloudflare и через форму не проходят.
 */

interface Channels {
  vk: { tokenSet: boolean; confirmation: string | null; secretSet: boolean };
  max: { tokenSet: boolean; apiBase: string | null; sendMethod: string; secretSet: boolean; ready: boolean };
}

function Status({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <span className={ok ? 'text-ink' : 'text-danger'}>{ok ? yes : no}</span>;
}

export function ChannelsSetup({ apiOrigin }: { apiOrigin: string }) {
  const queryClient = useQueryClient();
  const channels = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () => authFetch<Channels>('/admin/channels'),
  });

  const [vk, setVk] = useState({ confirmation: '', secret: '' });
  const [max, setMax] = useState({ apiBase: '', sendMethod: '', secret: '' });

  useEffect(() => {
    if (!channels.data) return;
    setVk((v) => ({ ...v, confirmation: channels.data.vk.confirmation ?? '' }));
    setMax((v) => ({
      ...v,
      apiBase: channels.data.max.apiBase ?? '',
      sendMethod: channels.data.max.sendMethod ?? 'sendMessage',
    }));
  }, [channels.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-channels'] });

  const saveVk = useMutation({
    mutationFn: () =>
      authFetch('/admin/channels/vk', { method: 'PUT', body: JSON.stringify(vk) }),
    onSuccess: refresh,
  });
  const saveMax = useMutation({
    mutationFn: () =>
      authFetch('/admin/channels/max', { method: 'PUT', body: JSON.stringify(max) }),
    onSuccess: refresh,
  });

  const error = [saveVk.error, saveMax.error].find(Boolean);

  if (channels.isLoading || !channels.data) {
    return (
      <Card title="ВКонтакте и MAX">
        <Loading />
      </Card>
    );
  }

  return (
    <Card title="ВКонтакте и MAX">
      <p className="text-muted text-sm leading-relaxed">
        Данные людей общие для всех каналов: одна учётная запись хранит профиль, брони и избранное,
        какой бы мессенджер человек ни открыл. Привязка происходит по той же ссылке из личного
        кабинета, что и для Telegram.
      </p>

      {error ? (
        <p className="text-danger mt-3 text-sm">
          {error instanceof ApiRequestError ? error.message : 'Не удалось сохранить'}
        </p>
      ) : null}

      {/* ── ВКонтакте ── */}
      <div className="border-line mt-6 border-t pt-5">
        <p className="text-ink text-sm">
          ВКонтакте —{' '}
          <Status ok={channels.data.vk.tokenSet} yes="токен задан" no="токен сообщества не задан" />
        </p>

        {!channels.data.vk.tokenSet ? (
          <pre className="bg-surface-soft mt-3 overflow-x-auto p-3 text-xs">
            pnpm --filter @tver/api exec wrangler secret put VK_GROUP_TOKEN
          </pre>
        ) : null}

        <p className="text-muted mt-3 text-xs leading-relaxed">
          В настройках сообщества → «Работа с API» → Callback API укажите адрес{' '}
          <code className="text-ink">{apiOrigin}/webhook/vk</code>, задайте там же секретный
          ключ и скопируйте строку подтверждения — те же значения впишите сюда. Без
          секрета вебхук отклоняет все запросы.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-muted mb-1 block text-xs">Строка подтверждения</span>
            <input
              value={vk.confirmation}
              onChange={(e) => setVk({ ...vk, confirmation: e.target.value })}
              className="input"
              placeholder="например, a1b2c3d4"
            />
          </label>
          <label className="block">
            <span className="text-muted mb-1 block text-xs">
              Секретный ключ {channels.data.vk.secretSet ? '(уже сохранён)' : ''}
            </span>
            <input
              value={vk.secret}
              onChange={(e) => setVk({ ...vk, secret: e.target.value })}
              className="input"
              placeholder="оставьте пустым, чтобы не менять"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => saveVk.mutate()}
          disabled={saveVk.isPending}
          className="btn-secondary mt-3"
        >
          {saveVk.isPending ? 'Сохраняем…' : 'Сохранить ВКонтакте'}
        </button>
      </div>

      {/* ── MAX ── */}
      <div className="border-line mt-6 border-t pt-5">
        <p className="text-ink text-sm">
          MAX — <Status ok={channels.data.max.ready} yes="готов к работе" no="не настроен" />
        </p>

        <p className="text-muted mt-3 text-xs leading-relaxed">
          Приём сообщений, разбор кнопок и учётные записи уже работают — не хватает только адреса
          API. Я не стал зашивать его в код, не сверившись с документацией: угадывать чужой протокол
          хуже, чем подождать проверки. Впишите адрес, и канал оживёт без правок кода.
        </p>

        {!channels.data.max.tokenSet ? (
          <pre className="bg-surface-soft mt-3 overflow-x-auto p-3 text-xs">
            pnpm --filter @tver/api exec wrangler secret put MAX_BOT_TOKEN
          </pre>
        ) : null}

        <p className="text-muted mt-3 text-xs leading-relaxed">
          Адрес вебхука для настроек бота: <code className="text-ink">{apiOrigin}/webhook/max</code>
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-muted mb-1 block text-xs">База API</span>
            <input
              value={max.apiBase}
              onChange={(e) => setMax({ ...max, apiBase: e.target.value })}
              className="input"
              placeholder="https://…"
            />
          </label>
          <label className="block">
            <span className="text-muted mb-1 block text-xs">Метод отправки</span>
            <input
              value={max.sendMethod}
              onChange={(e) => setMax({ ...max, sendMethod: e.target.value })}
              className="input"
              placeholder="sendMessage"
            />
          </label>
          <label className="block">
            <span className="text-muted mb-1 block text-xs">
              Секрет {channels.data.max.secretSet ? '(сохранён)' : ''}
            </span>
            <input
              value={max.secret}
              onChange={(e) => setMax({ ...max, secret: e.target.value })}
              className="input"
              placeholder="оставьте пустым"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => saveMax.mutate()}
          disabled={saveMax.isPending}
          className="btn-secondary mt-3"
        >
          {saveMax.isPending ? 'Сохраняем…' : 'Сохранить MAX'}
        </button>
      </div>
    </Card>
  );
}
