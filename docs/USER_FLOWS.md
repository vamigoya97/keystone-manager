# User & operator flows

How each page of the keystone app behaves and hands off to the next. A **keystone** is the one token operators
issue: an NFC-linked pass that unlocks a private gallery, optionally with dates and a location.
Diagrams live in [`docs/flows/`](flows/) as standalone SVGs (light and dark mode).

## 1. Overview

![Web app overview](flows/01-overview.svg)

Every keystone has one link, `/x/<slug>`. A **chip tap** (`/x/<slug>/tap`, or `/t/<batch>` for an item that
unlocks several keystones) opens a claim session, which leads to the keystone page and then the private
gallery (`/x/<slug>/gallery`). A physical tap is the only way in. The member home at `/` lists the keystones you hold. **Operators** sign in at `/operator`. Every mint is
signed and paid for by the operator wallet (`PRIVATE_KEY`), so members never need ETH.

**Renaming a keystone moves its link.** Saving a new name in Details changes the slug to match
(`ay.llu Live CDMX 2027` → `/x/ay-llu-live-cdmx-2027`; a taken slug gets `-2`). Old links and chips
keep working. Old paths redirect to the new one (chip query included), and chips stay bound to the keystone's
original slug, so they never need reprogramming. Old slugs stay reserved and can't be given to another keystone.

## 2. Member claim (chip tap)

Members see branded terms: **Align keystone** (chip verification), **Secure keystone** (claim), **Forge keystone**
(mint) and **Enter the vault** (open the gallery). The console and the code keep the standard terms.

![Member claim flow](flows/02-member-claim.svg)

| Page | What happens | Next |
|---|---|---|
| `/x/:slug/tap?c=&s=` | Opens the claim screen immediately (the address becomes `/x/:slug`). In the background, `POST /api/tap` checks the chip signature and sets a 24h claim cookie. While it checks, the slide button is greyed out with a spinning knob ("Aligning keystone…") and a chip icon sits in the top-left corner | Aligned → the slide button becomes active; failed → a warning icon and the button stays off until the item is tapped again |
| `/x/:slug` | The claim screen: the **keystone artwork** centred on the operator's **background** (color and/or media), a small **status icon** in the top-left corner (aligning, aligned, securing, warning, revoked, tap your item) and the **slide button** at the bottom. No name, description or other text: those are in the vault. **One slide** secures the keystone: signed out, Privy sign-in opens and forging follows on its own; the knob stays parked and spinning, labeled "Signing in…" while Privy is open and "Opening the vault…" while forging, and the vault opens on its own as soon as the forge succeeds, with no second slide. The four steps are: i tap keystone, ii slide to secure, iii log in (skipped when signed in), iv open the vault. Signing in as someone who already holds it goes straight to the vault; signing in as someone revoked stops and shows the revoked icon. Holders opening the page without a fresh tap slide to **Enter the vault**. Before a tap, or after a failed one, the slide button is greyed out | Closing Privy puts the slide back. A failed forge shows a warning icon and the slide becomes active again to retry. A click or Enter/Space on the knob also completes the slide (assistive tech) |
| `POST /api/k/:slug/mint` | Requires claim session + Privy token. Enforces one wallet per chip, blocks revoked members, idempotent for holders | Success → straight to the vault (gallery) |
| `/x/:slug/gallery` | `GET /api/k/:slug/access` confirms access and returns items as 1-hour signed Pinata links. The vault is the operator's **banner**, then every item edge to edge in rows read left to right: one to three items per row at a shared height (each at its own shape; audio notes and QR codes use fixed card shapes), or one **full-width** item per row. Once the operator has arranged the vault in the Gallery tab, rows are exactly as arranged; items added later pair up after them, and an item left alone by a deletion joins the row beside it when there's room. A vault that's never been arranged pairs items automatically and never leaves one alone (a single item before a full-width one waits for the next, and one at the very end joins the row above). **QR codes are two-sided cards**: the front shows the label and the operator's text, and tapping turns it over to the code (round dots, rounded corner markers, the keystone artwork in the centre); tap again to turn it back. In the viewer the back also has **Open link**. then **About this keystone**: the contract description and attributes (location, dates, traits) on the operator's background, with **Sign out** at the end. Tapping an item opens a black full-screen viewer: swipe between items, caption and "3 of 12" underneath, Close at the top | Non-holders / revoked / signed-out are redirected to `/x/:slug` |

