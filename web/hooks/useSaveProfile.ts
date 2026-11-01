'use client';

import { useCreator, type Creator } from '@/providers/CreatorProvider';
import { useRegisterCreator, useIsRegistered } from './useRegisterCreator';

/**
 * Owns the full profile-save flow:
 * 1. registers / updates the username on the TipJarRegistry contract when needed
 * 2. persists the profile to the database
 * 3. refreshes the creator + tips in context
 */
export function useSaveProfile() {
  const { creator, setCreator, setTips, walletAddress } = useCreator();
  const {
    registerCreator,
    updateUsername,
    status: regStatus,
    error: regError,
  } = useRegisterCreator(walletAddress || undefined);
  const { data: isOnChain } = useIsRegistered(walletAddress || undefined);

  const saveProfile = async (updated: Creator): Promise<boolean> => {
    // On-chain step — only when a username is being claimed or changed
    if (updated.username) {
      if (!isOnChain) {
        if (!(await registerCreator(updated.username))) return false;
      } else if (creator.username && updated.username !== creator.username) {
        if (!(await updateUsername(updated.username))) return false;
      }
    }

    // Database step
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updated,
        wallet_address: walletAddress || updated.wallet_address || '',
      }),
    });
    const data = await res.json();
    if (!data.success) return false;

    setCreator(data.profile);
    const tipsRes = await fetch(`/api/tips?username=${data.profile.username}`);
    if (tipsRes.ok) setTips(await tipsRes.json());
    return true;
  };

  return { saveProfile, isOnChain: !!isOnChain, regStatus, regError };
}
