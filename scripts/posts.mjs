// Lê a pasta posts/ e descobre o que cada post é (carrossel, reel ou estático).
//
// Estrutura esperada de cada post:
//   posts/AAAA-MM-DD-nome/
//     legenda.md         -> texto puro da legenda (obrigatório)
//     post.json          -> opcional: { "hora": "09:00", "pausado": true, "tipo": "..." }
//     slides/*.jpg       -> carrossel (2 a 20 imagens, em ordem alfabética)
//     arte.jpg           -> estático
//     *.mp4              -> reel (um vídeo só)
//     capa.jpg           -> opcional: capa do reel
//
// As imagens precisam estar em JPEG (exigência da API). Rode "npm run preparar"
// para converter os PNG automaticamente.

import fs from 'node:fs';
import path from 'node:path';

export const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const PASTA_POSTS = path.join(RAIZ, 'posts');
export const HORA_PADRAO = '10:00';
export const LIMITE_LEGENDA = 2200;
export const LIMITE_HASHTAGS = 5;

const ehJpeg = (f) => /\.jpe?g$/i.test(f);

function lerJsonOpcional(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
}

/** Lista todos os posts encontrados em posts/, ordenados por data. */
export function listarPosts() {
  if (!fs.existsSync(PASTA_POSTS)) return [];
  return fs
    .readdirSync(PASTA_POSTS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}-/.test(d.name))
    .map((d) => lerPost(d.name))
    .sort((a, b) => (a.quando < b.quando ? -1 : 1));
}

export function lerPost(id) {
  const pasta = path.join(PASTA_POSTS, id);
  const config = lerJsonOpcional(path.join(pasta, 'post.json'));
  const data = id.slice(0, 10);
  const hora = config.hora || HORA_PADRAO;
  const erros = [];

  // Legenda
  const arqLegenda = path.join(pasta, 'legenda.md');
  const legenda = fs.existsSync(arqLegenda) ? fs.readFileSync(arqLegenda, 'utf8').trim() : '';
  if (!legenda) erros.push('legenda.md ausente ou vazio');
  if (legenda.length > LIMITE_LEGENDA)
    erros.push(`legenda com ${legenda.length} caracteres (limite ${LIMITE_LEGENDA})`);
  const hashtags = legenda.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || [];
  if (hashtags.length > LIMITE_HASHTAGS)
    erros.push(`${hashtags.length} hashtags (limite ${LIMITE_HASHTAGS})`);

  // Mídias
  const arquivos = fs.readdirSync(pasta);
  const pastaSlides = path.join(pasta, 'slides');
  const slides = fs.existsSync(pastaSlides)
    ? fs.readdirSync(pastaSlides).filter(ehJpeg).sort().map((f) => `slides/${f}`)
    : [];
  const pngsSemJpeg = fs.existsSync(pastaSlides)
    ? fs.readdirSync(pastaSlides).filter((f) => /\.png$/i.test(f))
    : [];
  const videos = arquivos.filter((f) => /\.mp4$/i.test(f));
  const arte = arquivos.find((f) => /^arte\.jpe?g$/i.test(f));
  const capa = arquivos.find((f) => /^capa\.jpe?g$/i.test(f));

  let tipo = config.tipo;
  if (!tipo) {
    if (slides.length || pngsSemJpeg.length) tipo = 'carrossel';
    else if (videos.length) tipo = 'reel';
    else if (arte || arquivos.includes('arte.png')) tipo = 'estatico';
  }

  let midias = [];
  if (tipo === 'carrossel') {
    midias = slides;
    if (slides.length < 2 || slides.length > 20)
      erros.push(`carrossel com ${slides.length} slides em JPEG (precisa de 2 a 20; rode npm run preparar)`);
  } else if (tipo === 'reel') {
    if (videos.length !== 1) erros.push(`reel precisa de exatamente 1 .mp4 (achei ${videos.length})`);
    midias = videos.slice(0, 1);
  } else if (tipo === 'estatico') {
    if (!arte) erros.push('estático sem arte.jpg (rode npm run preparar)');
    else midias = [arte];
  } else {
    erros.push('não achei mídia: precisa de slides/, um .mp4 ou arte.jpg');
  }

  for (const m of midias) {
    const tamanho = fs.statSync(path.join(pasta, m)).size;
    if (tamanho > 20 * 1024 * 1024) erros.push(`${m} passa de 20 MB (limite da CDN)`);
    if (ehJpeg(m) && tamanho > 8 * 1024 * 1024) erros.push(`${m} passa de 8 MB (limite da API para imagem)`);
  }

  return {
    id,
    pasta,
    data,
    hora,
    // Horário de Brasília (sem horário de verão desde 2019)
    quando: new Date(`${data}T${hora}:00-03:00`),
    tipo,
    legenda,
    midias,
    capa: tipo === 'reel' ? capa : undefined,
    pausado: Boolean(config.pausado),
    erros,
  };
}
