'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { G_DOLLAR_ADDRESS, ERC20_ABI } from '@/lib/contracts';

/**
 * Live G$ balance for a wallet, refreshed every 15s.
 */
export function useGDollarBalance(address?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContract({
    address: G_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
    },
  });

  const balance = data !== undefined ? Number(formatUnits(data, 18)) : null;

  return { balance, isLoading, refetch };
}
