// Turns big phone photos into small, fast website images.
//   Hero photos (rotating homepage banner):  put JPG/PNG/WEBP files in  photos/
//   The "About us" picture:                  put ONE photo in           photos/about/
// Then run:  npm run images
// Optimised copies are written to src/assets/hero and src/assets/about and are picked up automatically.
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const isImage = (f) => /\.(jpe?g|png|webp)$/i.test(f);

async function run(srcDir, outDir, width, height, label) {
  if (!existsSync(srcDir)) return 0;
  const files = readdirSync(srcDir).filter(isImage).sort();
  if (!files.length) return 0;
  mkdirSync(outDir, { recursive: true });
  for (const old of readdirSync(outDir)) if (/\.(webp|jpe?g|png)$/i.test(old)) rmSync(join(outDir, old));  // keep folder in sync with photos
  let n = 0;
  for (const f of files) {
    const name = basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const out = join(outDir, `${String(++n).padStart(2, '0')}-${name}.webp`);
    await sharp(join(srcDir, f)).rotate().resize({ width, height, fit: 'cover', position: 'attention' }).webp({ quality: 72 }).toFile(out);
    console.log(`[${label}] ${f}  ->  ${out}  (${Math.round(statSync(out).size / 1024)} KB)`);
  }
  return n;
}

const hero = await run('photos', 'src/assets/hero', 1920, 1080, 'hero');
const about = await run(join('photos', 'about'), 'src/assets/about', 1200, 900, 'about');
if (!hero && !about) {
  console.log('No photos found. Put hero photos in ./photos and the About picture in ./photos/about, then run again.');
  console.log('iPhone tip: Settings > Camera > Formats > "Most Compatible" saves JPG instead of HEIC.');
} else {
  console.log(`\nDone: ${hero} hero image(s), ${about} about image(s). Restart "npm run dev" if it is running.`);
}
