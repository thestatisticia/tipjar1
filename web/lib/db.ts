import { createServerSupabaseClient } from './supabase';

export interface Creator {
  id?: string;
  username: string;
  wallet_address: string;
  name: string;
  bio: string;
  youtube: string;
  twitter: string;
  avatar_url?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Tip {
  id?: string;
  creator_username: string;
  sender_name: string;
  sender_address: string;
  amount: number;
  message: string;
  tx_hash?: string | null;
  created_at?: string;
}

export interface TipAggregate {
  total: number;
  count: number;
}

export interface CreatorLeaderboardEntry {
  rank: number;
  username: string;
  name: string;
  avatarUrl: string;
  totalReceived: number;
  tipsCount: number;
}

export async function getCreator(username: string): Promise<Creator | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_creators')
    .select('*')
    .eq('username', username)
    .single();
  if (error) return null;
  return data as Creator;
}

export async function getCreatorByWallet(walletAddress: string): Promise<Creator | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_creators')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();
  if (error) return null;
  return data as Creator;
}

export async function upsertCreator(creator: Omit<Creator, 'id' | 'created_at'>): Promise<Creator | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_creators')
    .upsert(
      { ...creator, updated_at: new Date().toISOString() },
      { onConflict: 'wallet_address' }
    )
    .select()
    .single();
  if (error) {
    console.error('upsertCreator error:', error);
    return null;
  }
  return data as Creator;
}

export async function getTips(creatorUsername: string): Promise<Tip[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_tips')
    .select('*')
    .eq('creator_username', creatorUsername)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data as Tip[];
}

export async function getSentTips(senderAddress: string): Promise<Tip[]> {
  const normalized = senderAddress.toLowerCase();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_tips')
    .select('*')
    .ilike('sender_address', normalized)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data as Tip[];
}

export async function getReceivedTipStats(creatorUsername: string): Promise<TipAggregate> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_tips')
    .select('amount')
    .eq('creator_username', creatorUsername);

  if (error || !data) return { total: 0, count: 0 };

  const total = data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { total, count: data.length };
}

export async function getSentTipStats(senderAddress: string): Promise<TipAggregate> {
  const normalized = senderAddress.toLowerCase();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_tips')
    .select('amount')
    .ilike('sender_address', normalized);

  if (error || !data) return { total: 0, count: 0 };

  const total = data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { total, count: data.length };
}

export async function getTopCreatorsByTips(limit = 10): Promise<CreatorLeaderboardEntry[]> {
  const cappedLimit = Math.max(1, Math.min(limit, 50));
  const supabase = createServerSupabaseClient();

  const { data: tipsData, error: tipsError } = await supabase
    .from('tipjar_tips')
    .select('creator_username, amount');

  if (tipsError || !tipsData || tipsData.length === 0) return [];

  const byCreator = new Map<string, { totalReceived: number; tipsCount: number }>();
  for (const row of tipsData) {
    const username = String(row.creator_username || '').toLowerCase();
    if (!username) continue;
    const existing = byCreator.get(username) || { totalReceived: 0, tipsCount: 0 };
    existing.totalReceived += Number(row.amount || 0);
    existing.tipsCount += 1;
    byCreator.set(username, existing);
  }

  const sorted = Array.from(byCreator.entries())
    .map(([username, stats]) => ({ username, ...stats }))
    .sort((a, b) => {
      if (b.totalReceived !== a.totalReceived) return b.totalReceived - a.totalReceived;
      if (b.tipsCount !== a.tipsCount) return b.tipsCount - a.tipsCount;
      return a.username.localeCompare(b.username);
    })
    .slice(0, cappedLimit);

  const usernames = sorted.map((r) => r.username);
  const { data: creatorsData } = await supabase
    .from('tipjar_creators')
    .select('username, name, avatar_url')
    .in('username', usernames);

  const creatorMeta = new Map<string, { name: string; avatar_url: string }>();
  for (const creator of creatorsData || []) {
    creatorMeta.set(String(creator.username || '').toLowerCase(), {
      name: String(creator.name || ''),
      avatar_url: String(creator.avatar_url || ''),
    });
  }

  return sorted.map((row, idx) => {
    const meta = creatorMeta.get(row.username);
    return {
      rank: idx + 1,
      username: row.username,
      name: meta?.name || row.username,
      avatarUrl: meta?.avatar_url || '',
      totalReceived: row.totalReceived,
      tipsCount: row.tipsCount,
    };
  });
}

export async function addTip(tip: Omit<Tip, 'id' | 'created_at'>): Promise<Tip | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tipjar_tips')
    .insert(tip)
    .select()
    .single();
  if (error) {
    console.error('addTip error:', error);
    return null;
  }
  return data as Tip;
}
