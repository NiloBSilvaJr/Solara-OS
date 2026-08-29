import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/perfil";
import { sair } from "./login/actions";

const AREAS_ATIVAS = [
  { chave: "vendas", nome: "Vendas", descricao: "Pedidos de orcamento", href: "/vendas" },
  { chave: "financeiro", nome: "Financeiro", descricao: "Conciliacao bancaria", href: "/financeiro" },
];

const AREAS_EM_BREVE = ["RH", "Juridico", "Operacoes"];

export default async function Page() {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");

  const minhasAreas = AREAS_ATIVAS.filter((a) => perfil.areas.includes(a.chave));

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.75rem" }}>Solara OS</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "#666", fontSize: "0.9rem" }}>{perfil.email}</span>
          {perfil.papel === "admin" ? (
            <Link href="/admin" style={{ fontSize: "0.9rem" }}>
              Admin
            </Link>
          ) : null}
          <form action={sair}>
            <button
              type="submit"
              style={{
                padding: "0.4rem 0.8rem",
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem", color: "#555", marginBottom: "0.75rem" }}>Areas</h2>

        {minhasAreas.length === 0 ? (
          <p style={{ color: "#888", fontSize: "0.9rem" }}>
            Voce ainda nao tem acesso a nenhuma area. Fale com o administrador.
          </p>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))", gap: "1rem" }}>
          {minhasAreas.map((a) => (
            <Link
              key={a.chave}
              href={a.href}
              style={{
                display: "block",
                padding: "1.25rem",
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                textDecoration: "none",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{a.nome}</div>
              <div style={{ color: "#666", fontSize: "0.85rem", marginTop: "0.25rem" }}>{a.descricao}</div>
            </Link>
          ))}

          {AREAS_EM_BREVE.map((nome) => (
            <div
              key={nome}
              style={{
                padding: "1.25rem",
                background: "#f0f0f0",
                border: "1px dashed #ccc",
                borderRadius: "8px",
                color: "#999",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{nome}</div>
              <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>em breve</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
