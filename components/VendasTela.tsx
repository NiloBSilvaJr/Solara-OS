"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { criarPedido } from "@/app/vendas/actions";
import Organograma from "@/components/Organograma";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import FilaAprovacao from "@/components/FilaAprovacao";

type Pedido = {
  cod_pedido: string;
  data: string;
  cod_cliente: string;
  canal: string;
  mensagem: string;
  status: string;
};

type Cliente = { cod_cliente: string; nome: string };

const COLUNAS: { chave: string; rotulo: string }[] = [
  { chave: "novo", rotulo: "Novo" },
  { chave: "processando", rotulo: "Processando" },
  { chave: "aguardando_aprovacao", rotulo: "Aguardando aprovacao" },
  { chave: "respondido", rotulo: "Respondido" },
  { chave: "rejeitado", rotulo: "Rejeitado" },
];

const CANAIS = ["e-mail", "whatsapp", "telefone"];

export default function VendasTela({
  pedidosIniciais,
  clientes,
}: {
  pedidosIniciais: Pedido[];
  clientes: Cliente[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const nomePorCod = useMemo(
    () => new Map(clientes.map((c) => [c.cod_cliente, c.nome])),
    [clientes],
  );

  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciais);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aba, setAba] = useState<"kanban" | "aprovacoes">("kanban");
  const [processando, setProcessando] = useState<Set<string>>(new Set());
  const [erroProc, setErroProc] = useState<string | null>(null);

  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [form, setForm] = useState({ cod_cliente: "", canal: "e-mail", mensagem: "" });
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviandoForm, setEnviandoForm] = useState(false);

  useEffect(() => {
    const canal = supabase
      .channel("kanban-vendas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_orcamento" },
        (payload) => {
          setPedidos((prev) => {
            if (payload.eventType === "DELETE") {
              const cod = (payload.old as { cod_pedido?: string })?.cod_pedido;
              return cod ? prev.filter((p) => p.cod_pedido !== cod) : prev;
            }
            const nova = payload.new as Pedido;
            if (!nova?.cod_pedido) return prev;
            const i = prev.findIndex((p) => p.cod_pedido === nova.cod_pedido);
            if (i === -1) return [nova, ...prev];
            const copia = prev.slice();
            copia[i] = nova;
            return copia;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase]);

  async function processar(codPedido: string) {
    setErroProc(null);
    setProcessando((s) => new Set(s).add(codPedido));
    try {
      const resp = await fetch("/api/vendas/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_pedido: codPedido }),
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) setErroProc(`${codPedido}: ${dados.erro ?? "falha ao processar"}`);
    } catch {
      setErroProc(`${codPedido}: erro de rede`);
    } finally {
      setProcessando((s) => {
        const n = new Set(s);
        n.delete(codPedido);
        return n;
      });
    }
  }

  async function enviarNovo(e: React.FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setEnviandoForm(true);
    try {
      const r = await criarPedido(form);
      if (!r.ok) {
        setErroForm(r.erro);
        return;
      }
      setPedidos((prev) =>
        prev.some((p) => p.cod_pedido === r.cod_pedido)
          ? prev
          : [
              {
                cod_pedido: r.cod_pedido,
                data: new Date().toISOString().slice(0, 10),
                cod_cliente: form.cod_cliente,
                canal: form.canal,
                mensagem: form.mensagem,
                status: "novo",
              },
              ...prev,
            ],
      );
      setForm({ cod_cliente: "", canal: "e-mail", mensagem: "" });
      setMostrarNovo(false);
    } finally {
      setEnviandoForm(false);
    }
  }

  const pedidoSelecionado = pedidos.find((p) => p.cod_pedido === selecionado) ?? null;

  return (
    <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Organograma do pedido selecionado */}
      <section>
        {selecionado ? (
          <Organograma area="vendas" itemId={selecionado} />
        ) : (
          <div
            style={{
              background: "#fff",
              border: "1px dashed #ccc",
              borderRadius: 8,
              padding: "1.25rem",
              color: "#999",
              textAlign: "center",
              fontSize: "0.9rem",
            }}
          >
            Selecione um pedido para ver o organograma.
          </div>
        )}
      </section>

      {/* Abas */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setAba("kanban")} style={abaEstilo(aba === "kanban")}>
          Kanban
        </button>
        <button onClick={() => setAba("aprovacoes")} style={abaEstilo(aba === "aprovacoes")}>
          Aprovacoes
        </button>
        <div style={{ flex: 1 }} />
        {aba === "kanban" ? (
          <button
            onClick={() => setMostrarNovo((v) => !v)}
            style={{
              padding: "0.45rem 0.9rem",
              background: "#1a1a1a",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {mostrarNovo ? "Fechar" : "Novo pedido"}
          </button>
        ) : null}
      </div>

      {/* Formulario Novo pedido */}
      {aba === "kanban" && mostrarNovo ? (
        <form
          onSubmit={enviarNovo}
          style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            maxWidth: "32rem",
          }}
        >
          <label style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Cliente
            <select
              required
              value={form.cod_cliente}
              onChange={(e) => setForm((f) => ({ ...f, cod_cliente: e.target.value }))}
              style={campo}
            >
              <option value="">Selecione...</option>
              {clientes.map((c) => (
                <option key={c.cod_cliente} value={c.cod_cliente}>
                  {c.nome} ({c.cod_cliente})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Canal
            <select
              value={form.canal}
              onChange={(e) => setForm((f) => ({ ...f, canal: e.target.value }))}
              style={campo}
            >
              {CANAIS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Mensagem
            <textarea
              required
              rows={4}
              value={form.mensagem}
              onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
              style={campo}
            />
          </label>

          {erroForm ? <p style={{ color: "#c0392b", fontSize: "0.85rem" }}>{erroForm}</p> : null}

          <button
            type="submit"
            disabled={enviandoForm}
            style={{
              padding: "0.55rem",
              background: "#1a1a1a",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: enviandoForm ? "default" : "pointer",
              opacity: enviandoForm ? 0.6 : 1,
              alignSelf: "flex-start",
            }}
          >
            {enviandoForm ? "Salvando..." : "Salvar pedido"}
          </button>
        </form>
      ) : null}

      {erroProc ? <p style={{ color: "#c0392b", fontSize: "0.85rem" }}>{erroProc}</p> : null}

      {/* Conteudo da aba */}
      {aba === "aprovacoes" ? (
        <FilaAprovacao area="vendas" />
      ) : (
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <div style={{ flex: 1, overflowX: "auto" }}>
            <div style={{ display: "flex", gap: "0.75rem", minWidth: "min-content" }}>
              {COLUNAS.map((col) => {
                const daColuna = pedidos.filter((p) => p.status === col.chave);
                return (
                  <div key={col.chave} style={{ width: "15rem", flex: "0 0 auto" }}>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#555",
                        padding: "0.25rem 0.1rem",
                      }}
                    >
                      {col.rotulo} ({daColuna.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {daColuna.map((p) => (
                        <article
                          key={p.cod_pedido}
                          onClick={() => setSelecionado(p.cod_pedido)}
                          style={{
                            background: p.cod_pedido === selecionado ? "#eef3ff" : "#fff",
                            border: "1px solid #e0e0e0",
                            borderRadius: 6,
                            padding: "0.6rem",
                            cursor: "pointer",
                            fontSize: "0.82rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                            <strong>{p.cod_pedido}</strong>
                            <span style={{ color: "#999" }}>{p.data}</span>
                          </div>
                          <div style={{ marginTop: 2 }}>{nomePorCod.get(p.cod_cliente) ?? p.cod_cliente}</div>
                          <div style={{ color: "#888", fontSize: "0.75rem" }}>{p.canal}</div>
                          <p style={{ marginTop: "0.35rem", color: "#444" }}>
                            {p.mensagem.slice(0, 80)}
                            {p.mensagem.length > 80 ? "..." : ""}
                          </p>
                          {p.status === "novo" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                processar(p.cod_pedido);
                              }}
                              disabled={processando.has(p.cod_pedido)}
                              style={{
                                marginTop: "0.4rem",
                                padding: "0.35rem 0.7rem",
                                background: "#1a1a1a",
                                color: "#fff",
                                border: "none",
                                borderRadius: 4,
                                cursor: processando.has(p.cod_pedido) ? "default" : "pointer",
                                fontSize: "0.8rem",
                                opacity: processando.has(p.cod_pedido) ? 0.6 : 1,
                              }}
                            >
                              {processando.has(p.cod_pedido) ? "Processando..." : "Processar"}
                            </button>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {pedidoSelecionado ? (
            <aside
              style={{
                flex: "0 0 22rem",
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: "1rem" }}>{pedidoSelecionado.cod_pedido}</h3>
                <button
                  onClick={() => setSelecionado(null)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#888" }}
                >
                  fechar
                </button>
              </div>
              <p style={{ fontSize: "0.8rem", color: "#666", margin: "0.25rem 0 0.75rem" }}>
                {nomePorCod.get(pedidoSelecionado.cod_cliente) ?? pedidoSelecionado.cod_cliente} ·{" "}
                {pedidoSelecionado.canal} · {pedidoSelecionado.status}
              </p>
              <LinhaDoTempo itemId={pedidoSelecionado.cod_pedido} />
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

const campo: React.CSSProperties = {
  padding: "0.5rem",
  border: "1px solid #ccc",
  borderRadius: 4,
  width: "100%",
  font: "inherit",
};

function abaEstilo(ativa: boolean): React.CSSProperties {
  return {
    padding: "0.45rem 0.9rem",
    background: ativa ? "#1a1a1a" : "#fff",
    color: ativa ? "#fff" : "#333",
    border: "1px solid " + (ativa ? "#1a1a1a" : "#ccc"),
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "0.85rem",
  };
}
