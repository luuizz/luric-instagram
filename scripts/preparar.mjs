// Converte os PNG dos posts para JPEG (a API do Instagram só aceita JPEG).
// Uso: npm run preparar
//   - posts/*/slides/*.png -> slides/*.jpg
//   - posts/*/arte.png     -> arte.jpg
//   - posts/*/capa.png     -> capa.jpg
// O PNG original continua na pasta; só cria o JPEG se ele ainda não existir
// ou se o PNG for mais novo.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PASTA_POSTS } from './posts.mjs';

async function converter(png) {
  const jpg = png.replace(/\.png$/i, '.jpg');
  if (fs.existsSync(jpg) && fs.statSync(jpg).mtimeMs >= fs.statSync(png).mtimeMs) return false;
  await sharp(png)
    .flatten({ background: '#ffffff' }) // JPEG não tem transparência
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(jpg);
  return true;
}

let total = 0;
for (const nome of fs.readdirSync(PASTA_POSTS)) {
  const pasta = path.join(PASTA_POSTS, nome);
  if (!fs.statSync(pasta).isDirectory()) continue;
  const alvos = [];
  for (const f of ['arte.png', 'capa.png']) {
    if (fs.existsSync(path.join(pasta, f))) alvos.push(path.join(pasta, f));
  }
  const slides = path.join(pasta, 'slides');
  if (fs.existsSync(slides)) {
    for (const f of fs.readdirSync(slides)) if (/\.png$/i.test(f)) alvos.push(path.join(slides, f));
  }
  for (const png of alvos) {
    if (await converter(png)) {
      total++;
      console.log('✔', path.relative(PASTA_POSTS, png).replace(/\.png$/i, '.jpg'));
    }
  }
}
console.log(total ? `\n${total} imagem(ns) convertida(s).` : 'Nada novo para converter.');
