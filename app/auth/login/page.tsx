"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError("E-mail ou senha inválidos."); return; }
    router.push("/dashboard");
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Glow de fundo */}
      <div style={{
        position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: "600px", height: "300px", borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(61,255,160,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        background: "var(--surf)", border: "1px solid var(--b2)",
        borderRadius: "var(--r2)", padding: "40px 36px",
        width: "100%", maxWidth: "400px", boxShadow: "var(--sh)",
        position: "relative",
      }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
          <div style={{
            width: "38px", height: "38px",
            background: "linear-gradient(135deg, var(--acc), var(--acc2))",
            borderRadius: "10px", display: "flex", alignItems: "center",
            justifyContent: "center", fontFamily: "'Syne', sans-serif",
            fontSize: "13px", fontWeight: 900, color: "#090b10", flexShrink: 0,
          }}>UG</div>
          <div>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontSize: "17px",
              fontWeight: 800, letterSpacing: "-0.5px",
            }}>
              Urban<span style={{ color: "var(--acc)" }}>Glass</span>
            </div>
            <div style={{
              fontSize: "9px", color: "var(--t3)", letterSpacing: "2px",
              textTransform: "uppercase", fontFamily: "'DM Mono', monospace",
            }}>ERP Industrial V3</div>
          </div>
        </div>

        {/* Título */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontSize: "20px",
            fontWeight: 700, marginBottom: "6px",
          }}>Bem-vindo</div>
          <div style={{ fontSize: "13px", color: "var(--t2)" }}>
            Entre com suas credenciais para acessar
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="al al-e" style={{ marginBottom: "16px" }}>
            ⚠ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div className="fg" style={{ marginBottom: "12px" }}>
            <label className="fl">E-mail</label>
            <input
              className="fc"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="fg" style={{ marginBottom: "24px" }}>
            <label className="fl">Senha</label>
            <input
              className="fc"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn bp"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", padding: "11px" }}
          >
            {loading ? "Entrando..." : "→ Entrar"}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--b1)",
          textAlign: "center", fontSize: "11px", color: "var(--t3)",
          fontFamily: "'DM Mono', monospace",
        }}>
          urban-glass-erp · acesso restrito
        </div>
      </div>
    </div>
  );
}