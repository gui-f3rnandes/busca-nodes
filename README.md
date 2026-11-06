# 🔎 Busca de Nodes — EPON / GPON

Interface web para consultar rapidamente a infraestrutura de rede da **NR Conexões**: dado um node, uma VLAN, uma OLT ou um bairro, o sistema mostra a linha correspondente com todos os dados daquele ponto (POP, OLT, PON, VLAN, DIO, gerência etc.).

A base é **compartilhada**: qualquer pessoa autorizada pode importar uma nova versão dos dados, publicar para todos e, se precisar, voltar para uma versão anterior pelo histórico.

---

## ✨ Funcionalidades

- **Busca instantânea** por node, VLAN, OLT, bairro ou qualquer parte do texto. Funciona mesmo digitando só um dos números de nodes combinados (ex.: `93 / 27`).
- **Página inicial em quadro:** POPs → OLTs → PONs. Nada de lista gigante aberta: clique num POP, depois numa OLT, e veja a tabela de PONs com node, bairro e VLAN.
- **Filtros** por tecnologia (EPON / GPON) e por cidade/POP.
- **Botões de copiar** em node, bairro, OLT e VLAN, mais o **"Copiar tudo"**, que copia node, bairro, VLAN, OLT, porta e DIO numa linha só.
- **Adicionar e editar nodes** direto na interface, com comparação *antes/depois*.
- **Importar / Exportar JSON** da base inteira.
- **"Salvar para todos"** com descrição obrigatória das alterações, que vai para o histórico.
- **Histórico de publicações** (últimas 15) com restauração de qualquer versão. O estado atual é arquivado antes de restaurar, então nada se perde.
- **Últimas alterações** em destaque na página inicial.
- **Proteção contra conflitos:** se duas pessoas publicarem quase ao mesmo tempo, quem chega depois recebe um aviso em vez de sobrescrever.
- **Bloqueio de duplicados:** não aceita dois registros com o mesmo node **e** a mesma VLAN.
- **Login único** para acessar o site e uma **senha de edição** separada para publicar.
- **Responsivo:** menu em dropdown e tabelas compactas no celular.

---

