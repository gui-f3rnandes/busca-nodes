// Função serverless (Vercel) que serve como "banco de dados" compartilhado da aplicação.
//
// GET  /api/nodes            -> { nodes, version } — base atual e um identificador de versão.
// GET  /api/nodes?history=1  -> { history: [{id, version, publishedAt, description, current?}, ...] }
//      — a versão atual (current:true) seguida das publicações anteriores, da mais nova à mais antiga.
// POST /api/nodes  { action:'publish', nodes, baseVersion, description } -> publica uma nova base.
//      "description" (obrigatória) é um resumo curto das alterações; aparece no histórico.
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
// Índice {versão: descrição} das publicações, para o histórico listar as descrições sem precisar
// abrir cada snapshot (cada um tem a base inteira). A descrição também fica dentro do próprio
// snapshot, então o índice é só um atalho — se ele falhar, nenhuma publicação é perdida.
const META_PATHNAME = 'history_meta.json';
const DESCRIPTION_MAX = 300;

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

async function writeLive(nodes, description) {
  const version = String(Date.now());
  await put(LIVE_PATHNAME, JSON.stringify({version, description, nodes}), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return version;
}

// Devolve a lista de versões que continuam no histórico (ou null se não havia o que arquivar).
async function snapshotCurrentLive(current) {
  if (!current) return null; // nada publicado ainda, não tem o que arquivar
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
  return sorted.slice(0, HISTORY_KEEP).map(b => versionFromPathname(b.pathname));
}

// A versão é o próprio Date.now() do momento da publicação (ver writeLive), então dá pra
// descobrir a data de publicação a partir dela.
function versionFromPathname(pathname) {
  return String(pathname).slice(HISTORY_PREFIX.length).replace(/\.json$/, '');
}

function toIso(value) {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d) ? null : d.toISOString();
}

function versionToIso(version, fallback) {
  const n = Number(version);
  return (Number.isFinite(n) && n > 0 ? toIso(n) : null) || fallback || null;
}

async function readMeta() {
  try {
    const result = await get(META_PATHNAME, {access: 'private'});
    if (result && result.stream) {
      const parsed = JSON.parse(await new Response(result.stream).text());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    // Ainda não existe índice — normal até a primeira publicação com descrição.
  }
  return {};
}

// Registra a descrição da nova versão e poda entradas de versões que saíram do histórico.
// Falhar aqui não pode derrubar a publicação (a descrição já está salva dentro da base).
async function recordDescription(version, description, keptVersions) {
  try {
    const meta = await readMeta();
    meta[version] = description;
    if (Array.isArray(keptVersions)) {
      const keep = new Set([...keptVersions, version]);
      for (const key of Object.keys(meta)) if (!keep.has(key)) delete meta[key];
    }
    await put(META_PATHNAME, JSON.stringify(meta), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
  } catch (err) {
    console.error('Erro ao atualizar índice de descrições do histórico:', err);
  }
}

function findDuplicateNodes(nodes) {
  // Um mesmo node pode existir em VLANs diferentes. Ele só é duplicado quando a
  // combinação de node e VLAN se repete.
  const seen = new Map();
  for (const item of nodes) {
    const node = String(item?.Node ?? '').trim().toLowerCase();
    // "-" representa um node ainda não identificado; ele não deve bloquear outros registros.
    if (!node || node === '-') continue;
    const vlan = String(item?.VLAN ?? '').trim().toLowerCase();
    const key = `${node}\u0000${vlan}`;
    const entry = seen.get(key) || {node, vlan, count: 0};
    entry.count += 1;
    seen.set(key, entry);
  }
  return [...seen.values()]
    .filter(({count}) => count > 1)
    .map(({node, vlan}) => vlan ? `${node} (VLAN ${vlan})` : `${node} (VLAN não informada)`);
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    if (request.query?.history) {
      try {
        const [{blobs}, live, meta] = await Promise.all([
          list({prefix: HISTORY_PREFIX, limit: HISTORY_KEEP}),
          readLive(),
          readMeta(),
        ]);
        const history = blobs
          .map(b => {
            const version = versionFromPathname(b.pathname);
            return {
              id: b.pathname,
              version,
              publishedAt: versionToIso(version, toIso(b.uploadedAt)),
              description: meta[version] || null,
            };
          })
          .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        if (live && live.version) {
          const version = String(live.version);
          // A versão que está no ar ainda não foi arquivada; entra no topo, sem opção de restaurar.
          history.unshift({
            id: null,
            version,
            publishedAt: versionToIso(version, null),
            description: live.description || meta[version] || null,
            current: true,
          });
        }
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
        const restoredAt = versionToIso(snapshot.version ?? versionFromPathname(id), null);
        const when = restoredAt
          ? new Date(restoredAt).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'})
          : 'data desconhecida';
        const description = `Restaurada a versão de ${when}`;
        const kept = await snapshotCurrentLive(current); // preserva o estado atual antes de restaurar
        const version = await writeLive(snapshot.nodes, description);
        await recordDescription(version, description, kept);
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

    const description = typeof body.description === 'string' ? body.description.trim().slice(0, DESCRIPTION_MAX) : '';
    if (!description) {
      return response.status(400).json({error: 'Descreva brevemente as alterações antes de publicar.'});
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

      const kept = await snapshotCurrentLive(current);
      const version = await writeLive(payload, description);
      await recordDescription(version, description, kept);
      return response.status(200).json({ok: true, count: payload.length, version});
    } catch (err) {
      console.error('Erro ao salvar no Vercel Blob:', err);
      return response.status(500).json({error: `Erro ao salvar no Vercel Blob: ${err?.message || err}`});
    }
  }

  response.setHeader('Allow', 'GET, POST');
  return response.status(405).json({error: 'Método não permitido.'});
}
