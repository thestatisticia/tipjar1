'use client';

import { useState } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';
import {
  TIPJAR_REGISTRY_ADDRESS,
  TIPJAR_REGISTRY_ABI,
  G_DOLLAR_ADDRESS,
  ERC20_ABI,
} from '@/lib/contracts';

export type TipStatus =
  | 'idle'
  | 'approving'
  | 'approved'
  | 'sending'
  | 'success'
  | 'error';

interface UseSendTipResult {
  sendTip: (params: {
    creatorUsername: string;
    amountG$: number;
    message: string;
  }) => Promise<{ txHash: `0x${string}`; senderAddress: `0x${string}` } | null>;
  status: TipStatus;
  txHash: `0x${string}` | null;
  error: string | null;
  reset: () => void;
}

export function useSendTip(): UseSendTipResult {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<TipStatus>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStatus('idle');
    setTxHash(null);
    setError(null);
  };

  const sendTip = async ({
    creatorUsername,
    amountG$,
    message,
  }: {
    creatorUsername: string;
    amountG$: number;
    message: string;
  }): Promise<{ txHash: `0x${string}`; senderAddress: `0x${string}` } | null> => {
    if (!walletClient || !publicClient) {
      setError('Wallet not connected');
      setStatus('error');
      return null;
    }

    try {
      const amount = parseUnits(amountG$.toString(), 18);
      const [account] = await walletClient.getAddresses();

      // Step 1: Check current allowance
      const allowance = await publicClient.readContract({
        address: G_DOLLAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account, TIPJAR_REGISTRY_ADDRESS],
      });

      // Step 2: Approve if needed
      if (allowance < amount) {
        setStatus('approving');
        const approveTx = await walletClient.writeContract({
          address: G_DOLLAR_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [TIPJAR_REGISTRY_ADDRESS, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        setStatus('approved');
      }

      // Step 3: Send the tip
      setStatus('sending');
      const tipTx = await walletClient.writeContract({
        address: TIPJAR_REGISTRY_ADDRESS,
        abi: TIPJAR_REGISTRY_ABI,
        functionName: 'sendTip',
        args: [creatorUsername, amount, message],
      });
      await publicClient.waitForTransactionReceipt({ hash: tipTx });

      setTxHash(tipTx);
      setStatus('success');
      return { txHash: tipTx, senderAddress: account };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      // Surface friendly errors
      const friendly = msg.includes('User rejected')
        ? 'Transaction rejected'
        : msg.includes('insufficient')
        ? 'Insufficient G$ balance'
        : 'Transaction failed — please try again';
      setError(friendly);
      setStatus('error');
      return null;
    }
  };

  return { sendTip, status, txHash, error, reset };
}
