-- ============================================================
-- Solara OS - Vendas: Realtime no kanban de pedidos_orcamento
-- Cole no SQL Editor do Supabase e execute.
-- A tabela pedidos_orcamento ja existe (importada do CSV);
-- as colunas NAO sao alteradas.
-- ============================================================

-- Envia a linha inteira nos eventos de UPDATE/DELETE mesmo que a
-- tabela nao tenha chave primaria detectada.
alter table public.pedidos_orcamento replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.pedidos_orcamento;
exception when duplicate_object then null;
end $$;

-- Observacao: se voce habilitar RLS em pedidos_orcamento, clientes ou
-- produtos, adicione uma policy de SELECT para `authenticated`, senao o
-- kanban e o formulario de novo pedido param de enxergar os dados no
-- browser. O processamento (orquestrador) usa a chave secreta e nao
-- depende de RLS.
--
-- Exemplo:
-- alter table public.pedidos_orcamento enable row level security;
-- create policy "pedidos_leitura_autenticados"
--   on public.pedidos_orcamento for select to authenticated using (true);
