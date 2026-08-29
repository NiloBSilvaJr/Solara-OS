import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { sair } from "./login/actions";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem" }}>Solara OS</h1>
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
      <p style={{ marginTop: "1rem", color: "#666" }}>{user.email}</p>
    </main>
  );
}
