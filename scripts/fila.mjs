// Gera site/fila.json com todos os posts, para o painel (GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import { listarPosts, RAIZ } from './posts.mjs';

const fila = listarPosts().map((p) => {
  const base = `posts/${p.id}/`;
  const midias = p.midias.map((m) => base + m);
  const capa = p.capa ? base + p.capa : p.tipo === 'reel' ? null : midias[0] || null;
  return {
    id: p.id,
    quando: p.quando.toISOString(),
    data: p.data,
    hora: p.hora,
    tipo: p.tipo,
    pausado: p.pausado,
    erros: p.erros,
    legenda: p.legenda,
    midias,
    capa,
  };
});

const destino = path.join(RAIZ, 'site', 'fila.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify({ geradoEm: new Date().toISOString(), posts: fila }, null, 2));
console.log(`fila.json: ${fila.length} posts`);
