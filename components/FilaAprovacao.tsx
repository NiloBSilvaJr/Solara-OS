"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Aprovacao = {
  id: string;
  area: string;
  item_tipo: string;
  item_id: string;
  titulo: string;
  proposta: unknown;
  status: string;
  observacao: string | null;
};

type Decisao = "aprovada" | "editada" | "rejeitada";

type ItemContexto = {
  descricao_cliente?: string;
  descricao?: string | null;
  cod_produto?: string | null;
  quantidade?: number | null;
  existe?: boolean;
  atende_estoque?: boolean;
  estoque?: number | null;
  prazo_reposicao_dias?: number | null;
};

type PropostaVendas = { resposta: string; itens: ItemContexto[] };

// So existe para propostas de orcamento do Redator (proposta.resposta + proposta.contexto.itens).
// Outras propostas (triagem sem orcamento, divergencias do financeiro) caem no textarea JSON normal.
function extrairPropostaVendas(proposta: unknown): PropostaVendas | null {
  if (typeof proposta !== "object" || proposta === null) return null;
  const p = proposta as Record<string, unknown>;
  if (typeof p.resposta !== "string") return null;
  const contexto = p.contexto as Record<string, unknown> | undefined;
  const itens = Array.isArray(contexto?.itens) ? (contexto!.itens as ItemContexto[]) : [];
  return { resposta: p.resposta, itens };
}

export default function FilaAprovacao({ area }: { area: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [itens, setItens] = useState<Aprovacao[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;

    const carregar = () =>
      supabase
        .from("aprovacoes")
        .select("id, area, item_tipo, item_id, titulo, proposta, status, observacao")
        .eq("area", area)
        .eq("status", "pendente")
        .order("criado_em", { ascending: true })
        .then(({ data }) => {
          if (ativo && data) setItens(data as Aprovacao[]);
        });

    carregar();

    const canal = supabase
      .channel(`fila-aprovacao-${area}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aprovacoes", filter: `area=eq.${area}` },
        () => carregar(),
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [supabase, area]);

  const aberto = itens.find((i) => i.id === abertoId) ?? null;

  function abrir(item: Aprovacao) {
    setAbertoId(item.id);
    setRascunho(JSON.stringify(item.proposta, null, 2));
    setObservacao("");
    setErro(null);
  }

  async function decidir(decisao: Decisao) {
    if (!aberto) return;
    setErro(null);

    const corpo: Record<string, unknown> = { id: aberto.id, decisao };

    if (decisao === "editada") {
      try {
        corpo.proposta = JSON.parse(rascunho);
      } catch {
        setErro("A proposta editada nao e um JSON valido.");
        return;
      }
    }
    if (decisao === "rejeitada") {
      if (!observacao.trim()) {
        setErro("Escreva uma observacao para rejeitar.");
        return;
      }
      corpo.observacao = observacao.trim();
    }

    setSalvando(true);
    try {
      const resp = await fetch("/api/aprovacoes/decidir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao registrar a decisao.");
        return;
      }
      setAbertoId(null);
    } catch {
      setErro("Erro de rede ao registrar a decisao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          flex: "1 1 16rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
        }}
      >
        {itens.length === 0 ? (
          <li style={{ color: "#888", fontSize: "0.9rem" }}>Nada pendente nesta area.</li>
        ) : null}
        {itens.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => abrir(item)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "0.6rem 0.8rem",
                background: item.id === abertoId ? "#eef3ff" : "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: "0.88rem",
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.titulo}</div>
              <div style={{ color: "#888", fontSize: "0.75rem", marginTop: 2 }}>
                {item.item_tipo} {item.item_id}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {aberto ? (
        <div
          style={{
            flex: "2 1 22rem",
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
          }}
        >
          <h3 style={{ fontSize: "1rem" }}>{aberto.titulo}</h3>

          {(() => {
            const vendas = extrairPropostaVendas(aberto.proposta);
            if (!vendas) return null;
            const naoVendemos = vendas.itens.filter((it) => it.existe === false);
            return (
              <>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#555" }}>Resposta para o cliente</label>
                  <div
                    style={{
                      marginTop: "0.3rem",
                      whiteSpace: "pre-wrap",
                      background: "#fafafa",
                      border: "1px solid #e0e0e0",
                      borderRadius: 6,
                      padding: "0.75rem",
                      fontSize: "0.88rem",
                      lineHeight: 1.5,
                    }}
                  >
                    {vendas.resposta}
                  </div>
                </div>

                {naoVendemos.length > 0 ? (
                  <div
                    style={{
                      background: "#fdecea",
                      border: "1px solid #f5c6cb",
                      borderRadius: 6,
                      padding: "0.6rem 0.75rem",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#c0392b" }}>
                      Itens que a Solara nao vende (confira antes de aprovar)
                    </div>
                    <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.85rem", color: "#7a1f1f" }}>
                      {naoVendemos.map((it, i) => (
                        <li key={i}>
                          {it.descricao_cliente ?? it.descricao ?? "item sem descricao"}
                          {it.quantidade ? ` (qtd. ${it.quantidade})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            );
          })()}

          <label style={{ fontSize: "0.8rem", color: "#555" }}>Proposta (editavel, JSON)</label>
          <textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            rows={14}
            style={{
              width: "100%",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.8rem",
              padding: "0.6rem",
              border: "1px solid #ccc",
              borderRadius: 4,
              whiteSpace: "pre",
              overflowWrap: "normal",
              overflowX: "auto",
            }}
          />

          <label style={{ fontSize: "0.8rem", color: "#555" }}>Observacao (obrigatoria para rejeitar)</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            style={{ width: "100%", fontSize: "0.85rem", padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
          />

          {erro ? <p style={{ color: "#c0392b", fontSize: "0.85rem" }}>{erro}</p> : null}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button onClick={() => decidir("aprovada")} disabled={salvando} style={botao("#2e7d32")}>
              Aprovar
            </button>
            <button onClick={() => decidir("editada")} disabled={salvando} style={botao("#1a1a1a")}>
              Salvar edicao e aprovar
            </button>
            <button onClick={() => decidir("rejeitada")} disabled={salvando} style={botao("#c0392b")}>
              Rejeitar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function botao(cor: string): React.CSSProperties {
  return {
    padding: "0.5rem 0.9rem",
    background: cor,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "0.85rem",
  };
}
