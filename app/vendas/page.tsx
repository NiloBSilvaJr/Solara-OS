import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/perfil";
import { createAdminClient } from "@/utils/supabase/admin";
import VendasTela from "@/components/VendasTela";

export const dynamic = "force-dynamic";

export default async function VendasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  if (!perfil.areas.includes("vendas")) redirect("/");

  const db = createAdminClient();

  const [{ data: pedidos }, { data: clientes }] = await Promise.all([
    db
      .from("pedidos_orcamento")
      .select("cod_pedido, data, cod_cliente, canal, mensagem, status")
      .order("data", { ascending: false })
      .order("cod_pedido", { ascending: false }),
    db.from("clientes").select("cod_cliente, nome").order("nome", { ascending: true }),
  ]);

  return (
    <main style={{ minHeight: "100vh", padding: "1.5rem", maxWidth: "72rem", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Vendas</h1>
        <Link href="/" style={{ fontSize: "0.9rem" }}>
          Voltar
        </Link>
      </header>

      <VendasTela
        pedidosIniciais={pedidos ?? []}
        clientes={clientes ?? []}
      />
    </main>
  );
}
