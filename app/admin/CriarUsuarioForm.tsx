"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const AREAS = [
  { chave: "vendas", nome: "Vendas" },
  { chave: "financeiro", nome: "Financeiro" },
];

const campo: React.CSSProperties = {
  padding: "0.5rem",
  border: "1px solid #ccc",
  borderRadius: "4px",
  width: "100%",
};

export default function CriarUsuarioForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState("operador");
  const [areas, setAreas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function alternarArea(chave: string) {
    setAreas((atual) =>
      atual.includes(chave) ? atual.filter((a) => a !== chave) : [...atual, chave],
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    setEnviando(true);
    try {
      const resp = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha, nome, papel, areas }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao criar usuario.");
        return;
      }
      setOk(true);
      setEmail("");
      setSenha("");
      setNome("");
      setPapel("operador");
      setAreas([]);
      router.refresh();
    } catch {
      setErro("Erro de rede ao criar usuario.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: "24rem",
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        padding: "1.25rem",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
        E-mail
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={campo} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
        Senha inicial
        <input type="text" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} style={campo} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
        Nome
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} style={campo} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
        Papel
        <select value={papel} onChange={(e) => setPapel(e.target.value)} style={campo}>
          <option value="operador">operador</option>
          <option value="admin">admin</option>
        </select>
      </label>

      <fieldset style={{ border: "1px solid #eee", borderRadius: "4px", padding: "0.5rem 0.75rem" }}>
        <legend style={{ fontSize: "0.85rem", color: "#555" }}>Areas</legend>
        {AREAS.map((a) => (
          <label key={a.chave} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={areas.includes(a.chave)} onChange={() => alternarArea(a.chave)} />
            {a.nome}
          </label>
        ))}
      </fieldset>

      {erro ? <p style={{ color: "#c0392b", fontSize: "0.85rem" }}>{erro}</p> : null}
      {ok ? <p style={{ color: "#2e7d32", fontSize: "0.85rem" }}>Usuario criado.</p> : null}

      <button
        type="submit"
        disabled={enviando}
        style={{
          padding: "0.6rem",
          background: "#1a1a1a",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: enviando ? "default" : "pointer",
          opacity: enviando ? 0.6 : 1,
        }}
      >
        {enviando ? "Criando..." : "Criar usuario"}
      </button>
    </form>
  );
}
