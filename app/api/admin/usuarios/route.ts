import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const AREAS_VALIDAS = ["vendas", "financeiro"];
const PAPEIS_VALIDOS = ["admin", "operador"];

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: eu } = await admin
    .from("perfis")
    .select("papel")
    .eq("id", user.id)
    .maybeSingle();
  if (eu?.papel !== "admin") {
    return NextResponse.json({ erro: "Apenas administradores." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  const senha = String(body.senha ?? "");
  const nome = String(body.nome ?? "").trim() || null;
  const papel = String(body.papel ?? "");
  const areas = Array.isArray(body.areas)
    ? (body.areas as unknown[]).map(String).filter((a) => AREAS_VALIDAS.includes(a))
    : [];

  if (!email || senha.length < 6 || !PAPEIS_VALIDOS.includes(papel)) {
    return NextResponse.json(
      { erro: "Informe e-mail, senha (min. 6) e papel valido." },
      { status: 400 },
    );
  }

  const { data: criado, error: errAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (errAuth || !criado?.user) {
    return NextResponse.json(
      { erro: errAuth?.message ?? "Falha ao criar no Auth." },
      { status: 400 },
    );
  }

  const { error: errPerfil } = await admin.from("perfis").insert({
    id: criado.user.id,
    email,
    nome,
    papel,
    areas,
  });
  if (errPerfil) {
    // desfaz o usuario do Auth para nao ficar orfao
    await admin.auth.admin.deleteUser(criado.user.id);
    return NextResponse.json({ erro: errPerfil.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: criado.user.id });
}
