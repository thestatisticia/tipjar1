'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { getUnreadNotificationCount } from '@/lib/notificationState';
import { useDashboardActivity } from '@/hooks/useDashboardActivity';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('ghub-notifications-updated', onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener('ghub-notifications-updated', onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function useNotificationCount(wallet: string | undefined) {
  useDashboardActivity();
  const getSnapshot = useCallback(
    () => wallet ? getUnreadNotificationCount(wallet) : 0,
    [wallet],
  );
  const getServerSnapshot = useCallback(() => 0, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
