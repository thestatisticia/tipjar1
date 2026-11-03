'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { syncNotifications } from '@/lib/notificationState';

export type ActivityCategory = 'task' | 'campaign' | 'tip' | 'spin' | 'wallet';

export interface DashboardActivityEvent {
  id: string;
  category: ActivityCategory;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  amount?: string;
  transactionHash?: string | null;
}

async function parseResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not load your activity.');
  return result as DashboardActivityEvent[];
}

export function useDashboardActivity() {
  const { address } = useAccount();
  const query = useQuery({
    queryKey: ['dashboard-activity', address],
    enabled: Boolean(address),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!address) throw new Error('Connect your wallet to view activity.');
      return parseResponse(await fetch(
        `/api/dashboard/activity?wallet=${encodeURIComponent(address)}`,
        { cache: 'no-store' },
      ));
    },
  });
  const { data, refetch } = query;

  useEffect(() => {
    if (address && data) syncNotifications(address, data);
  }, [address, data]);

  useEffect(() => {
    const refreshActivity = () => {
      void refetch();
    };
    window.addEventListener('ghub-activity-updated', refreshActivity);
    return () => window.removeEventListener('ghub-activity-updated', refreshActivity);
  }, [refetch]);

  const loadActivity = async (refresh = false) => {
    if (query.data && !refresh) return query.data;
    const result = await query.refetch();
    return result.data;
  };

  return { ...query, loadActivity };
}
