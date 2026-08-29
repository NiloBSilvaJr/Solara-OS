import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/perfil";
import Organograma from "@/components/Organograma";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import FilaAprovacao from "@/components/FilaAprovacao";

// Pagina temporaria para conferir o Motor (Organograma, LinhaDoTempo,
// FilaAprovacao) enquanto Vendas e Financeiro nao existem. Nao faz parte
// do SPEC e pode ser apagada.
export const dynamic = "force-dynamic";

export default async function MotorTestePage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; item?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");

  const { area, item } = await searchParams;
  const areaTipada: "vendas" | "financeiro" = area === "financeiro" ? "financeiro" : "vendas";
  const itemId = item ?? "TESTE-1";

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Motor - teste</h1>
        <Link href="/" style={{ fontSize: "0.9rem" }}>
          Voltar
        </Link>
      </header>
      <p style={{ color: "#888", fontSize: "0.85rem", marginTop: "0.5rem" }}>
        area=<b>{areaTipada}</b> - item=<b>{itemId}</b>. Troque com{" "}
        <code>?area=financeiro&amp;item=XYZ</code>. Pagina temporaria, fora do SPEC.
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", color: "#555" }}>Organograma</h2>
        <Organograma area={areaTipada} itemId={itemId} />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", color: "#555" }}>Linha do tempo</h2>
        <LinhaDoTempo itemId={itemId} />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", color: "#555" }}>Fila de aprovacao</h2>
        <FilaAprovacao area={areaTipada} />
      </section>
    </main>
  );
}
