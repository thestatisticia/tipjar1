export function getWalletConnectionErrorMessage(error: unknown): string {
  const messages = getNestedErrorMessages(error);
  const message = messages.join(' ');

  if (/provider not found|metamask.*not (installed|detected)/i.test(message)) {
    return 'MetaMask was not detected. Install or unlock the MetaMask browser extension, then try again.';
  }

  if (/failed to connect to metamask|metamask extension not found|extension.*not found/i.test(message)) {
    return 'MetaMask is installed, but this page could not reach its extension. Refresh the page and try again. If it continues, unlock MetaMask and make sure it is enabled for localhost.';
  }

  if (/user rejected|user denied/i.test(message)) {
    return 'The MetaMask connection request was rejected.';
  }

  return messages[0] || 'Could not connect to MetaMask.';
}

function getNestedErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'string') {
      messages.push(current);
      break;
    }
    if (typeof current !== 'object') break;

    const value = current as Record<string, unknown>;
    for (const key of ['shortMessage', 'details', 'message', 'reason']) {
      if (typeof value[key] === 'string') messages.push(value[key]);
    }
    current = value.cause;
  }

  return messages;
}

export function getWalletActionErrorMessage(error: unknown, action: string): string {
  const messages = getNestedErrorMessages(error);
  const detail = messages.find(Boolean) || '';
  const normalized = messages.join(' ').toLowerCase();
  const errorName = typeof error === 'object' && error !== null && 'name' in error
    ? String(error.name)
    : '';

  if (/user rejected|user denied|denied transaction signature|request rejected|code.?4001/.test(normalized)) {
    return `You rejected the ${action} in MetaMask. No transaction was submitted and no CELO gas was charged. You can try again when ready.`;
  }

  if (/insufficient funds|not enough funds|insufficient balance|funds for gas/.test(normalized)) {
    return `Your wallet does not have enough CELO to cover the estimated network fee for this ${action}. Keep enough CELO on Celo for gas, then try again.`;
  }

  if (/chain.*(not supported|mismatch)|wrong network/.test(normalized)) {
    return 'Switch your wallet to Celo Mainnet, then try again.';
  }

  if (/revert|execution failed|contract function.*failed/.test(normalized)) {
    return `The Celo contract rejected this ${action}. Check that the task or campaign is still open, has capacity, and has the required G$ funding.`;
  }

  if (errorName === 'Error' && detail) return detail;

  return detail
    ? `Could not complete the ${action}. MetaMask reported: ${detail}`
    : `Could not complete the ${action}. Check MetaMask and your Celo connection, then try again.`;
}
