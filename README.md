# GOODHUB

GOODHUB is a creator and community rewards app powered by **GoodDollar (G$)** on **Celo**.

Creators can share a public tip page, QR code, and embeddable widget. Community members can explore tasks, submit proof for G$ rewards, apply to campaigns, and claim daily GoodDollar UBI. Fans tip G$ directly to creators' wallets.

## How it works

- **On-chain registry** — usernames are registered on the `TipJarRegistry` contract on Celo mainnet. Tips are wallet-to-wallet `transferFrom` calls in G$.
- **Creator dashboard** — live G$ balance, tip stats, recent tips, share assets (link / QR / widget), and profile settings.
- **Community tasks** — creators set a duration and escrow G$ for multiple completions; Explore Tasks lists available work, while My Tasks shows submissions, review status, expiry, and claimed-slot progress.
- **Project campaigns** — projects set a duration, escrow a G$ budget, and choose a participant limit; admins approve applications, review submitted content, and release rewards on-chain.
- **Daily rewards** — claim eligible UBI directly to your wallet, see a countdown to the next claim, and earn optional spins from UBI claims and approved tasks.
- **Public pages** — `/tip/<username>` for fans, `/widget/<username>` for embedding.

## Repository structure

| Folder       | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `web/`       | Next.js app (frontend + API routes) — **this is what gets deployed** |
| `contracts/` | Foundry project: registry and escrow contracts, tests, deploy scripts |

## Deployed contracts (Celo mainnet)

| Contract                 | Address                                      |
| ------------------------ | -------------------------------------------- |
| TipJarRegistry           | `0x9c69aa76f0D565eC514563E36bf9371ba7E74F05` |
| TaskEscrow               | `0x0C65D603B0b55bd48cb39f59202EE9cD48D5187a` |
| CampaignEscrow           | `0x09071A985D1F70C9D36d4Efe765FE13F866345cc` |
| RockPaperScissorsEscrow  | `0xFD37b02043838Da091016E072c568a2B011b2e83` |
| GoodDollar (G$)          | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` |

## Tech stack

- **Frontend**: Next.js 16 (App Router), Tailwind CSS 4, next-themes
- **Wallet connection**: MetaMask via wagmi on Celo
- **Web3**: wagmi + viem on Celo
- **Database**: Supabase (PostgreSQL) for profiles and the tip ledger
- **Contracts**: Solidity 0.8 + Foundry

## Local development

```bash
cd web
npm ci
npm run dev
```

Create `web/.env.local` with credentials and configuration for your Supabase project and deployed Celo contracts:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_CONTRACT_ADDRESS=0x9c69aa76f0D565eC514563E36bf9371ba7E74F05
NEXT_PUBLIC_CHAIN_ID=42220
NEXT_PUBLIC_TASK_ESCROW_ADDRESS=0x0C65D603B0b55bd48cb39f59202EE9cD48D5187a
NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS=0x09071A985D1F70C9D36d4Efe765FE13F866345cc
NEXT_PUBLIC_RPS_ESCROW_ADDRESS=0xFD37b02043838Da091016E072c568a2B011b2e83
GOODDOLLAR_RPC_URL=https://forno.celo.org
SPIN_REWARD_PRIVATE_KEY=...
```

Keep `SUPABASE_SERVICE_ROLE_KEY` and `SPIN_REWARD_PRIVATE_KEY` server-side only. Never commit `.env` or `.env.local` files. Connect MetaMask on Celo to use wallet features.

### Supabase setup

Apply the files in `web/supabase/migrations/` to your Supabase project in filename order:

1. `202610280001_tasks.sql`
2. `202610290001_campaigns.sql`
3. `202610290002_spin_wheel.sql`
4. `202610290003_spin_wheel_outcomes.sql`
5. `202610310001_admin_wallets.sql`
6. `202611010001_tipjar_tips.sql`
7. `202611010002_task_campaign_expiry.sql`

The final migration adds task and campaign duration/expiry fields and backfills existing listings with a 30-day expiry from their creation date.

