"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const CANAIS = ["e-mail", "whatsapp", "telefone"];

async function proximoCodPedido(db: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data } = await db
    .from("pedidos_orcamento")
    .select("cod_pedido")
    .ilike("cod_pedido", "PED%")
    .order("cod_pedido", { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.cod_pedido ?? "PED000";
  const n = parseInt(String(ultimo).replace(/\D/g, ""), 10) || 0;
  return "PED" + String(n + 1).padStart(3, "0");
}

export type ResultadoNovoPedido = { ok: true; cod_pedido: string } | { ok: false; erro: string };

export async function criarPedido(dados: {
  cod_cliente: string;
  canal: string;
  mensagem: string;
}): Promise<ResultadoNovoPedido> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Nao autenticado." };

  const db = createAdminClient();
  const { data: perfil } = await db
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .maybeSingle();
  const areas = Array.isArray(perfil?.areas) ? perfil.areas : [];
  if (!areas.includes("vendas")) return { ok: false, erro: "Sem acesso a Vendas." };

  const codCliente = String(dados.cod_cliente ?? "").trim();
  const canal = String(dados.canal ?? "").trim();
  const mensagem = String(dados.mensagem ?? "").trim();
  if (!codCliente || !CANAIS.includes(canal) || mensagem.length < 3) {
    return { ok: false, erro: "Preencha cliente, canal e mensagem." };
  }

  const codPedido = await proximoCodPedido(db);
  const hoje = new Date().toISOString().slice(0, 10);

  const { error } = await db.from("pedidos_orcamento").insert({
    cod_pedido: codPedido,
    data: hoje,
    cod_cliente: codCliente,
    canal,
    mensagem,
    status: "novo",
  });
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/vendas");
  return { ok: true, cod_pedido: codPedido };
}
