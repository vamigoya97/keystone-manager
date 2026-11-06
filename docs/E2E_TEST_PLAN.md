# End-to-end test plan

A full pass over every operator and member path, on Base Sepolia with real accounts. Most of these paths have only
been checked up to the Privy sign-in boundary, so expect the first real failures here. Work top to bottom: later
phases depend on keystones, contracts and members created earlier.

**Who does what.** Privy sign-in (SMS codes) and physical phones/NFC tags need you. Claude drives the browser up to
sign-in, runs the scripts, reads contracts on chain, inspects `data/store.json` and fixes bugs as they come up.

## 0. Before starting

| Need | Why |
|---|---|
| Two phone numbers (or one phone + one email with `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true`) | Member A and member B, for "chip already used" and the Members tab |
| An operator login in `OPERATOR_PHONES` / `OPERATOR_EMAILS` | Console access |
| Base Sepolia ETH on the operator wallet (`PRIVATE_KEY`) | Deploys and mints; ~0.02 ETH is plenty |
| `TAP_SECRET`, `NTAG_MASTER_KEY`, `PINATA_JWT`, `NEXT_PUBLIC_PINATA_GATEWAY`, `APP_URL` set in `.env.local` | Chips, private gallery, links |
| Optional: blank NTAG 213/215 and NTAG 424 DNA tags + NXP TagWriter / TagXplorer | Real taps (otherwise simulated with scripts) |
| A real iPhone (Safari) and Android (Chrome) on the same network | Swipe viewer, NFC, mobile layout |

Setup (Claude):

1. Snapshot the store: `cp data/store.json data/store.backup-before-e2e.json`.
2. `npx tsx scripts/verify-key.ts`, then check the operator wallet balance on Base Sepolia.
3. `npx tsc --noEmit` and `npx next build` (a production build has never been run; catch build-only errors first).
4. Start the dev server on **port 3000** (the only Privy-allowed origin).
5. For phone testing, `localhost` won't resolve on the phone. Either test on the laptop with mobile emulation, or
   add the laptop's LAN URL to Privy's allowed origins and set `APP_URL` to it for that session.

Create a **throwaway keystone** (e.g. "E2E Test") for anything irreversible (Lock forever, transfer lock), so the
example keystones stay editable.

## 1. Operator console

| # | Step | Expect |
|---|---|---|
| 1.1 | Sign in at `/operator` with the operator account; then with a non-allowlisted account | Operator sees the library; others are refused |
| 1.2 | Operator dropdown, then List / Icons | One operator at a time; its keystones newest first (by creation date), no time groups |
| 1.3 | **New keystone** (name and URL only), twice | Both created; the newest appears first and opens automatically |
| 1.4 | Details: edit name and save | Slug changes to match (`-2` if taken); old `/x/<old-slug>` redirects; the console follows the new slug |
| 1.5 | Details: description at 500 chars (and 501), symbol | Counter blocks 501; saves persist after reload |
| 1.5b | Details → Traits: + Location, + Start date, + End date (End only after Start; removing Start removes End), plus a Text and a Number trait; save; try a duplicate name, "Location", and a Number with letters | Saved traits appear in the tokenURI preview after Location/dates (no Operator or Transferable entries); the bad ones are refused with a clear message; after deploy, changing a trait offers Write details to chain |
| 1.6 | Upload keystone artwork: an image, then a looping MP4 (≤ 15 s); try a 16 s video | Pinned publicly; shown as uploaded (no rounding or overlays); the video loops silently; tokenURI preview gets `animation_url` and the first frame as `image`; the 16 s video is rejected |
| 1.7 | Customize: background image, then an MP4 ≤ 15 s; try a 20 MB+ file and a 16 s video | Valid ones preview live; oversize/long ones rejected with a clear message |
| 1.8 | Gallery tab: upload a banner | Saves immediately; shows in the vault preview and for members |
| 1.8b | Customize: change artwork size, position, corners, border, description size/color/alignment, alert wording and colors, background color and darkening; Save | Preview follows every change; the claim screen matches after a reload; Reset styling to standard restores the default look |
| 1.9 | Gallery tab: upload several photos, a clip (≤ 60 s), an audio note; add a QR code (link + label); drag tiles to reorder and reload; delete one | Private Pinata files; phone preview updates; tapping an item in the preview opens the viewer; deleted file gone from Pinata too |
| 1.9b | Try a 61 s clip, a 101 MB clip, a PDF, and a `javascript:` QR link | Each rejected with a clear message |
| 1.10 | Items tab: static chips → generate links, export CSV | Links open `/x/<slug>/tap?c=…&s=…` |
| 1.11 | Items tab: switch to NTAG 424 → programming sheet | Sheet shows per-keystone key and URL template |
| 1.12 | Items tab: create a multi-keystone item batch | Only same-operator keystones allowed; new batch starts with this keystone |

