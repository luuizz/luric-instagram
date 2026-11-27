// Publica no Instagram os posts cujo horário já chegou e que ainda não foram publicados.
//
// Uso:
//   node scripts/publicar.mjs              -> publica o que estiver na hora
//   node scripts/publicar.mjs --verificar  -> só confere todos os posts (sem chamar a API)
//   node scripts/publicar.mjs --simular    -> mostra o que publicaria agora, sem publicar
//   node scripts/publicar.mjs --post 2027-01-05-carrossel  -> publica esse post já (ignora horário)
//
// Variáveis de ambiente (no GitHub ficam em Settings > Secrets and variables > Actions):
//   IG_ACCESS_TOKEN  (secret)   token de acesso (EAA..., Instagram API com login do Facebook)
//   IG_USER_ID       (variable) id da conta do Instagram (padrão: @luric.web)
//   GRAPH_HOST       (variable) graph.facebook.com (padrão) ou graph.instagram.com
//   GRAPH_VERSION    (variable) padrão v21.0
//   MEDIA_BASE_URL   (variable) opcional; por padrão usa jsDelivr apontando pro commit atual

import fs from 'node:fs';
import path from 'node:path';
import { listarPosts, lerPost, RAIZ } from './posts.mjs';

const args = process.argv.slice(2);
const MODO_VERIFICAR = args.includes('--verificar');
const MODO_SIMULAR = args.includes('--simular');
const POST_FORCADO = args.includes('--post') ? args[args.indexOf('--post') + 1] : null;

// Só publica posts atrasados até este limite (evita soltar post velho se o robô ficar parado dias)
const JANELA_ATRASO_HORAS = Number(process.env.JANELA_ATRASO_HORAS || 12);

const ARQ_PUBLICADOS = path.join(RAIZ, 'publicados.json');
const publicados = fs.existsSync(ARQ_PUBLICADOS) ? JSON.parse(fs.readFileSync(ARQ_PUBLICADOS, 'utf8')) : {};

const resumo = [];
const log = (...m) => {
  console.log(...m);
  resumo.push(m.join(' '));
};

function salvarResumo() {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo.map((l) => l + '  ').join('\n') + '\n');
  }
}

// ---------- Modo verificar ----------
if (MODO_VERIFICAR) {
  let comErro = 0;
  for (const p of listarPosts()) {
    const quando = p.quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const status = publicados[p.id] ? 'publicado' : p.pausado ? 'pausado' : 'na fila';
    if (p.erros.length) {
      comErro++;
      log(`✖ ${p.id} (${p.tipo || '?'}, ${quando}): ${p.erros.join('; ')}`);
    } else {
      log(`✔ ${p.id} · ${p.tipo} · ${p.midias.length} mídia(s) · ${p.legenda.length} caracteres · ${quando} · ${status}`);
    }
  }
  log(comErro ? `\n${comErro} post(s) com problema.` : '\nTudo certo.');
  salvarResumo();
  process.exit(comErro ? 1 : 0);
}

// ---------- API ----------
const TOKEN = process.env.IG_ACCESS_TOKEN;
const HOST = process.env.GRAPH_HOST || 'graph.facebook.com';
const VERSAO = `/${process.env.GRAPH_VERSION || 'v21.0'}`;
const IG_USER_ID_PADRAO = '17841435258862236'; // @luric.web
const API = `https://${HOST}${VERSAO}`;

