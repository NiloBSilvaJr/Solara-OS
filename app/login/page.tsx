import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { entrar } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <form
        action={entrar}
        style={{
          width: "100%",
          maxWidth: "22rem",
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem" }}>Solara OS</h1>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Entre com seu e-mail e senha.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem" }}>E-mail</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem" }}>Senha</span>
          <input
            type="password"
            name="senha"
            required
            autoComplete="current-password"
            style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        </label>

        {erro ? (
          <p style={{ color: "#c0392b", fontSize: "0.85rem" }}>{erro}</p>
        ) : null}

        <button
          type="submit"
          style={{
            padding: "0.6rem",
            background: "#1a1a1a",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