## 2. Keystone contract (Base Sepolia)

| # | Step | Expect |
|---|---|---|
| 2.1 | Details → tokenURI preview | OpenSea JSON: name `#1`, description, `ipfs://` image, external_url, background_color, attributes (Location, dates as `display_type: date`, then your traits; no Operator or Transferable) |
| 2.2 | Create keystone contract (defaults: non-transferable, not frozen) | Gas estimate shown; deploys; Details now shows the Contract panel (address, symbol, minted 0) with BaseScan links (contract, token tracker, deployment tx) that open the right pages; on Base Sepolia the OpenSea row explains it only appears on mainnet |
| 2.3 | Claude reads `tokenURI(1)` after the first mint (phase 3) | Byte-for-byte equal to the preview |
| 2.4 | Edit the description → **Write details to chain** | On-chain `metadata()` updates; diff in the panel clears |
| 2.5 | Rename the keystone after deploy | `external_url` on chain is stale until 2.4 is repeated — confirm the panel flags the difference |
| 2.6 | Throwaway keystone only: Allow transfers → transfer a token between A and B → Block transfers → Lock | `transferable()` flips and the explorer shows `Unlocked` / `Locked` events for each keystone; transfers fail once blocked; lock is permanent |
| 2.7 | Throwaway keystone only: **Lock forever** | Further writes rejected in the UI and on chain |

## 3. Member claim — static chip

Use `npx tsx scripts/chip-url.ts <slug> <chipId>` (or a real NTAG 213 written with that URL). Member A, signed out.

| # | Step | Expect |
|---|---|---|
| 3.1 | Open the chip link | Claim screen right away: background and centred artwork only; slide button greyed out with a spinning knob ("Aligning keystone…"); chip icon top-left; address becomes `/x/<slug>` |
| 3.2 | After aligning | Target icon top-left; slide button active ("Secure keystone"). Tapping the artwork does nothing; a short drag snaps back |
| 3.3 | Slide to the end → Privy SMS | Knob stays parked and spinning ("Securing your keystone…") through sign-in and forging, with no second action. Also try closing Privy (slide comes back), iPhone Safari (no page scroll while sliding) and VoiceOver (knob is a button) |
| 3.4 | Forge succeeds | Straight to the vault, no "Forged" screen or confetti |
| 3.5 | Reload `/x/<slug>` | No re-verification; holder → slide **Enter the vault** |
| 3.6 | Same chip link again while holding | Straight to the vault |
| 3.7 | Member B opens the same chip link | Aligns, but forging fails: "This item's keystone has already been secured by another account" |
| 3.8 | Tamper with `s=` | Warning icon (its tooltip: "This keystone couldn't be aligned…"); slide button stays greyed out |
| 3.9 | Open `/x/<slug>` with no tap (fresh browser profile) | Phone icon top-left; slide button greyed out |
| 3.10 | Wait > 24 h or clear cookies, then forge | Refused; must tap again |

## 4. Member claim — NTAG 424 DNA

| # | Step | Expect |
|---|---|---|
| 4.1 | `npx tsx scripts/ntag424-url.ts <slug>` → open | Aligns and forges like 3.x |
| 4.2 | Open the same SUN URL again | Rejected (replay) |
| 4.3 | Open a plain `?c=&s=` link for this keystone | "This keystone only aligns with a tap of its original item" |
| 4.4 | Real tag: program from the Items sheet, tap with iPhone and Android | Opens the claim screen; each tap works once with a new counter |

## 5. The vault