Creator profile, task, and campaign creation require an active GoodDollar Identity on Celo. The server checks `getWhitelistedRoot(address)` on GoodDollar's production Identity contract (`0xC361A6E67822a0EDc17D899227dd9FC50BD62F42`); the contract's `isWhitelisted` logic enforces its authentication period and connected-wallet support. See [GoodDollar Identity docs](https://docs.gooddollar.org/for-developers/core-contracts/identity) and the [Viem/Wagmi integration guide](https://docs.gooddollar.org/for-developers/apis-and-sdks/sybil-resistance/identity-viem-wagmi). `GOODDOLLAR_RPC_URL` is optional and can point to a Celo RPC provider; otherwise the app uses Forno. The Settings KYC button uses the official `@goodsdks/citizen-sdk` face-verification link flow and returns to Settings.

### Tasks setup

1. Apply `web/supabase/migrations/202610280001_tasks.sql` to the Supabase project. This creates task, submission, and replay-protected wallet-signature nonce tables, plus the private proof screenshot bucket. The task list returns a 503 until this migration has been applied.
2. Apply `web/supabase/migrations/202611010002_task_campaign_expiry.sql` to add durations and expiry dates. New tasks can run from 1 to 365 days; existing tasks receive a 30-day expiry from creation.
3. Apply `web/supabase/migrations/202610310001_admin_wallets.sql` to enable the main admin's reviewer allowlist.
4. `TaskEscrow` is deployed on Celo mainnet at `0x0C65D603B0b55bd48cb39f59202EE9cD48D5187a`. Its initial reviewer is `0xf70093EC75bD6183CEA4586D3Cc8c61C7dA28E20`. The main admin wallet is authorized by the server; additional reviewers are managed from `/admin`, where the main admin updates both the server allowlist and escrow reviewer role. The main admin must own the escrow contract to add or revoke reviewers on-chain.
5. Set `NEXT_PUBLIC_TASK_ESCROW_ADDRESS` to the deployed address and restart/redeploy the web app. Never expose `SUPABASE_SERVICE_ROLE_KEY` or the deployment private key to the browser.
6. Admins review proof against the creator's requirements from `/admin`. Approvals transfer escrowed G$ to the worker; rejections return the reserved slot while the task remains open, allowing resubmission. Closing a task refunds only unreserved slots; pending submissions remain funded.

Deploy the escrow (set secrets in `contracts/.env`; do not commit them):

```bash
cd contracts
TASK_ESCROW_ADMIN_WALLET=0x... forge script script/DeployTaskEscrow.s.sol:DeployTaskEscrow --rpc-url celo_mainnet --broadcast
```

Task escrow is deployed. Task APIs still require the Supabase migration and valid Supabase environment credentials.

### Campaigns setup

1. Apply `web/supabase/migrations/202610290001_campaigns.sql` to the same Supabase project. The admin wallet migration above is shared by tasks and campaigns.
2. Apply `web/supabase/migrations/202611010002_task_campaign_expiry.sql` to add campaign durations and expiry dates. New campaigns can run from 1 to 365 days; existing campaigns receive a 30-day expiry from creation.
3. `CampaignEscrow` is deployed on Celo mainnet at `0x09071A985D1F70C9D36d4Efe765FE13F866345cc`. Its initial reviewer is `0xf70093EC75bD6183CEA4586D3Cc8c61C7dA28E20`. Additional reviewers are managed from `/admin`; the main admin must own the escrow contract to add or revoke reviewer roles on-chain.
4. Configure `NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS` with the deployed address and restart/redeploy.
5. Projects fund the full budget and choose the participant cap. Each approved participant receives `floor(budget / cap)` G$ after an admin approves their content. Any indivisible remainder is refunded when the campaign is closed. Applications and content are reviewed together with task submissions on the restricted `/admin` page. Rejected content can be resubmitted. Closing a campaign refunds unallocated budget while preserving shares already reserved for approved participants.

Deploy the campaign escrow (set secrets in `contracts/.env`; do not commit them):

```bash
cd contracts
CAMPAIGN_ESCROW_ADMIN_WALLET=0x... forge script script/DeployCampaignEscrow.s.sol:DeployCampaignEscrow --rpc-url celo_mainnet --broadcast
```

Campaign escrow is deployed. Campaign APIs still require the Supabase migration and valid Supabase environment credentials.

### Daily G$ spin wheel

1. Apply `web/supabase/migrations/202610290002_spin_wheel.sql` and `web/supabase/migrations/202610290003_spin_wheel_outcomes.sql` in order. The wheel unlocks one spin for each recent, on-chain GoodDollar UBI claim and one additional spin for each approved task completion.
2. Create a dedicated Celo reward wallet, fund it with G$ and enough CELO for transfer gas, then set its private key as the server-only `SPIN_REWARD_PRIVATE_KEY`. Never use a personal wallet or expose this key to the browser. The app pays rewards directly to the verified user's connected wallet.
3. The wheel displays seven equal slices with reward labels. The server independently selects outcomes using these chances: 0 G$ (30%), Good luck with no payout (25%), 10 G$ (20%), 20 G$ (15%), 50 G$ (7%), 100 G$ (2%), and 200 G$ (1%). The page does not show probabilities. Total paid rewards stop at 3,000 G$ per UTC day. Spins remain available if the daily budget is full and can be used after it resets.
4. The wheel checks GoodDollar's production UBI claim event on Celo; it scans the most recent 50,000 blocks when eligibility is refreshed. Rewards require a successful G$ transfer from the configured wallet.

Spins stay disabled until the migration is applied and the reward wallet is configured and funded. Keep the key in the hosting provider's server-side environment settings; do not commit it to `.env.local`, documentation, or source control.

The Daily Rewards page also supports direct GoodDollar UBI claims through the Citizen SDK. UBI claims are separate from wheel payouts and require a connected, verified wallet on Celo.

### Rock, Paper, Scissors setup

1. The Games page includes a practice arena against an automatic player. Choose rock, paper, or scissors to see both moves and the result; practice rounds do not use G$ or require a wallet transaction.
2. `RockPaperScissorsEscrow` is deployed on Celo mainnet at `0xFD37b02043838Da091016E072c568a2B011b2e83` with the GoodDollar token address. Players need CELO for gas; wagered matches also require G$ approval and escrow.
3. Set `NEXT_PUBLIC_RPS_ESCROW_ADDRESS` to the deployed contract address and redeploy the web app.
4. Players can create free matches or stake any G$ amount; opponents match the stake. Moves are committed privately and revealed after both players commit. The winner receives the pot, ties refund both stakes, and expired games can be settled on-chain.

Deploy the escrow (set deployment secrets in `contracts/.env`; do not commit them):

```bash
cd contracts
forge script script/DeployRockPaperScissorsEscrow.s.sol:DeployRockPaperScissorsEscrow --rpc-url celo_mainnet --broadcast
```

The RPS escrow is deployed; public matches require the app to be configured with its address.

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
forge script script/Deploy.s.sol:DeployTipJarRegistry --rpc-url celo_mainnet --broadcast   # deploy (needs DEPLOYER_PRIVATE_KEY_HEX in .env)
```

## License

MIT
