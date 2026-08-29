"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Execucao = {
  id: string;
  agente: string;
  status: "rodando" | "ok" | "erro";
  entrada: unknown;
  saida: unknown;
  erro: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string;
  fim: string | null;
};

const COR: Record<string, string> = {
  rodando: "#8a6d00",
  ok: "#2e7d32",
  erro: "#c0392b",
};

export default function LinhaDoTempo({ itemId }: { itemId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [execs, setExecs] = useState<Execucao[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    const carregar = () =>
      supabase
        .from("execucoes_agentes")
        .select(
          "id, agente, status, entrada, saida, erro, tokens_entrada, tokens_saida, inicio, fim",
        )
        .eq("item_id", itemId)
        .order("inicio", { ascending: true })
        .then(({ data }) => {
          if (ativo && data) setExecs(data as Execucao[]);
        });

    carregar();

    const canal = supabase
      .channel(`linha-do-tempo-${itemId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execucoes_agentes", filter: `item_id=eq.${itemId}` },
        () => carregar(),
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [supabase, itemId]);

  if (execs.length === 0) {
    return <p style={{ color: "#888", fontSize: "0.9rem" }}>Nenhuma execucao para este item.</p>;
  }

  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {execs.map((e) => {
        const aberto = expandido === e.id;
        const seg = e.fim
          ? ((new Date(e.fim).getTime() - new Date(e.inicio).getTime()) / 1000).toFixed(1) + "s"
          : "-";
        const tokens =
          e.tokens_entrada != null || e.tokens_saida != null
            ? `${(e.tokens_entrada ?? 0) + (e.tokens_saida ?? 0)} tok`
            : "-";
        return (
          <li key={e.id} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6 }}>
            <button
              onClick={() => setExpandido(aberto ? null : e.id)}
              style={{
                width: "100%",
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                padding: "0.6rem 0.8rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "0.88rem",
              }}
            >
              <span style={{ color: "#999", width: "1rem" }}>{aberto ? "-" : "+"}</span>
              <span style={{ fontWeight: 600, minWidth: "7rem" }}>{e.agente}</span>
              <span style={{ color: COR[e.status] ?? "#555", minWidth: "4rem" }}>{e.status}</span>
              <span style={{ color: "#666" }}>{seg}</span>
              <span style={{ color: "#666" }}>{tokens}</span>
            </button>

            {aberto ? (
              <div style={{ padding: "0 0.8rem 0.8rem", fontSize: "0.8rem" }}>
                {e.erro ? (
                  <p style={{ color: "#c0392b", marginBottom: "0.5rem" }}>{e.erro}</p>
                ) : null}
                <BlocoJson titulo="entrada" valor={e.entrada} />
                <BlocoJson titulo="saida" valor={e.saida} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function BlocoJson({ titulo, valor }: { titulo: string; valor: unknown }) {
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ color: "#888", textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.05em" }}>
        {titulo}
      </div>
      <pre
        style={{
          margin: "0.25rem 0 0",
          padding: "0.6rem",
          background: "#f6f6f6",
          borderRadius: 4,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {valor == null ? "-" : JSON.stringify(valor, null, 2)}
      </pre>
    </div>
  );
}
