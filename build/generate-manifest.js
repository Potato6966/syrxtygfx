const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const FOLDERS = [
  { key: 'backround', dir: 'backround' },
  { key: 'thumbnails', dir: 'Thumbnails' },
  { key: 'logos', dir: 'Logos' },
  { key: 'product-banners', dir: 'Product banners' },
  { key: 'product-boxes', dir: 'Product boxes' },
];

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function listImages(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  const files = fs.readdirSync(full, { withFileTypes: true });
  const out = [];
  for (const entry of files) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED.has(ext)) out.push(entry.name);
    }
  }
  // sort for stable order
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function main() {
  const manifest = {};
  for (const f of FOLDERS) {
    manifest[f.key] = listImages(f.dir);
  }
  const target = path.join(ROOT, 'images-manifest.json');
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2));
  console.log('Wrote', target);
}

main();


