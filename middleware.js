// Protege TODO o site (páginas, assets e /api/*) com um único usuário/senha
// compartilhado (HTTP Basic Auth) — o navegador mostra a caixa de login nativa.
// Configure as variáveis de ambiente no projeto Vercel:
//   SITE_USER     -> usuário (padrão: "nrtelecom" se não definido)
//   SITE_PASSWORD -> senha (obrigatória; sem ela, ninguém consegue entrar)
import {next} from '@vercel/functions';

export default function middleware(request) {
  const expectedUser = process.env.SITE_USER || 'nrtelecom';
  const expectedPass = process.env.SITE_PASSWORD;

  if (!expectedPass) {
    // Sem senha configurada no Vercel, é mais seguro bloquear do que deixar o site aberto.
    return new Response('Site não configurado: defina SITE_PASSWORD nas variáveis de ambiente do projeto.', {status: 500});
  }

  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Basic ')) {
    const decoded = atob(auth.slice(6));
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === expectedUser && pass === expectedPass) {
      return next();
    }
  }

  return new Response('Autenticação necessária.', {
    status: 401,
    headers: {'WWW-Authenticate': 'Basic realm="Busca de nodes - acesso restrito", charset="UTF-8"'},
  });
}
