-- ============================================================
-- Solara OS - Motor: tabelas execucoes_agentes e aprovacoes
-- Cole no SQL Editor do Supabase e execute.
-- A tabela perfis ja existe e NAO e recriada aqui.
-- ============================================================

-- ------------------------------------------------------------
-- execucoes_agentes  (SPEC 3.1)
-- ------------------------------------------------------------
create table if not exists public.execucoes_agentes (
  id             uuid primary key default gen_random_uuid(),
  area           text not null,                    -- 'vendas' ou 'financeiro'
  item_tipo      text not null,                    -- 'pedido' ou 'divergencia'
  item_id        text not null,                    -- cod_pedido ou id da divergencia
  agente         text not null,                    -- triador, pesquisador, redator, revisor,
                                                   -- investigador, consolidador, orquestrador
  chamado_por    uuid references public.execucoes_agentes(id) on delete set null,
  status         text not null default 'rodando',  -- 'rodando', 'ok', 'erro'
  entrada        jsonb,
  saida          jsonb,
  erro           text,
  tokens_entrada int,
  tokens_saida   int,
  inicio         timestamptz not null default now(),
  fim            timestamptz
);

create index if not exists execucoes_agentes_item_id_idx on public.execucoes_agentes (item_id);
create index if not exists execucoes_agentes_area_idx     on public.execucoes_agentes (area);

alter table public.execucoes_agentes enable row level security;

-- Organograma e LinhaDoTempo leem do browser: usuario autenticado pode ler.
drop policy if exists "execucoes_leitura_autenticados" on public.execucoes_agentes;
create policy "execucoes_leitura_autenticados"
  on public.execucoes_agentes for select
  to authenticated
  using (true);

-- A escrita e feita no servidor pela funcao agente() com a chave secreta
-- (service role), que ignora RLS. Por isso nao ha policy de insert/update.

-- Realtime: enviar a linha inteira nos eventos de UPDATE.
alter table public.execucoes_agentes replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.execucoes_agentes;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- aprovacoes  (SPEC 3.4)
-- ------------------------------------------------------------
create table if not exists public.aprovacoes (
  id           uuid primary key default gen_random_uuid(),
  area         text not null,
  item_tipo    text not null,
  item_id      text not null,
  titulo       text not null,                     -- resumo em uma linha
  proposta     jsonb,                             -- o que os agentes propoem
  status       text not null default 'pendente',  -- 'pendente','aprovada','editada','rejeitada'
  decidido_por uuid references public.perfis(id) on delete set null,
  decidido_em  timestamptz,
  observacao   text,
  criado_em    timestamptz not null default now() -- (extra ao SPEC: ordena a fila)
);

create index if not exists aprovacoes_area_status_idx on public.aprovacoes (area, status);
create index if not exists aprovacoes_item_id_idx     on public.aprovacoes (item_id);

alter table public.aprovacoes enable row level security;

-- FilaAprovacao le do browser.
drop policy if exists "aprovacoes_leitura_autenticados" on public.aprovacoes;
create policy "aprovacoes_leitura_autenticados"
  on public.aprovacoes for select
  to authenticated
  using (true);

-- A Marcela / o Rafael decidem na fila pelo browser: precisam atualizar a linha.
drop policy if exists "aprovacoes_decisao_autenticados" on public.aprovacoes;
create policy "aprovacoes_decisao_autenticados"
  on public.aprovacoes for update
  to authenticated
  using (true)
  with check (true);

-- A criacao de itens na fila e feita no servidor pelos orquestradores (chave secreta).

alter table public.aprovacoes replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.aprovacoes;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- (OPCIONAL) policy de leitura em perfis
-- Rode este bloco se a tela / (menu de areas) ou /admin aparecerem
-- vazias: significa que perfis esta com RLS ligado e sem policy de
-- leitura do proprio perfil.
-- ------------------------------------------------------------
-- alter table public.perfis enable row level security;
-- drop policy if exists "perfis_le_o_proprio" on public.perfis;
-- create policy "perfis_le_o_proprio"
--   on public.perfis for select
--   to authenticated
--   using (id = auth.uid());
