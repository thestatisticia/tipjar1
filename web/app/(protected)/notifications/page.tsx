'use client';

import { useMemo, useState } from 'react';
import { Bell, Check, Loader2, RotateCw, Settings2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useDashboardActivity } from '@/hooks/useDashboardActivity';
import {
  getNotificationCategories,
  getNotificationPreferences,
  getReadNotificationIds,
  markAllNotificationsRead,
  markNotificationRead,
  setNotificationPreference,
  syncNotifications,
  type NotificationPreferences,
} from '@/lib/notificationState';

const CATEGORY_LABELS = {
  task: 'Task updates',
  campaign: 'Campaign updates',
  tip: 'Tips received or sent',
  spin: 'Daily rewards',
  wallet: 'Wallet transfers',
} as const;

function formatActivityDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusStyle(status: string) {
  const normalized = status.toLowerCase();
  if (['approved', 'paid', 'received', 'sent'].includes(normalized)) return 'bg-success-bg text-success';
  if (['rejected', 'failed'].includes(normalized)) return 'bg-danger-bg text-danger';
  return 'bg-muted text-muted-foreground';
}

export default function NotificationsPage() {
  const { address } = useAccount();
  if (!address) return null;
  return <NotificationsInbox key={address} wallet={address} />;
}

function NotificationsInbox({ wallet }: { wallet: string }) {
  const activityQuery = useDashboardActivity();
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    () => getNotificationPreferences(wallet),
  );
  const [readIds, setReadIds] = useState<string[]>(
    () => getReadNotificationIds(wallet),
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const loadNotifications = async (refresh = false) => {
    const events = await activityQuery.loadActivity(refresh || Boolean(activityQuery.data));
    if (!events) return;
    syncNotifications(wallet, events);
    setReadIds(getReadNotificationIds(wallet));
  };

  const events = useMemo(
    () => (activityQuery.data ?? []).filter((event) => preferences[event.category]),
    [activityQuery.data, preferences],
  );
  const unreadCount = events.filter((event) => !readIds.includes(event.id)).length;

  const handleMarkRead = (id: string) => {
    markNotificationRead(wallet, id);
    setReadIds(getReadNotificationIds(wallet));
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead(wallet);
    setReadIds(getReadNotificationIds(wallet));
  };

  const handlePreferenceChange = (category: keyof NotificationPreferences, enabled: boolean) => {
    setNotificationPreference(wallet, category, enabled);
    setPreferences((current) => ({ ...current, [category]: enabled }));
  };

  return (
    <div className="mx-auto flex max-w-4xl animate-fade-up flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Your account</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">Task, campaign, tip, and reward updates for your connected wallet. No signing required.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadNotifications(true)}
            disabled={activityQuery.isFetching}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RotateCw size={15} className={activityQuery.isFetching ? 'animate-spin' : ''} />
            <span className="max-sm:hidden">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setPreferencesOpen((open) => !open)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-semibold hover:bg-muted"
          >
            <Settings2 size={15} /> Preferences
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              <Check size={15} /> Mark all read
            </button>
          )}
        </div>
      </header>

      {preferencesOpen && (
        <section className="rounded-xl border border-line bg-card p-5">
          <h3 className="font-display text-sm font-bold">Notification preferences</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            These in-app preferences are saved in this browser on this device.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {getNotificationCategories().map((category) => (
              <label key={category} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
                <span>{CATEGORY_LABELS[category]}</span>
                <input
                  type="checkbox"
                  checked={preferences[category]}
                  onChange={(event) => handlePreferenceChange(category, event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {activityQuery.data ? (
        events.length === 0 ? (
          <section className="rounded-xl border border-dashed border-line bg-card p-10 text-center">
            <Bell size={24} className="mx-auto text-muted-foreground" />
            <h3 className="mt-3 font-display text-base font-bold">You&apos;re all caught up</h3>
            <p className="mt-1 text-sm text-muted-foreground">There are no updates in your enabled categories.</p>
          </section>
        ) : (
          <section className="rounded-xl border border-line bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Recent updates</h3>
              <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
            </div>
            <ul className="divide-y divide-line">
              {events.map((event) => {
                const isRead = readIds.includes(event.id);
                return (
                  <li key={event.id} className={`flex gap-3 py-4 first:pt-0 last:pb-0 ${isRead ? 'opacity-70' : ''}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isRead ? 'bg-line' : 'bg-primary'}`} aria-label={isRead ? 'Read' : 'Unread'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{event.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${statusStyle(event.status)}`}>
                          {event.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                      <time dateTime={event.createdAt} className="mt-1 block text-xs text-muted-foreground">
                        {formatActivityDate(event.createdAt)}
                      </time>
                    </div>
                    {!isRead && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(event.id)}
                        className="shrink-0 self-start rounded-md border border-line px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                      >
                        Mark read
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )
      ) : activityQuery.isError ? (
        <section className="rounded-xl border border-line bg-card p-8 text-center">
          <p role="alert" className="text-sm text-danger">
            {activityQuery.error instanceof Error ? activityQuery.error.message : 'Could not load notifications.'}
          </p>
          <button
            type="button"
            onClick={() => void loadNotifications(true)}
            disabled={activityQuery.isFetching}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-50"
          >
            <RotateCw size={15} /> Retry
          </button>
        </section>
      ) : (
        <section className="rounded-xl border border-line bg-card p-8 text-center">
          <Loader2 size={22} className="mx-auto animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Loading your wallet updates…</p>
        </section>
      )}
    </div>
  );
}
