import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type Perfil = {
  id: string;
  email: string;
  nome: string | null;
  papel: "admin" | "operador";
  areas: string[];
};

// Le o perfil do usuario logado. A checagem de sessao usa o cliente de
// servidor (cookies); a leitura da linha em `perfis` usa a chave secreta,
// para nao depender de policy de RLS em `perfis`.
export async function getPerfilAtual(): Promise<Perfil | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("perfis")
    .select("id, email, nome, papel, areas")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) {
    // Sem linha em `perfis` (ou chave secreta invalida): trata como operador
    // sem areas. O admin deve criar a linha em `perfis` (SPEC 2.1).
    return {
      id: user.id,
      email: user.email ?? "",
      nome: null,
      papel: "operador",
      areas: [],
    };
  }

  return {
    id: data.id,
    email: data.email ?? user.email ?? "",
    nome: data.nome ?? null,
    papel: data.papel === "admin" ? "admin" : "operador",
    areas: Array.isArray(data.areas) ? data.areas : [],
  };
}
