import { keccak256, stringToHex } from 'viem';

export interface TaskSignatureFields {
  address: string;
  nonce: string;
  issuedAt: string;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'auth')
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function taskSignatureMessage(
  method: string,
  path: string,
  auth: TaskSignatureFields,
  payload: unknown,
): string {
  const payloadHash = keccak256(stringToHex(stableJson(payload)));
  return [
    'TipJar Tasks',
    'Chain ID: 42220',
    `Method: ${method.toUpperCase()}`,
    `Path: ${path}`,
    `Wallet: ${auth.address}`,
    `Nonce: ${auth.nonce}`,
    `Issued At: ${auth.issuedAt}`,
    `Payload hash: ${payloadHash}`,
  ].join('\n');
}