| # | Step | Expect |
|---|---|---|
| 5.1 | Gallery as holder | Banner at the very top (no header bar); items edge to edge in two columns; About this keystone (description, attributes) on the operator's background; Sign out at the bottom; items load as signed links |
| 5.2 | Copy a photo URL, open after 1 h | Expired |
| 5.3 | Tap a photo (real phones) | Black full-screen viewer on that photo; swipe snaps one at a time; caption and "N of M" track; Close / Esc close |
| 5.3b | Clip, audio note and QR code in the viewer (real phones) | Clip plays inline with controls (iPhone: no forced fullscreen); audio plays; swiping away pauses both; QR scans from another phone and Open link opens it |
| 5.4 | Non-holder or signed-out opens `/x/<slug>/gallery` | Redirected to the claim page |
| 5.5 | Notch and home bar (iPhone) | Corner icon, slide button, viewer Close and caption clear the status bar and home indicator |
| 5.6 | Gallery tab: arrange by drag and drop | Drop a tile on the right half of another: it joins that row beside it (a fourth is refused); drag a landscape photo or an audio note onto a bar between rows: it gets a full-width row there; ← / → move one place; Full width / Half width switch in place; reload: the vault and the phone preview show exactly the arranged rows; upload a new photo: it pairs at the end; delete an item: nothing is left alone where there's room |
| 5.7 | QR card (real phones) | Front shows label + text; tap turns it to the code with the keystone artwork in the centre; another phone's camera scans it; tap turns it back; in the viewer the back has Open link; **Edit text** in the Gallery tab updates the front |
| 5.6 | Gallery tab: arrange by drag and drop | Drop a tile on the right half of another: it joins that row beside it (a fourth is refused); drag a landscape photo or an audio note onto a bar between rows: it gets a full-width row there; ← / → move one place; Full width / Half width switch in place; reload: the vault and the phone preview show exactly the arranged rows; upload a new photo: it pairs at the end; delete an item: nothing is left alone where there's room |

## 6. Members tab (operator)

| # | Step | Expect |
|---|---|---|
| 6.1 | Members table | A and B with their chips, claim dates and tx links; no invite or sharing controls |
| 6.2 | Revoke A | A's vault shows revoked; home lists it as Revoked; forge blocked |
| 6.3 | Restore A | Access back |
| 6.4 | Release A's chip | A keeps the token; a new account can forge with that chip |

## 7. Shared item (multi-keystone batch)

| # | Step | Expect |
|---|---|---|
| 7.1 | Open the batch chip link (`/t/<batch>?c=&s=`) signed out | Aligning, then "This item unlocks N keystones" list |
| 7.2 | Sign in to secure N → forge all | Rows go Securing → Secured ✓; opens the first keystone |
| 7.3 | Re-tap while holding some | Held rows show "Yours"; button says "Secure N remaining" |
| 7.4 | Add another keystone to the batch, tap the same item | New keystone appears, no reprogramming |

## 8. Member area

| # | Step | Expect |
|---|---|---|
| 8.1 | `/` signed out | "Hold your phone to your item." + Sign in |
| 8.2 | `/` signed in (A) | Held keystones as square artwork, two per row, newest claim first; each opens its vault; Sign out top-right |
| 8.3 | `/operators`, `/o/<operator>` | Current vs Former operators; per-operator sections |
| 8.4 | After a transfer (2.6) | Sender sees "No longer held"; receiver sees "Received" |

## 9. Edge cases and regressions

- A keystone with no artwork, no background, no banner (fallback card, plain screens).
- A 500-character description on a small phone (iPhone SE width): nothing cut off, button still reachable.
- Dates: upcoming, live today, past; no dates (ongoing).
- Old slug + old chip after two renames still redirect and verify (`chipScope`).
- Slow network (DevTools throttling): aligning alert visible; no double POST for NTAG taps.

## 10. Before deploying

- `next build && next start` on a clean checkout.
- `data/store.json` is a single-file store: move to a database before any serverless or multi-instance host.
- Production env: `TAP_SECRET` and `NTAG_MASTER_KEY` set (taps fail closed without them), `APP_URL` = public URL,
  Privy allowed origins updated, `NEXT_PUBLIC_GATE_CHAIN_ID` decided (Base Sepolia vs Base).

## Afterwards

- Log every failure in the table below with the step number, then fix and re-run that step.
- Restore the example data if needed: `cp data/store.backup-before-e2e.json data/store.json`.

| Step | Result | Notes / fix |
|---|---|---|
| | | |
