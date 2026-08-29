import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/perfil";
import { createAdminClient } from "@/utils/supabase/admin";
import CriarUsuarioForm from "./CriarUsuarioForm";

export const dynamic = "force-dynamic";

type LinhaPerfil = {
  id: string;
  email: string | null;
  nome: string | null;
  papel: string | null;
  areas: string[] | null;
};

export default async function AdminPage() {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  if (perfil.papel !== "admin") redirect("/");

  const admin = createAdminClient();
  const { data: perfis } = await admin
    .from("perfis")
    .select("id, email, nome, papel, areas")
    .order("criado_em", { ascending: true });

  const linhas = (perfis ?? []) as LinhaPerfil[];

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Administracao</h1>
        <Link href="/" style={{ fontSize: "0.9rem" }}>
          Voltar
        </Link>
      </header>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem", color: "#555", marginBottom: "0.75rem" }}>Usuarios</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", background: "#fff" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e0e0e0" }}>
                <th style={{ padding: "0.5rem" }}>E-mail</th>
                <th style={{ padding: "0.5rem" }}>Nome</th>
                <th style={{ padding: "0.5rem" }}>Papel</th>
                <th style={{ padding: "0.5rem" }}>Areas</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>{p.email}</td>
                  <td style={{ padding: "0.5rem" }}>{p.nome ?? "-"}</td>
                  <td style={{ padding: "0.5rem" }}>{p.papel ?? "-"}</td>
                  <td style={{ padding: "0.5rem" }}>{(p.areas ?? []).join(", ") || "-"}</td>
                </tr>
              ))}
              {linhas.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "0.75rem", color: "#888" }}>
                    Nenhum perfil listado. Confira a chave secreta (SUPABASE_SECRET_KEY) ou as policies de `perfis`.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", color: "#555", marginBottom: "0.75rem" }}>Criar usuario</h2>
        <CriarUsuarioForm />
      </section>
    </main>
  );
}
