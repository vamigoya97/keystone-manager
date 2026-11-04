# Brand assets

Customization media for the example operators' keystones, generated from the logos in `sources/` and each
keystone's saved name, dates and location (`data/store.json`).

```bash
python3 scripts/generate-brand-assets.py                  # every operator
python3 scripts/generate-brand-assets.py to-ponder-an-ayllu   # one keystone, after editing its details
npx tsx scripts/apply-brand-assets.ts to-ponder-an-ayllu      # pin and apply it
```

For sharper art, drop higher-res logos into `sources/` (same filenames) and re-run.

## Layout

| File | Where it goes in /operator | Size |
| --- | --- | --- |
| `<operator>/background.jpg` | Customize → Background (shared by the operator's keystones) | 1080×1920 |
| `<operator>/<keystone>/pass.png` | Details → Keystone artwork (on-chain image) | 1080×1350 |
| `<operator>/<keystone>/banner.jpg` | Customize → Gallery banner | 1800×600 |

Dated keystones get the night look with rings and show their dates and location; ongoing ones show
**KEYSTONE** and their location when set.

## Palettes (Details → colors)

| Operator | Base | Deep | Accent |
| --- | --- | --- | --- |
| ay.llu | `#C26C6B` | `#5E2A2B` | `#F2C9A0` |
| GOAT community | `#A88A6E` | `#3A2C20` | `#F4EEE6` |
| Sahar Camp | `#2A2A2C` | `#121214` | `#C03437` |
