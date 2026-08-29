import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { limparExtrato, limparTitulos } from "@/lib/financeiro/limpar";

export const maxDuration = 60;

// Le como utf-8; se falhar, tenta latin-1 (SPEC 5.3).
function decodificar(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("latin1").decode(buf);
  }
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .maybeSingle();
  const areas = Array.isArray(perfil?.areas) ? perfil.areas : [];
  if (!areas.includes("financeiro")) {
    return NextResponse.json({ erro: "Sem acesso a Financeiro." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Envie o arquivo como multipart/form-data." }, { status: 400 });
  }

  const arquivoExtrato = form.get("extrato");
  if (!(arquivoExtrato instanceof File)) {
    return NextResponse.json({ erro: "O extrato e obrigatorio." }, { status: 400 });
  }

  const textoExtrato = decodificar(await arquivoExtrato.arrayBuffer());
  const { linhasBrutas, lancamentos } = limparExtrato(textoExtrato);
  if (lancamentos.length === 0) {
    return NextResponse.json({ erro: "Nenhum lancamento reconhecido no arquivo." }, { status: 400 });
  }

  let titulosBruto: unknown = null;
  const arquivoTitulos = form.get("titulos");
  if (arquivoTitulos instanceof File && arquivoTitulos.size > 0) {
    const textoTitulos = decodificar(await arquivoTitulos.arrayBuffer());
    const parsed = limparTitulos(textoTitulos);
    if (parsed.length > 0) titulosBruto = parsed;
  }

  const totalCreditos = lancamentos.filter((l) => l.tipo === "credito").length;

  const { data: extrato, error } = await admin
    .from("extratos_importados")
    .insert({
      nome_arquivo: arquivoExtrato.name,
      importado_por: user.id,
      total_linhas: lancamentos.length,
      total_creditos: totalCreditos,
      titulos_bruto: titulosBruto,
    })
    .select("id")
    .single();
  if (error || !extrato) {
    return NextResponse.json({ erro: error?.message ?? "Falha ao criar o extrato." }, { status: 500 });
  }

  const { error: errLanc } = await admin.from("lancamentos").insert(
    lancamentos.map((l) => ({
      extrato_id: extrato.id,
      data: l.data,
      descricao: l.descricao,
      valor: l.valor,
      tipo: l.tipo,
    })),
  );
  if (errLanc) {
    await admin.from("extratos_importados").delete().eq("id", extrato.id);
    return NextResponse.json({ erro: errLanc.message }, { status: 500 });
  }

  return NextResponse.json({
    extrato_id: extrato.id,
    total_linhas: lancamentos.length,
    total_creditos: totalCreditos,
    titulos_enviados: Array.isArray(titulosBruto) ? titulosBruto.length : 0,
    antes: linhasBrutas.slice(0, 6),
    depois: lancamentos.slice(0, 6),
  });
}
