/**
 * Apply the generated brand media in brand-assets/<operator>/ to the example operators'
 * keystones: keystone artwork, background, gallery banner and palette.
 *
 *   npx tsx scripts/apply-brand-assets.ts                        every keystone below
 *   npx tsx scripts/apply-brand-assets.ts ay-llu goat-members    only these operators / keystones
 *
 * Pins each file publicly via Pinata (PINATA_JWT from .env.local), like uploads in the
 * Details and Customize tabs, then writes data/store.json. Restart or touch lib/store.ts
 * afterwards so a running dev server reloads the store.
 */
import { access, readFile } from "fs/promises";
import path from "path";
import { config } from "dotenv";

config({ path: ".env.local" });

const { pinImage } = await import("../lib/pinata/upload");
const { listKeystones, updateKeystone } = await import("../lib/store");

const PALETTES: Record<string, [string, string]> = {
  "ay-llu": ["#C26C6B", "#F2C9A0"],
  goat: ["#A88A6E", "#F4EEE6"],
  "sahar-camp": ["#C03437", "#2A2A2C"],
};

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };

async function pin(operator: string, file: string) {
  const type = TYPES[path.extname(file)];
  const { cid, url } = await pinImage(
    new File([await readFile(path.join("brand-assets", operator, file))], `${operator}-${file.replace("/", "-")}`, { type }),
    { operator, role: "theme", uploadedBy: "brand-assets-script" }
  );
  console.log(`  pinned ${file} → ${cid}`);
  return { src: url, cid, kind: type.startsWith("video/") ? ("video" as const) : ("image" as const) };
}

const only = process.argv.slice(2);
const keystones = await listKeystones();

for (const [operator, palette] of Object.entries(PALETTES)) {
  // The background is shared by the operator's keystones; re-pin them only for a whole-operator run.
  const whole = !only.length || only.includes(operator);
  const picked = keystones.filter((k) => k.operatorId === operator && (whole || only.includes(k.slug)));
  if (!picked.length) continue;
  console.log(operator);
  const background = whole ? await pin(operator, "background.jpg") : undefined;

  for (const k of picked) {
    try {
      await access(path.join("brand-assets", operator, k.slug, "pass.png"));
    } catch {
      console.log(`  – ${k.slug}: no art yet (run scripts/generate-brand-assets.py ${k.slug})`);
      continue;
    }
    const pass = await pin(operator, `${k.slug}/pass.png`);
    const banner = await pin(operator, `${k.slug}/banner.jpg`);

    await updateKeystone(k.slug, (e) => {
      e.tokenImage = pass.src;
      e.tokenImageCid = pass.cid;
      e.tokenVideo = e.tokenVideoCid = undefined;
      e.palette = palette;
      const t = e.theme ?? {};
      e.theme = {
        ...t,
        background: { media: background ?? t.background?.media },
        gallery: { banner },
      };
    });
    console.log(`  ✓ ${k.slug}`);
  }
}