### Member area: `/`, `/operators`, `/o/<operator>`

**After a tap**, a member lands on the keystone's gated content: holders go straight to the vault once the tap is verified;
new members slide once to secure the keystone, then land there.

Every keystone is checked against **current on-chain holdings** of every wallet on the account, using the same
rules as the gallery. The operator pages order keystones by time: **Upcoming & live** (soonest first, Live tag),
**Ongoing** (no dates), then **Past** (newest first).

| Page | Shows |
|---|---|
| **Home** `/` | The keystones you hold as square artwork, two per row edge to edge, newest claim first; each opens its vault. Signed out: "Hold your phone to your item." and **Sign in** |
| **Operators** `/operators` (no longer linked from the home page) | One card per operator that issued you a keystone: name, how many you hold, their names, the next dated one. Operators you no longer hold any from appear under **Former** |
| **Operator page** `/o/<operator>` | Every keystone from that operator, by time |

Keystone statuses (on every row):

| Status | When | Shows |
|---|---|---|
| Active | Claimed and still held | **Open →** gallery |
| Received | Held but never claimed here (sent from another wallet; impossible while transfers are blocked) | **Open →** with a *Received* tag |
| No longer held | Claimed, but the keystone moved to another wallet | Dimmed, links to the claim page |
| Revoked | Revoked by an operator | Dimmed, no link |
| Unknown | The chain couldn't be reached | **Open →**, since the gallery re-checks |

### Physical items that unlock several keystones: `/t/<batch>`

An operator can group physical items (wristbands, pins, tickets) into an **item batch** that unlocks several of
**that operator's** keystones. Each item still has its own unique chip link:

