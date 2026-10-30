// Bundles site/ into one self-contained chrollo.html (works from file://, no server).
// Inputs: site/index.html, scripts, sheet.webp (one image sheet), three sfx wavs.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const site = path.join(root, 'site');
const read = f => fs.readFileSync(path.join(site, f), 'utf8');
const mime = { '.webp': 'image/webp', '.wav': 'audio/wav' };
const uri = f => `data:${mime[path.extname(f)]};base64,${fs.readFileSync(path.join(site, f)).toString('base64')}`;

// game.js looks files up in window.__A before falling back to the plain path.
const assets = {};
for (const f of ['sheet.webp', 'sample-gabi.webp', 'sample-tucker.webp', 'sfx-left.wav', 'sfx-front.wav', 'sfx-right.wav']) assets[f] = uri(f);

const must = (s, from, to) => {
  if (!s.includes(from)) throw new Error('patch target not found: ' + from);
  return s.split(from).join(to);
};
const inline = code => `<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`;
const tag = f => `<script src="${f}"></script>`;

let html = read('index.html');
html = must(html, tag('i18n.js'), inline(read('i18n.js')));
html = must(html, tag('manifest.js'), inline(`window.__A=${JSON.stringify(assets)};` + read('manifest.js')));
html = must(html, tag('game.js'), inline(read('game.js')));
html = must(html, tag('music.js'), inline(read('music.js')));
html = must(html, tag('editor.js'), inline(read('editor.js')));

const out = path.join(root, 'chrollo.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(2) + ' MB');
