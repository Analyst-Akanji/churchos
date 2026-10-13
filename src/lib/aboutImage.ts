// The picture beside "About us". Drop one optimised photo in src/assets/about (npm run images does this
// for photos placed in photos/about). If the folder is empty the logo is shown instead.
const found = import.meta.glob('/src/assets/about/*.{webp,jpg,jpeg,png,avif}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const ABOUT_IMAGE: string | null = Object.keys(found).sort().map((k) => found[k])[0] ?? null;
