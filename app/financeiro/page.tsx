import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/perfil";
import { createAdminClient } from "@/utils/supabase/admin";
import FinanceiroTela from "@/components/FinanceiroTela";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  if (!perfil.areas.includes("financeiro")) redirect("/");

  const db = createAdminClient();

  const { data: extratos } = await db
    .from("extratos_importados")
    .select("id, nome_arquivo, total_linhas, total_creditos, importado_em")
    .order("importado_em", { ascending: false })
    .limit(1);

  return (
    <main style={{ minHeight: "100vh", padding: "1.5rem", maxWidth: "72rem", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Financeiro</h1>
        <Link href="/" style={{ fontSize: "0.9rem" }}>
          Voltar
        </Link>
      </header>

      <FinanceiroTela extratoInicial={extratos?.[0] ?? null} />
    </main>
  );
}