## 🧱 Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | [Vite](https://vitejs.dev/) + [React](https://react.dev/) |
| Hospedagem | [Vercel](https://vercel.com/) |
| API | Função serverless (`api/nodes.js`) |
| Armazenamento | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (privado) |
| Proteção do site | Middleware com HTTP Basic Auth (`middleware.js`) |

---

## 📁 Estrutura do projeto

```
busca-nodes/
├── api/
│   └── nodes.js          # API: leitura, publicação, histórico e restauração
├── public/
│   └── logo.png
├── src/
│   ├── main.jsx          # aplicação React (busca, quadro, edição, histórico)
│   ├── styles.css        # estilos
│   └── nodes_data.json   # base inicial (usada até a primeira publicação)
├── index.html
├── middleware.js         # login único do site (Basic Auth)
├── package.json
└── SETUP.md              # passo a passo de configuração no Vercel
```

---

## 🚀 Como rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- Conta no [Vercel](https://vercel.com/) (para a base compartilhada e o login)

### Localmente

```bash
# instalar dependências
npm install

# só a interface (usa a base empacotada em src/nodes_data.json;
# a API /api/nodes não existe neste modo)
npm run dev

# interface + API + middleware, como em produção
npx vercel dev
```

### Build de produção

```bash
npm run build     # gera a pasta dist/
npm run preview   # serve o build localmente
```

---

## ☁️ Deploy no Vercel

1. Importe o repositório no Vercel (ele detecta o Vite automaticamente).
2. Em **Storage → Create Database → Blob**, crie o Blob Store e conecte ao projeto. Isso cria a variável `BLOB_READ_WRITE_TOKEN` sozinho.
3. Em **Settings → Environment Variables** (escopo **deste projeto**, não "Shared / All Projects"), defina:

| Variável | Obrigatória | Descrição |
| --- | :---: | --- |
| `SITE_PASSWORD` | ✅ | Senha compartilhada para **entrar no site**. Sem ela, o middleware bloqueia o acesso de todos. |
| `SITE_USER` | ➖ | Usuário do login do site. Padrão: `nrtelecom`. |
| `NODES_EDIT_PASSWORD` | ✅ | Senha para **publicar** e **restaurar** versões da base. |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Criada automaticamente ao conectar o Blob Store. |

4. Faça o **redeploy** para as variáveis entrarem em vigor.

Mais detalhes no [`SETUP.md`](./SETUP.md).

---

## 📖 Como usar no dia a dia

1. **Consultar:** digite na busca ou navegue pelo quadro (POP → OLT → PON).
2. **Atualizar a base:**
   1. *(opcional)* baixe a base atual em **Exportar JSON** e edite;
   2. clique em **Importar JSON** e escolha o arquivo. Isso só atualiza a tela de quem importou;
   3. clique em **Salvar para todos**, descreva o que mudou e informe a senha de edição.
3. **Corrigir um engano:** use **Descartar alterações** (antes de publicar) ou **Histórico → Restaurar esta versão** (depois de publicar).

> ⚠️ **Importante:** a base que o site mostra é a publicada no **Vercel Blob**. Editar apenas o arquivo `src/nodes_data.json` no repositório **não** altera o que as pessoas veem depois da primeira publicação. Esse arquivo é só a base inicial. Para atualizar, use **Importar JSON → Salvar para todos**.

---

## 🗂️ Formato dos dados

A base é uma lista (*array*) de objetos JSON, um por PON:

| Campo | Descrição |
| --- | --- |
| `Tecnologia` | `GPON` ou `EPON` |
| `Cidade_POP` | Cidade / POP |
| `Node` | Identificação do node (pode ser combinado, ex.: `93 / 27`) |
| `Bairro` | Bairro ou condomínio atendido |
| `OLT` | Nome da OLT |
| `PON` | Porta PON |
| `VLAN` | VLAN do node |
| `Qtd_Clientes` | Quantidade de clientes |
| `DSW_Uplink` | DSW / uplink |
| `DIO` | Identificação do DIO / fibra |
| `Observacao` | Observação livre |
| `IP_Gerencia` | IP de gerência do equipamento |
| `Equipamento` | Equipamento |
| `Usuario_Gerencia` | Usuário de gerência |
| `Senha_Gerencia` | Senha de gerência |
| `Info_Gerencia` | Outras informações de gerência |

Exemplo:

```json
{
  "Tecnologia": "GPON",
  "Cidade_POP": "EXEMPLO(SP)",
  "Node": "1000",
  "Bairro": "BAIRRO EXEMPLO",
  "OLT": "OLT-EXEMPLO-01",
  "PON": "1",
  "VLAN": "100",
  "Qtd_Clientes": "30",
  "DSW_Uplink": "",
  "DIO": "DIO-01-TUBO-01-FIBRA-01",
  "Observacao": "",
  "IP_Gerencia": "10.0.0.1",
  "Equipamento": "",
  "Usuario_Gerencia": "",
  "Senha_Gerencia": "",
  "Info_Gerencia": ""
}
```

---

## 🔐 Segurança

Os dados incluem **IPs e senhas de gerência de equipamentos**. Por isso:

- ⚠️ **Mantenha este repositório PRIVADO.** O arquivo `src/nodes_data.json` contém dados reais de gerência. Se o repositório precisar ser público, troque esse arquivo por uma base de exemplo (sem dados reais) antes de publicar.
- Nunca faça *commit* de arquivos `.env`. Eles já estão no `.gitignore`.
- O site inteiro (páginas, arquivos e `/api/*`) fica atrás do login do `middleware.js`.
- Publicar e restaurar exigem uma segunda senha (`NODES_EDIT_PASSWORD`), enviada pelo cabeçalho `X-Edit-Password`, separado do cabeçalho do Basic Auth para evitar conflito.
- O Blob Store do projeto deve ser **privado**. Toda leitura e escrita da API usa `access: 'private'`.
- Para trocar as senhas, basta atualizar as variáveis no Vercel e fazer o redeploy. Não é preciso mexer no código.

---

## 🔌 API

Todas as rotas ficam atrás do login do site.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/nodes` | Base atual e identificador de versão: `{ nodes, version }` |
| `GET` | `/api/nodes?history=1` | Versão atual + publicações anteriores: `{ history: [...] }` |
| `POST` | `/api/nodes` | `{ action: "publish", nodes, baseVersion, description }`, publica uma nova base. Devolve `409` se alguém publicou antes de você. |
| `POST` | `/api/nodes` | `{ action: "restore", id }`, restaura uma versão do histórico |

Os dois `POST` exigem o cabeçalho `X-Edit-Password`.

---

## 🏢 Sobre

Ferramenta interna da **NR Conexões que Fortalecem**, usada pelo suporte e pelo NOC para consultar a rede de fibra óptica (EPON/GPON) com rapidez.

Uso interno. Todos os direitos reservados.
