-- ============================================================
-- Solara OS - Financeiro: tabelas da conciliacao (SPEC 5.1)
-- Cole no SQL Editor do Supabase e execute.
-- titulos_receber e as demais tabelas do ERP ja existem.
-- ============================================================

-- ---------- extratos_importados ----------
create table if not exists public.extratos_importados (
  id             uuid primary key default gen_random_uuid(),
  nome_arquivo   text,
  importado_em   timestamptz not null default now(),
  importado_por  uuid references public.perfis(id) on delete set null,
  total_linhas   int,
  total_creditos int,
  titulos_bruto  jsonb   -- (extra ao SPEC) titulos enviados junto ao extrato, quando houver
);

-- ---------- lancamentos ----------
create table if not exists public.lancamentos (
  id                uuid primary key default gen_random_uuid(),
  extrato_id        uuid not null references public.extratos_importados(id) on delete cascade,
  data              date,
  descricao         text,
  valor             numeric,
  tipo              text,   -- 'credito' | 'debito'
  cod_titulo_casado text,
  situacao          text    -- 'casado' | 'divergente' | 'ignorado'
);
create index if not exists lancamentos_extrato_idx on public.lancamentos (extrato_id);

-- ---------- divergencias ----------
create table if not exists public.divergencias (
  id               uuid primary key default gen_random_uuid(),
  extrato_id       uuid not null references public.extratos_importados(id) on delete cascade,
  tipo_inicial     text,   -- ver SPEC 5.3
  lancamento_id    uuid references public.lancamentos(id) on delete set null,
  cod_titulo       text,
  valor_lancamento numeric,
  valor_titulo     numeric,
  status           text not null default 'nova',  -- 'nova','investigando','aguardando_aprovacao','resolvida'
  hipotese         jsonb,
  criado_em        timestamptz not null default now() -- (extra ao SPEC: ordena o kanban)
);
create index if not exists divergencias_extrato_idx on public.divergencias (extrato_id);

-- ---------- RLS: leitura autenticada; escrita pelo servidor (chave secreta) ----------
alter table public.extratos_importados enable row level security;
alter table public.lancamentos enable row level security;
alter table public.divergencias enable row level security;

drop policy if exists "extratos_leitura_autenticados" on public.extratos_importados;
create policy "extratos_leitura_autenticados"
  on public.extratos_importados for select to authenticated using (true);

drop policy if exists "lancamentos_leitura_autenticados" on public.lancamentos;
create policy "lancamentos_leitura_autenticados"
  on public.lancamentos for select to authenticated using (true);

drop policy if exists "divergencias_leitura_autenticados" on public.divergencias;
create policy "divergencias_leitura_autenticados"
  on public.divergencias for select to authenticated using (true);

-- ---------- Realtime ----------
alter table public.lancamentos  replica identity full;
alter table public.divergencias replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.lancamentos;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.divergencias;
exception when duplicate_object then null;
end $$;
