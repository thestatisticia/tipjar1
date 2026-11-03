# G$ Tip Jar

Tipping platform for creators, powered by **GoodDollar (G$)** on **Celo**.

Creators claim an on-chain username and share a public tip page, QR code, or embeddable widget. Fans tip G$ straight from their wallet to the creator's wallet — the contract never holds funds, and there are no platform fees.

## How it works

- **On-chain registry** — usernames are registered on the `TipJarRegistry` contract on Celo mainnet. Tips are wallet-to-wallet `transferFrom` calls in G$.
- **Creator dashboard** — live G$ balance, tip stats, recent tips, share assets (link / QR / widget), and profile settings.
- **Public pages** — `/tip/<username>` for fans, `/widget/<username>` for embedding.

## Repository structure

| Folder       | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `web/`       | Next.js app (frontend + API routes) — **this is what gets deployed** |
| `contracts/` | Foundry project: `TipJarRegistry.sol`, tests, deploy script         |

## Deployed contracts (Celo mainnet)

| Contract         | Address                                      |
| ---------------- | -------------------------------------------- |
| TipJarRegistry   | `0x9c69aa76f0D565eC514563E36bf9371ba7E74F05` |
| GoodDollar (G$)  | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` |

## Tech stack

- **Frontend**: Next.js 16 (App Router), Tailwind CSS 4, next-themes
- **Auth**: Privy (wallet + email login, embedded wallets)
- **Web3**: wagmi + viem on Celo
- **Database**: Supabase (PostgreSQL) for profiles and the tip ledger
- **Contracts**: Solidity 0.8 + Foundry

## Local development

```bash
cd web
npm install
npm run dev
```

Create `web/.env.local` with:

```
NEXT_PUBLIC_PRIVY_APP_ID=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_CONTRACT_ADDRESS=0x9c69aa76f0D565eC514563E36bf9371ba7E74F05
NEXT_PUBLIC_CHAIN_ID=42220
```

## Deploying to Vercel

The app lives in the `web/` subfolder, so point Vercel at it:

1. Import the GitHub repo in Vercel.
2. In project settings, set **Root Directory** to `web` (framework preset: Next.js — auto-detected).
3. Add the environment variables listed above under **Settings → Environment Variables**.
4. Deploy.

No other configuration is required — API routes deploy as serverless functions automatically.

## Contracts

```bash
cd contracts
forge test          # run the test suite
forge script script/Deploy.s.sol --rpc-url celo --broadcast   # deploy (needs DEPLOYER_PRIVATE_KEY in .env)
```

## License

MIT
