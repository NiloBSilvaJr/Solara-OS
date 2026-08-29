# Solara OS

Sistema interno da **Solara Distribuidora** (peças e insumos industriais, Betim/MG). Agentes de IA fazem a parte repetitiva de **Vendas** (responder pedidos de orçamento) e **Financeiro** (conciliar extrato bancário com títulos a receber); **as pessoas decidem** — nenhuma resposta sai do sistema sem aprovação humana.

Documentos de referência: [`PRD.md`](PRD.md) (o problema, em linguagem de negócio) e [`SPEC.md`](SPEC.md) (o que construir, por seção). As regras de implementação estão em [`CLAUDE.md`](CLAUDE.md).

## Princípios

1. **A máquina prepara, a pessoa decide.** Toda decisão de negócio passa por uma fila de aprovação humana.
2. **Tudo registrado.** Cada execução de agente grava entrada, saída, tokens, tempo e quem chamou.
3. **Um motor, várias áreas.** A segunda área custa uma fração da primeira.
4. **Modelo só onde precisa interpretar.** Limpar arquivo, casar valores e conferir estoque é código determinístico, não IA.

## Stack

- **Next.js** (App Router) + **TypeScript**, deploy na **Vercel**
- **Supabase**: Auth (e-mail e senha), Postgres, Realtime
- **API da Anthropic** pelo SDK oficial — modelo `claude-sonnet-4-6`
- CSS simples (sem biblioteca de UI pesada)

Tudo em português: tabelas, colunas, componentes, variáveis e mensagens de tela. Identificadores sem acento (`execucoes_agentes`).

## Pré-requisitos

- Node.js 20+ e npm
- Um projeto Supabase (com as tabelas do ERP já importadas dos CSVs de [`dados/`](dados/))
- Uma chave de API da Anthropic

## Configuração

### 1. Variáveis de ambiente

Crie `.env.local` na raiz (não é versionado):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx   # chave pública (browser)
SUPABASE_SECRET_KEY=sb_secret_xxx                         # chave secreta (só em rotas de API)
ANTHROPIC_API_KEY=sk-ant-xxx                              # necessária a partir do Motor
```

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` é usada no cliente do browser e no middleware.
- `SUPABASE_SECRET_KEY` (service role) só é usada em rotas de API no servidor, via `utils/supabase/admin.ts`. **Nunca** importe esse arquivo em componentes de cliente.

### 2. Instalar dependências

```bash
npm install
```

### 3. Criar o primeiro usuário

Não há cadastro público. No painel do Supabase → **Authentication → Users**, crie o usuário do administrador (e-mail + senha). A partir da seção *Casca*, o admin cria os demais usuários pela tela `/admin`.

## Rodar

```bash
npm run dev      # desenvolvimento em http://localhost:3000
npm run build    # build de produção
npm run start    # servir o build
```

Abrir `http://localhost:3000`:

- Sem sessão → redireciona para `/login`.
- Após o login → volta para `/`, que mostra "Solara OS" e o e-mail do usuário, com botão **Sair**.

## Estrutura

```
app/
  layout.tsx            layout raiz
  page.tsx              página inicial protegida (redireciona para /login sem sessão)
  login/
    page.tsx            formulário de e-mail e senha
    actions.ts          server actions: entrar() e sair()
utils/supabase/
  client.ts             cliente Supabase para o browser (chave pública)
  server.ts             cliente Supabase para Server Components / actions
  middleware.ts         cliente Supabase para o middleware
  admin.ts              cliente com chave secreta — SÓ em rotas de API
middleware.ts           mantém a sessão do Supabase atualizada a cada requisição
lib/                    código comum (orquestradores, função agente) — a partir do Motor
components/             componentes React compartilhados — a partir do Motor
prompts/<area>/<papel>.md   system prompt de cada agente (lido em runtime, nunca copiado no código)
dados/                  CSVs exportados do ERP
```

## Modelo de autenticação

- Login por **e-mail e senha** via Supabase Auth. Sem OAuth, sem cadastro público.
- O middleware (`middleware.ts` + `utils/supabase/middleware.ts`) renova os cookies de sessão a cada requisição.
- Páginas protegidas checam `supabase.auth.getUser()` no servidor e redirecionam para `/login` quando não há usuário.

## Agentes (a partir do Motor)

Uma única função `agente(papel, entrada, contexto)` em `lib/agente.ts` centraliza toda chamada à Anthropic. Cada papel — `triador`, `pesquisador`, `redator`, `revisor`, `investigador`, `consolidador` — tem seu system prompt em `prompts/<area>/<papel>.md`. Todo agente devolve JSON estrito e grava em `execucoes_agentes` (início `rodando`, fim `ok`/`erro`). A orquestração é código comum em `lib/orquestradores/`; o modelo nunca decide qual agente chamar.

## Status

| Seção | Estado |
|---|---|
| **Fundação** — projeto Next.js, Supabase Auth, `/login`, `/` protegida | ✅ concluída |
| **Casca** — menu de áreas, `/admin`, criação de usuários | ✅ concluída |
| **Motor** — `agente()`, `execucoes_agentes`, `aprovacoes`, `Organograma`, `FilaAprovacao`, `LinhaDoTempo` | ✅ concluída |
| **Vendas** — `/vendas`, kanban de pedidos, orquestrador (`triador`→`pesquisador`→`redator`→`revisor`) | ✅ concluída |
| **Financeiro** — `/financeiro`, importação e conciliação de extrato | pendente |

### SQL a aplicar no Supabase

Rodar no SQL Editor, na ordem: `supabase/motor.sql` (tabelas `execucoes_agentes` e `aprovacoes`, RLS, Realtime) e `supabase/vendas.sql` (Realtime em `pedidos_orcamento`). A tabela `perfis` e as tabelas do ERP já existem.

## Escopo fora desta versão

E-mail de entrada/saída automático; envio da resposta ao cliente; integração automática com o ERP (a carga é por CSV); login por Google ou outro provedor; áreas além de Vendas e Financeiro.
