// Função serverless (Vercel) que serve como "banco de dados" compartilhado da aplicação.
// GET  -> devolve a base atual (a que estiver salva no Vercel Blob; se nunca foi salva
//         nada ainda, cai para o nodes_data.json que vai dentro do próprio projeto).
// POST -> recebe uma nova lista de nodes e substitui a base salva no Vercel Blob,
//         tornando-a a nova base "oficial" para todos os visitantes do site.
//         Protegido por senha (variável de ambiente NODES_EDIT_PASSWORD).
//
// O Blob Store deste projeto está configurado como PRIVADO, então toda leitura/escrita
// usa access:'private' e o método get() (em vez de list()+fetch(url), que só funciona
// com stores públicas).
import {put, get} from '@vercel/blob';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// Base empacotada junto com o deploy — usada só enquanto ninguém salvou nada no Blob ainda.
const fallbackData = require('../src/nodes_data.json');

const PATHNAME = 'nodes_data.json';

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      const result = await get(PATHNAME, {access: 'private'});
      if (result && result.stream) {
        const text = await new Response(result.stream).text();
        const data = JSON.parse(text);
        return response.status(200).json(data);
      }
    } catch (err) {
      // Ainda não existe nada salvo no Blob (primeira vez) ou erro momentâneo:
      // cai para a base padrão do projeto, sem quebrar a página.
      console.error('Não foi possível ler do Vercel Blob, usando base padrão do projeto:', err);
    }
    return response.status(200).json(fallbackData);
  }

  if (request.method === 'POST') {
    const configured = process.env.NODES_EDIT_PASSWORD;
    // Importante: usamos um cabeçalho próprio (não "Authorization") para a senha de
    // publicação, para não colidir com o Basic Auth do middleware.js que protege o site.
    const sent = request.headers['x-edit-password'] || '';
    if (!configured) {
      return response.status(500).json({error: 'Servidor sem NODES_EDIT_PASSWORD configurada. Defina essa variável de ambiente no projeto Vercel antes de salvar alterações.'});
    }
    if (sent !== configured) {
      return response.status(401).json({error: 'Senha inválida.'});
    }

    const payload = request.body;
    if (!Array.isArray(payload) || !payload.length) {
      return response.status(400).json({error: 'O corpo enviado precisa ser uma lista (array) de nodes, com pelo menos 1 item.'});
    }

    try {
      await put(PATHNAME, JSON.stringify(payload), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
      return response.status(200).json({ok: true, count: payload.length});
    } catch (err) {
      console.error('Erro ao salvar no Vercel Blob:', err);
      return response.status(500).json({error: `Erro ao salvar no Vercel Blob: ${err?.message || err}`});
    }
  }

  response.setHeader('Allow', 'GET, POST');
  return response.status(405).json({error: 'Método não permitido.'});
}