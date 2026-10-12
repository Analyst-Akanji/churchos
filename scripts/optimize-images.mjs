// Turns big phone photos into small, fast hero images.
//   1. Put your JPG/PNG/WEBP photos from church services in the  photos/  folder
//   2. Run:  npm run images
//   3. Optimised copies appear in  src/assets/hero/  and are picked up automatically
// Each image becomes a 1920x1080 WebP (usually 120-250 KB) so the homepage stays fast on mobile data.
import sharp from 'sharp';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const SRC = 'photos', OUT = 'src/assets/hero';
mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
if (!files.length) {
  console.log(`No photos found in ./${SRC}. Copy .jpg/.png/.webp files there first.`);
  console.log('iPhone tip: Settings > Camera > Formats > "Most Compatible" saves JPG instead of HEIC.');
  process.exit(0);
}
let n = 0;
for (const f of files) {
  const name = basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const out = join(OUT, `${String(++n).padStart(2, '0')}-${name}.webp`);
  await sharp(join(SRC, f)).rotate().resize({ width: 1920, height: 1080, fit: 'cover', position: 'attention' }).webp({ quality: 72 }).toFile(out);
  console.log(`${f}  ->  ${out}  (${Math.round(statSync(out).size / 1024)} KB)`);
}
console.log(`\nDone. ${n} hero image(s). Restart "npm run dev" if it is running. Aim for 4 to 6 images.`);
