import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const input=fs.readFileSync('icons/icon.svg');
for(const size of [192,512]) await sharp(input).resize(size,size).png().toFile(`icons/icon-${size}.png`);
const mask=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#153f3c"/><path d="M175 350V186h57v34c18-28 40-40 76-38v61c-49-8-74 15-74 61v46z" fill="white"/><circle cx="330" cy="329" r="24" fill="#dcebb6"/></svg>`;
await sharp(Buffer.from(mask)).png().toFile('icons/icon-maskable.png');
console.log('Generated 3 PWA icons.');
