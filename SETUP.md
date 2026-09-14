# Configurar a base compartilhada e o login do site (Vercel)

Duas coisas foram adicionadas: (1) um login único compartilhado para acessar o
site inteiro, e (2) uma base compartilhada para importar/publicar novas versões
dos dados. Veja como ativar cada uma.

## A) Login único compartilhado (acesso ao site)

Foi adicionado um `middleware.js` na raiz do projeto que exige usuário e senha
(HTTP Basic Auth — o navegador mostra a caixa de login nativa, sem precisar de
tela de login própria) para acessar **qualquer página do site**, incluindo a
API.

No painel do Vercel, em **Project → Settings → Environment Variables**, adicione:

- `SITE_PASSWORD` = a senha compartilhada da equipe (obrigatória — sem ela, o
  middleware bloqueia o acesso de todo mundo por segurança)
- `SITE_USER` = o usuário (opcional; se não definir, o padrão é `nrtelecom`)

Depois de configurar, redeploy. Todo visitante vai precisar digitar esse
usuário/senha uma vez no navegador para entrar (o navegador lembra depois,
então não é preciso digitar de novo a cada visita).

Se um dia quiser trocar a senha, é só atualizar `SITE_PASSWORD` no Vercel e
redeployar — não precisa mexer no código.

## B) Base compartilhada (importar/exportar/publicar dados)

Agora existe uma função `/api/nodes.js` que guarda a base de nodes no **Vercel Blob**,
de forma que quando alguém importa um novo `.json` e clica em **"Salvar para todos"**,
a alteração passa a valer para **qualquer pessoa que acessar o site** (não só no
navegador de quem importou).

Passos para ativar isso no projeto já hospedado no Vercel:

### 1. Criar o Blob Store
No painel do Vercel: **Project → Storage → Create Database → Blob**, e conectar ao
seu projeto. Isso cria automaticamente a variável de ambiente `BLOB_READ_WRITE_TOKEN`
— não precisa copiar nada manualmente.

### 2. Definir a senha de edição
Ainda em **Project → Settings → Environment Variables**, adicione:

- `NODES_EDIT_PASSWORD` = a senha que a equipe vai usar para publicar novas bases
  (pode ser igual ou diferente da `SITE_PASSWORD` do item A — uma protege quem
  *entra* no site, a outra protege quem pode *sobrescrever* os dados).

### 3. Redeploy
Faça um novo deploy (push no git, ou "Redeploy" no painel) para que as variáveis
de ambiente, o `middleware.js` e a nova função `/api/nodes` entrem em vigor.

## Como usar no dia a dia
1. Prepare o novo `.json` (pode exportar a base atual pelo botão **"Exportar JSON"**,
   editar, e depois importar de novo).
2. Clique em **"Importar JSON"** e escolha o arquivo — isso só atualiza a tela de
   quem importou, ainda não é público.
3. Clique em **"Salvar para todos"**, digite a `NODES_EDIT_PASSWORD` e pronto: a
   base fica publicada no Vercel Blob e passa a ser a que todo mundo vê a partir daí
   (inclusive sobrevive a novos deploys do site).
4. Se importar algo por engano, use **"Descartar alterações"** para recarregar a
   base publicada atualmente, sem precisar dar refresh na página.

## Observação sobre segurança
Com o login do item A) ativo, ninguém de fora consegue nem carregar a página sem
o usuário/senha compartilhado — isso já cobre o acesso aos dados de gerência
(IP, usuário, senha de equipamentos), que antes ficavam acessíveis a qualquer
pessoa com o link. A `NODES_EDIT_PASSWORD` é uma segunda trava, específica para
quem pode *publicar* uma nova base para todo mundo, mesmo já estando logado no site.
