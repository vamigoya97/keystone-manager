# keystone-manager

Keystones: NFC-unlocked passes to private photo galleries, issued by operators and claimed by tapping a physical item.

A member taps their item, claims a keystone (minted gasless: the operator wallet pays), and lands in a private photo
gallery. Operators run everything from `/operator`: keystones, contracts, galleries, chips, members and the look of
each step.

![Web app overview](docs/flows/01-overview.svg)

Page-by-page flows and diagrams: [docs/USER_FLOWS.md](docs/USER_FLOWS.md).

## How it works

- **Operators** (e.g. ay.llu, GOAT community, Sahar Camp) issue **keystones**: one universal token, optionally
  with dates and a location (a gathering or season); without dates it's ongoing.
- **One link per keystone:** `/x/<slug>` (renaming a keystone moves it; old links redirect). A chip tap (`/x/<slug>/tap`) opens the claim screen
  directly; once the chip is verified the member slides one button to secure it (signing in with Privy
  if needed, then forging) and lands in `/x/<slug>/gallery`. A physical tap is the only way in.
- **Item batches:** one physical item can unlock several keystones from the same operator via `/t/<batch>`.
- **Gallery photos** are Pinata private files, served as short-lived signed links only to current holders.
- **On chain**, each keystone is a `KeystonePass` ERC-721 on Base: operator-only mint, on-chain metadata (image,
  description, attributes), optional freeze, and an operator toggle for non-transferable (soulbound, ERC-5192) keystones.
