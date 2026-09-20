// Função serverless (Vercel) que serve como "banco de dados" compartilhado da aplicação.
//
// GET  /api/nodes            -> { nodes, version } — base atual e um identificador de versão.
// GET  /api/nodes?history=1  -> { history: [{id, uploadedAt}, ...] } — publicações recentes.
// POST /api/nodes  { action:'publish', nodes, baseVersion } -> publica uma nova base.
//      Se baseVersion não bater com a versão atual do servidor (alguém publicou antes de
//      você), devolve 409 em vez de sobrescrever silenciosamente.
// POST /api/nodes  { action:'restore', id } -> restaura uma versão antiga do histórico.
// Ambos os POSTs exigem o cabeçalho X-Edit-Password com a senha (NODES_EDIT_PASSWORD).
//
// O Blob Store deste projeto é PRIVADO: toda leitura usa get({access:'private'}) e toda
// escrita usa put({access:'private'}).
import {put, get, list, del} from '@vercel/blob';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// Base empacotada junto com o deploy — usada só enquanto ninguém publicou nada ainda.
const fallbackData = require('../src/nodes_data.json');

const LIVE_PATHNAME = 'nodes_data.json';
const HISTORY_PREFIX = 'history/';
const HISTORY_KEEP = 15; // quantas publicações antigas manter

async function readLive() {
  try {
    const result = await get(LIVE_PATHNAME, {access: 'private'});
    if (result && result.stream) {
      const text = await new Response(result.stream).text();
      return JSON.parse(text); // {version, nodes}
    }
  } catch (err) {
    // Ainda não existe nada publicado — comportamento normal na primeira vez.
  }
  return null;
}

async function writeLive(nodes) {
  const version = String(Date.now());
  await put(LIVE_PATHNAME, JSON.stringify({version, nodes}), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return version;
}

async function snapshotCurrentLive(current) {
  if (!current) return; // nada publicado ainda, não tem o que arquivar
  const id = `${HISTORY_PREFIX}${current.version || Date.now()}.json`;
  await put(id, JSON.stringify(current), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  // Poda histórico antigo, mantendo só as HISTORY_KEEP publicações mais recentes.
  const {blobs} = await list({prefix: HISTORY_PREFIX, limit: 200});
  const sorted = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const toDelete = sorted.slice(HISTORY_KEEP);
  await Promise.all(toDelete.map(b => del(b.url).catch(() => {})));
}

function findDuplicateNodes(nodes) {
  // Node se repete de propósito entre cidades/POPs diferentes (a numeração é mais ou
  // menos independente por cidade) — só conta como duplicado quando o MESMO node
  // aparece de novo na MESMA cidade/POP.
  const seen = new Map();
  for (const item of nodes) {
    const node = String(item?.Node ?? '').trim().toLowerCase();
    if (!node) continue;
    const cidade = String(item?.Cidade_POP ?? '').trim().toLowerCase();
    const key = `${node}|${cidade}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => { const [node, cidade] = key.split('|'); return cidade ? `${node} (${cidade})` : node; });
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    if (request.query?.history) {
      try {
        const {blobs} = await list({prefix: HISTORY_PREFIX, limit: HISTORY_KEEP});
        const history = blobs
          .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
          .map(b => ({id: b.pathname, uploadedAt: b.uploadedAt}));
        return response.status(200).json({history});
      } catch (err) {
        console.error('Erro ao listar histórico:', err);
        return response.status(200).json({history: []});
      }
    }

    const live = await readLive();
    if (live && Array.isArray(live.nodes)) {
      return response.status(200).json({nodes: live.nodes, version: live.version});
    }
    return response.status(200).json({nodes: fallbackData, version: null});
  }

  if (request.method === 'POST') {
    const configured = process.env.NODES_EDIT_PASSWORD;
    // Cabeçalho próprio (não "Authorization") para não colidir com o Basic Auth do
    // middleware.js que protege o site inteiro.
    const sent = request.headers['x-edit-password'] || '';
    if (!configured) {
      return response.status(500).json({error: 'Servidor sem NODES_EDIT_PASSWORD configurada. Defina essa variável de ambiente no projeto Vercel antes de salvar alterações.'});
    }
    if (sent !== configured) {
      return response.status(401).json({error: 'Senha inválida.'});
    }

    const body = request.body || {};
    const action = body.action || 'publish';

    if (action === 'restore') {
      const id = body.id;
      if (!id || !id.startsWith(HISTORY_PREFIX)) {
        return response.status(400).json({error: 'Identificador de histórico inválido.'});
      }
      try {
        const result = await get(id, {access: 'private'});
        if (!result || !result.stream) {
          return response.status(404).json({error: 'Essa versão do histórico não foi encontrada (pode já ter sido removida).'});
        }
        const text = await new Response(result.stream).text();
        const snapshot = JSON.parse(text);
        const current = await readLive();
        await snapshotCurrentLive(current); // preserva o estado atual antes de restaurar
        const version = await writeLive(snapshot.nodes);
        return response.status(200).json({ok: true, count: snapshot.nodes.length, version});
      } catch (err) {
        console.error('Erro ao restaurar versão do histórico:', err);
        return response.status(500).json({error: `Erro ao restaurar: ${err?.message || err}`});
      }
    }

    // action === 'publish'
    const payload = body.nodes;
    if (!Array.isArray(payload) || !payload.length) {
      return response.status(400).json({error: 'O corpo enviado precisa ser uma lista (array) de nodes, com pelo menos 1 item.'});
    }

    const duplicates = findDuplicateNodes(payload);
    if (duplicates.length) {
      return response.status(400).json({error: `Existem nodes duplicados nesta base: ${duplicates.join(', ')}. Corrija antes de publicar.`});
    }

    try {
      const current = await readLive();
      const currentVersion = current?.version ?? null;
      const baseVersion = body.baseVersion ?? null;
      if (currentVersion !== null && String(currentVersion) !== String(baseVersion)) {
        return response.status(409).json({
          error: 'Alguém publicou uma versão mais nova enquanto você editava. Clique em "Descartar alterações" para recarregar a base atual e refazer sua edição por cima dela.',
          conflict: true,
        });
      }

      await snapshotCurrentLive(current);
      const version = await writeLive(payload);
      return response.status(200).json({ok: true, count: payload.length, version});
    } catch (err) {
      console.error('Erro ao salvar no Vercel Blob:', err);
      return response.status(500).json({error: `Erro ao salvar no Vercel Blob: ${err?.message || err}`});
    }
  }

  response.setHeader('Allow', 'GET, POST');
  return response.status(405).json({error: 'Método não permitido.'});
}