- static chips: `/t/<batch>?c=<item id>&s=<signature>`
- NTAG 424 DNA: `/t/<batch>?picc_data=…&cmac=…` (each chip's UID is its item id)

| Step | Behaviour |
|---|---|
| Tap | `POST /api/items/tap` verifies the item once and opens a claim session for every keystone in the batch |
| One keystone in the batch | Behaves exactly like a keystone chip: claim → gallery, or straight to the gallery for holders |
| Several keystones | *This item unlocks N keystones* — one button claims them all (sign in first if needed; gas covered). Already-held keystones show *Yours*. When everything is held, the member lands in the **first (★) token's gallery**, whose *More from {operator}* list shows the rest |
| Adding a keystone later | Items already handed out unlock it on their next tap — no reprogramming |
| One wallet per item | Claims record `item:<batch>:<item id>`, so each item claims each keystone once; a copied link can't claim again |

Rules: a batch only accepts its own operator's keystones (checked when saving and again on every tap); a link signed
for one batch, or a per-keystone chip link, can't open another batch; NTAG 424 batches have their own keys
(scope `item-batch/<id>`) and reject replays. Per-keystone chip links (`/x/<slug>/tap`) keep working.

## Operators & keystones

Every keystone belongs to an **operator**, a creator, community or brand such as **ay.llu**,
**GOAT community** or **Sahar Camp**. There's one token type, the keystone. Each can optionally have a start
date (and end date for multi-day ones) and a location; with no dates it's **ongoing**. Dates only decide how
keystones are ordered and labeled (*Upcoming*, *Live*, *Past*); every keystone uses the same `KeystonePass`
contract, NFC chip flow, gallery and Customize options.

The console is organized by operator: pick one from the **operator dropdown** (which also has **+ New operator**), see its keystones as a **list** or as artwork **icons**, newest first (by creation date), and open one to manage it. Sign-in is a
single operator allowlist for now (`OPERATOR_PHONES` / `OPERATOR_EMAILS` / `OPERATOR_WALLETS`); per-operator
logins can be added later.

## 3. Operator console

![Operator flow](flows/04-operator.svg)

| Area | What operators do |
|---|---|
| Sign-in | Privy login checked against `OPERATOR_PHONES` / `OPERATOR_EMAILS` / `OPERATOR_WALLETS`. Others see "Not an operator" |
| Operators | Row of operators (ay.llu, GOAT community, Sahar Camp, …) with keystone counts; **+ New operator** |
| Keystones | For the selected operator: its keystones under **Upcoming & live**, **Ongoing** and **Past**, and **+ New keystone** (name, link, optional dates and location) |
| Gas wallet | A dropdown in the top bar next to "Operator console": the button shows the balance (amber "Low" when it runs short, red if unreachable); it opens the chain, estimated mints remaining, copy address to fund, and the explorer link |
| Gallery tab | The vault's **banner** (wide image or short loop, saves right away) and its items: **photos** (≤ 25 MB), **short clips** (MP4/WebM/MOV, ≤ 60 s and 100 MB), **audio notes** (MP3/M4A/WAV/OGG/WebM, ≤ 10 min) and **QR codes** (a link, a label and optional front text up to 240 characters, drawn in the browser; **Edit text** changes the label and text later). Files go to Pinata **private** IPFS; QR links are stored in the app and, like the files, only sent to holders. Items show at their real shape in the same masonry grid as the vault; the grid is the vault's layout exactly, arranged by drag and drop: drop a tile on the left or right half of another to place it beside that one (up to three per row), or, while dragging a landscape photo or clip or an audio note, on a bar between rows (or the top or bottom of a full-width tile) to give it a full-width row there; a line or bar shows where it will land. **←** / **→** move an item one place and **Full width** / **Half width** switches it in place; order, widths and rows save together; remove (also deletes the file at Pinata). A live phone preview on the right shows the vault as members see it; tap an item to open the viewer |
| Items tab | The keystone's physical items: chip type (static or NTAG 424 DNA), chip-link generator with CSV export or the NTAG 424 programming sheet, and multi-keystone item batches that include it (new batches start with it) |
| Details tab | Name, symbol and description (what the contract commits), **traits** (key–value attributes for the contract: optional **Location**, **Start date** and **End date** rows added with their own buttons, then your own Text / Number traits); **keystone artwork** (an image, or a looping MP4/WebM up to 15 s) shown exactly as uploaded; and the **contract**: **Create keystone contract** with a tokenURI preview, then after deploy its status, reference links (BaseScan: contract, token tracker, deployment tx, keystone #1; OpenSea on Base mainnet, since OpenSea no longer lists testnets), on-chain metadata (write / lock) and transfer controls (see [Keystone contract](#4-keystone-contract)) |
| Members tab | Members table (chip, claim date, tx), revoke / restore / release chip |
| Customize tab | The member screens' background and wording, with a live phone preview of the claim screen labeled i–v (i tap keystone, ii slide to secure, iii log in, iv open the vault, v holder; slide the button in the preview to play log in and opening the vault). **Background**: media (PNG, JPG, WebP, GIF, AVIF or MP4/WebM loop up to 20 MB and 15 s, pinned to public IPFS) behind the artwork and under the vault's description, a color (standard light grey), how much the media is darkened (never less than 45%) and the text color (standard follows the background). **Wording**: your own slide-button text for each of the four claim steps (i tap keystone, ii slide to secure, iii log in, iv open the vault; up to 32 characters except i, and selecting a field previews its step) and the not-aligned message. Everything is optional; **Reset to standard** clears it |

## 4. Keystone contract

![Keystone contract](flows/05-pass-contract.svg)

Each keystone is a `KeystonePass` ([contracts/KeystonePass.sol](../contracts/KeystonePass.sol)),
an ERC-721 deployed from the console and owned by the operator wallet. Only the operator wallet can mint,
and it pays the gas, so members claim for free and nobody can mint around the tap flow.

**What's committed on chain.** The contract builds its own `tokenURI` / `contractURI` JSON, so wallets and
marketplaces read the keystone straight from the chain. Every field comes from the keystone's **Details**
(there are no separate contract text fields): edit and save Details, then deploy.

Each `tokenURI(id)` returns OpenSea-standard JSON:

| Key | Comes from |
|---|---|
| `name` | Details name + ` #<token number>` (ERC-721 name, fixed at deploy) |
| `description` | Details description (up to 500 characters) |
| `image` | `ipfs://<CID>` of the keystone artwork (for video artwork, its first frame), a content address that pins the exact image |
| `external_url` | The keystone's page, `<APP_URL>/x/<slug>` |
| `background_color` | The keystone's first color, six hex digits without `#` |
| `animation_url` | `ipfs://<CID>` of the looping video when the keystone artwork is a video (omitted for image artwork) |
| `attributes` | **Location** and **Start Date** / **End Date** when set (`display_type: "date"`, unix seconds), then the operator's own **Traits** from Details (text, or numbers with `display_type: "number"`; up to 20). Empty `[]` when there are none. Transferability isn't a trait: wallets read it from the contract (`transferable()`, ERC-5192 `locked()`) |

`contractURI()` returns the collection-level `name`, `description`, `image` and `external_link`. The symbol is the
ERC-721 symbol from Details, fixed at deploy. Empty optional keys are left out.

**Deploy options** (Details tab → Create keystone contract), paid by the operator wallet:

| Option | Effect |
|---|---|
| Non-transferable keystones (on by default) | Blocks wallet-to-wallet moves for **every** keystone |
| Lock metadata at deploy | Description, artwork, links, colors, animation and attributes can never change |

**After deploy** (Details tab → Contract panel, shown only once a contract exists). Each change is a transaction
paid by the operator wallet, with an explorer link:

| Control | Effect | Reversible? |
|---|---|---|
| Status | Address (copy), standard, symbol, minted count, contract and deployment-tx explorer links | n/a |
| Write details to chain | Appears when the metadata built from the saved Details (description, artwork, link, colors, animation, attributes) differs from the chain; writes all of it. Marketplaces are told to refresh (ERC-4906) | Until metadata is locked |
| Lock forever | All on-chain metadata can never change | No |
| Make non-transferable / Allow transfers | Blocks or allows wallet-to-wallet moves for **every** keystone, existing and future | Until the rule is locked |
| Lock rule | Fixes the current transfer setting forever | No |

**While transfers are blocked:**

- **Refused:** holder transfers, and moves by approved marketplaces or wallet apps.
- **Still works:** minting new keystones, operator burns (revoke), claiming, and gallery access.
- **Lost wallets:** a member who changes accounts can't move their keystone. Burn the old one if needed, release
  their chip (Members tab → release), and they claim again with the new account.
- **Marketplace signals (ERC-5192):** `Locked` is emitted per keystone at mint while soulbound. Switching the rule
  emits `Unlocked` (transfers on) or `Locked` (transfers off) for every existing keystone, skipping burned ones, plus
  one `TransferabilitySet`; re-sending the current rule does nothing. `locked(tokenId)` and `transferable()` always
  return the live rule. The switch costs more gas as the collection grows (about 3,300 gas per keystone: roughly
  83k gas at 10 keystones, 382k at 100), which stays small on Base.

## Access: two front doors

| | Members | Operators |
|---|---|---|
| Entry | `/` (member home), `/x/<slug>`, chip taps | `/operator` |
| Sign-in | Privy (SMS, wallet, optional email) | Privy, **and** on the server allowlist (`OPERATOR_PHONES` / `OPERATOR_WALLETS`) |
| API | `/api/k/*`, `/api/me/*`, `/api/tap`, `/api/items` | `/api/admin/*` |

The operator page shell is public, but it holds no data or secrets. Everything it shows or changes goes
through `/api/admin/*`, and every one of those routes verifies the Privy session **and** the allowlist
on the server (`requireOperator`). A signed-in member who opens `/operator` sees "Not an operator", and
their direct API calls get `403`.

For an extra layer, serve the console on a separate hostname, or put `/operator` behind your host's
access controls (e.g. Cloudflare Access or Vercel password protection). The server checks above apply
either way.

## Required configuration

| Variable | Used for |
|---|---|
| `PRIVATE_KEY` | Operator wallet that signs and pays for every mint and deploy |
| `PRIVY_APP_SECRET` | Server-side verification of Privy sessions |
| `OPERATOR_PHONES` / `OPERATOR_EMAILS` / `OPERATOR_WALLETS` | Who can open `/operator` |
| `TAP_SECRET` | Signing chip URLs and claim cookies |
| `PINATA_JWT` | Uploads (needs `org:files:write`) |
| `NEXT_PUBLIC_PINATA_GATEWAY` | Dedicated gateway (`yourname.mypinata.cloud`), required for private files |
| `APP_URL` | Optional. Public origin for chip links and `external_url` behind a proxy |