- **Chips:** plain NTAG chips use HMAC-signed links; NTAG 424 DNA chips use SUN messages (AES-CMAC, per-tap
  counter, replay-protected).

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/` | Members | Home: your keystones by time, and their operators (live on-chain holdings) |
| `/operators`, `/o/<operator>` | Members | Operators that issued you keystones, one operator's keystones |
| `/x/<slug>` · `/tap` · `/gallery` | Members | Claim page (also opened by a chip tap), private gallery |
| `/t/<batch>` | Members | Physical item that unlocks several keystones |
| `/operator` | Operators | Console (allowlisted sign-in only) |

Member APIs live under `/api/{tap,items,k,me}`; operator APIs under `/api/admin/*` and all require
an allowlisted operator.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use port 3000: it's the origin allowed in the Privy dashboard, so sign-in fails on
other ports.

### Environment (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Privy auth (client + server token verification) |
| `OPERATOR_EMAILS` | Comma-separated operator emails for `/operator`. Operators sign in by email only; keystone holders by SMS only (`lib/signIn.ts`) |
| `PRIVATE_KEY` | Operator wallet: deploys keystone contracts and pays every mint |
| `NEXT_PUBLIC_GATE_CHAIN_ID` | `84532` Base Sepolia (default) or `8453` Base |
| `PINATA_JWT`, `NEXT_PUBLIC_PINATA_GATEWAY` | Private gallery files and public token art |
| `TAP_SECRET` | HMAC key for static chip links |
| `NTAG_MASTER_KEY` | Master key for NTAG 424 DNA chips (per-keystone keys are derived) |
| `APP_URL` | Public base URL used in chip links |
| `DATABASE_URL` | Postgres for the app's data (see below). Unset → `data/store.json` |

### Data

Operators, keystones, members, item batches and chip counters go through `lib/store.ts`, which uses one of two
stores with the same behavior (`lib/stores/types.ts`):

- **Postgres** when `DATABASE_URL` is set (`lib/stores/postgres.ts`, tables in `lib/db/schema.ts`). Use this
  for hosting; on Neon, use the pooled connection string.
- **`data/store.json`** otherwise (`lib/stores/json.ts`). Fine for one long-running server, not for serverless.

Mints run under a short claim lock per item and per wallet, so a double tap or two phones can't both mint.

A local Postgres needs no install:

```bash
npm run db:local          # Postgres 17 on localhost:5433, data in data/postgres (Ctrl+C stops it)
```

Then set `DATABASE_URL=postgres://keystone:keystone@localhost:5433/keystone` in `.env.local` and copy your JSON
data in with `npm run db:import`.

### Design lab (development only)

- `/lab` shows every member screen and state (claim steps, vault, viewer, QR cards, home) side by side, rendered by
  the real components with a real keystone and sample data, plus the Gallery tab's arranging grid. No chip, sign-in
  or wallet needed. **Motion set** (`/lab?motion=1`) previews the claim animations: the artwork develops from a
  grainy print while the chip is checked, takes a holographic foil that follows the phone's tilt (or the cursor)
  once aligned, the slider springs and fills with the artwork's colours, completing it presses the artwork and
  sends one ripple, and the artwork travels into the vault banner (View Transitions). All of it switches off under
  reduced motion. It's opt-in (`PlateClaim motion`) and not yet on the live claim page.
- `/lab/console` runs the real operator console on this machine's operators, keystones, members and vaults without
  signing in. Its API calls are answered from a snapshot (`AdminApiOverride` in `components/admin/ui.tsx`), so
  saving is off and nothing can change real data.

Both return 404 in a production build.

### Operator console UI

The console (`/operator`) is built with [shadcn/ui](https://ui.shadcn.com) (Radix + Tailwind): components live in
`components/ui/` (added with `npx shadcn add …`, config in `components.json`), and the console's own building
blocks in `components/admin/ui.tsx` (Panel, Button, Field, Badge, Notice, TabBar, ConsoleRoot) wrap them. Its dark
neutral theme is scoped to the `.kit-shadcn` wrapper (`ConsoleRoot`) in `app/globals.css`, and dialogs, menus and
popovers mount inside it, so member screens keep their own look.

## Scripts

| Command | What |
| --- | --- |
| `npx tsx scripts/chip-url.ts <slug> <chipId>` | Print a signed chip link to write onto an NFC tag |
| `npx tsx scripts/ntag424-url.ts <slug>` | Simulate an NTAG 424 DNA tap (test minting without hardware) |
| `npx tsx scripts/verify-key.ts` | Check `PRIVATE_KEY` maps to the expected address |
| `npm run compile:pass` | Compile `contracts/KeystonePass.sol` into `lib/keystone-pass.json` |
| `python3 scripts/generate-brand-assets.py [operator\|slug…]` | Rebuild keystone brand media in `brand-assets/` from each keystone's saved details |
| `npx tsx scripts/apply-brand-assets.ts [operator\|slug…]` | Pin that media and apply it to the keystones |
| `npm run db:local` | Run a local Postgres 17 (localhost:5433) for development and tests |
| `npm run db:migrate` | Apply the migrations in `drizzle/` to `DATABASE_URL` |
| `npm run db:import [-- file]` | Copy `data/store.json` (or `file`) into `DATABASE_URL`; safe to re-run, never deletes |
| `npm run db:generate` | After changing `lib/db/schema.ts`: write a new migration into `drizzle/` |
| `npm run test:store` | Store checks against the JSON store; add `TEST_DATABASE_URL=…/keystone_test` to include Postgres (**wipes that database**) |

## Project layout

```
app/            pages (member + /operator) and API routes
components/nfc  member UI       components/admin  operator console
lib/            store (+ stores/, db/), auth, chain, tap/NTAG 424, Pinata, theme
drizzle/        Postgres migrations           test/  store tests
contracts/      KeystonePass.sol
docs/           user flows, diagrams, NFC hardware notes
brand-assets/   generated operator media (see its README)
```

## Stack

Next.js 15 (App Router) · React 19 · Tailwind v4 · TypeScript · Privy · viem on Base · Hardhat + OpenZeppelin ·
Pinata.

More: [NFC hardware notes](docs/NFC_INSIGHTS.md) · [brand assets](brand-assets/README.md).