async function graph(metodo, caminho, params = {}) {
  const url = new URL(API + caminho);
  const corpo = new URLSearchParams({ ...params, access_token: TOKEN });
  let resp;
  if (metodo === 'GET') {
    for (const [k, v] of corpo) url.searchParams.set(k, v);
    resp = await fetch(url);
  } else {
    resp = await fetch(url, { method: 'POST', body: corpo });
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.error) {
    const e = json.error || {};
    throw new Error(`API ${metodo} ${caminho}: ${e.message || resp.status} (code ${e.code ?? '?'}, subcode ${e.error_subcode ?? '-'})`);
  }
  return json;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera o container ficar pronto (vídeo leva alguns minutos pra processar). */
async function aguardarContainer(id, rotulo) {
  const inicio = Date.now();
  while (Date.now() - inicio < 15 * 60 * 1000) {
    const { status_code, status } = await graph('GET', `/${id}`, { fields: 'status_code,status' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED')
      throw new Error(`${rotulo}: processamento falhou (${status_code}: ${status || 'sem detalhes'})`);
    await esperar(8000);
  }
  throw new Error(`${rotulo}: demorou mais de 15 minutos pra processar`);
}

/** Endereços públicos possíveis pra um arquivo, em ordem de preferência. */
function urlsCandidatas(post, arquivo) {
  const caminho = ['posts', post.id, ...arquivo.split('/')].map(encodeURIComponent).join('/');
  if (process.env.MEDIA_BASE_URL) return [`${process.env.MEDIA_BASE_URL.replace(/\/$/, '')}/${caminho}`];
  const repo = process.env.GITHUB_REPOSITORY;
  const ref = process.env.GITHUB_SHA || 'main';
  if (!repo) throw new Error('Defina MEDIA_BASE_URL ou rode dentro do GitHub Actions (GITHUB_REPOSITORY)');
  return [
    `https://cdn.jsdelivr.net/gh/${repo}@${ref}/${caminho}`,
    `https://raw.githubusercontent.com/${repo}/${ref}/${caminho}`,
  ];
}

/**
 * Acha um endereço público que funciona pro arquivo (e já deixa a CDN com ele
 * em cache pra quando a Meta pedir).
 */
async function urlPublica(post, arquivo) {
  const falhas = [];
  for (const url of urlsCandidatas(post, arquivo)) {
    try {
      const r = await fetch(url);
      await r.arrayBuffer();
      if (r.ok) return url;
      falhas.push(`${url} (HTTP ${r.status})`);
    } catch (e) {
      falhas.push(`${url} (${e.message})`);
    }
  }
  throw new Error(`Mídia não está pública: ${falhas.join(' | ')}`);
}

async function publicar(post, igUserId) {
  const urls = [];
  for (const m of post.midias) urls.push(await urlPublica(post, m));

  let containerId;
  if (post.tipo === 'estatico') {
    ({ id: containerId } = await graph('POST', `/${igUserId}/media`, { image_url: urls[0], caption: post.legenda }));
    await aguardarContainer(containerId, 'imagem');
  } else if (post.tipo === 'carrossel') {
    const filhos = [];
    for (const [i, u] of urls.entries()) {
      const { id } = await graph('POST', `/${igUserId}/media`, { image_url: u, is_carousel_item: 'true' });
      await aguardarContainer(id, `slide ${i + 1}`);
      filhos.push(id);
    }
    ({ id: containerId } = await graph('POST', `/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      children: filhos.join(','),
      caption: post.legenda,
    }));
    await aguardarContainer(containerId, 'carrossel');
  } else if (post.tipo === 'reel') {
    const params = { media_type: 'REELS', video_url: urls[0], caption: post.legenda, share_to_feed: 'true' };
    if (post.capa) {
      params.cover_url = await urlPublica(post, post.capa);
    }
    ({ id: containerId } = await graph('POST', `/${igUserId}/media`, params));
    await aguardarContainer(containerId, 'vídeo');
  } else {
    throw new Error(`tipo desconhecido: ${post.tipo}`);
  }

  const { id: mediaId } = await graph('POST', `/${igUserId}/media_publish`, { creation_id: containerId });
  let permalink = '';
  try {
    ({ permalink } = await graph('GET', `/${mediaId}`, { fields: 'permalink' }));
  } catch {}
  return { mediaId, permalink };
}

// ---------- Execução ----------
const agora = new Date();
let candidatos;
if (POST_FORCADO) {
  candidatos = [lerPost(POST_FORCADO)];
} else {
  candidatos = listarPosts().filter(
    (p) =>
      !publicados[p.id] &&
      !p.pausado &&
      p.quando <= agora &&
      agora - p.quando <= JANELA_ATRASO_HORAS * 3600 * 1000,
  );
}

if (!candidatos.length) {
  log('Nenhum post na hora de publicar agora.');
  salvarResumo();
  process.exit(0);
}

if (!TOKEN && !MODO_SIMULAR) {
  log('✖ Falta o secret IG_ACCESS_TOKEN.');
  salvarResumo();
  process.exit(1);
}

const igUserId = process.env.IG_USER_ID || IG_USER_ID_PADRAO;

let falhas = 0;
for (const post of candidatos) {
  if (publicados[post.id] && POST_FORCADO) {
    log(`✖ ${post.id} já foi publicado em ${publicados[post.id].publicadoEm}. Apague a entrada em publicados.json pra publicar de novo.`);
    falhas++;
    continue;
  }
  if (post.erros.length) {
    log(`✖ ${post.id}: ${post.erros.join('; ')}`);
    falhas++;
    continue;
  }
  if (MODO_SIMULAR) {
    try {
      const urls = [];
      for (const m of post.midias) urls.push(await urlPublica(post, m));
      log(`(simulação) publicaria ${post.id} · ${post.tipo} · mídias ok em ${new URL(urls[0]).host}`);
    } catch (e) {
      falhas++;
      log(`✖ (simulação) ${post.id}: ${e.message}`);
    }
    continue;
  }
  try {
    log(`→ Publicando ${post.id} (${post.tipo})...`);
    const r = await publicar(post, igUserId);
    publicados[post.id] = { ...r, tipo: post.tipo, publicadoEm: new Date().toISOString() };
    fs.writeFileSync(ARQ_PUBLICADOS, JSON.stringify(publicados, null, 2) + '\n');
    log(`✔ ${post.id} publicado ${r.permalink || `(media ${r.mediaId})`}`);
  } catch (e) {
    falhas++;
    log(`✖ ${post.id}: ${e.message}`);
  }
}

salvarResumo();
process.exit(falhas ? 1 : 0);
