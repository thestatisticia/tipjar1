'use client';

import { getAddress } from 'viem';
import { useAccount, useSignMessage } from 'wagmi';
import { useCallback } from 'react';
import { taskSignatureMessage } from '@/lib/taskMessages';

export function useTaskSignature() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  return useCallback(async (method: string, path: string, payload: unknown) => {
    if (!address) throw new Error('Connect your wallet first.');
    const auth = {
      address: getAddress(address),
      nonce: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
    };
    const signature = await signMessageAsync({
      message: taskSignatureMessage(method, path, auth, payload),
    });
    return { ...auth, signature };
  }, [address, signMessageAsync]);
}
