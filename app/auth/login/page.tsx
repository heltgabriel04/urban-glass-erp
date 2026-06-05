"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessaoExpirada = searchParams.get("expired") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    router.push("/");
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Glow de fundo */}
      <div style={{
        position: "absolute",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(61,255,160,0.06) 0%, transparent 70%)",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }} />

      <div style={{
        width: "100%",
        maxWidth: "420px",
        padding: "0 20px",
        position: "relative",
        zIndex: 1,
      }}>

        {/* Card */}
        <div style={{
          background: "var(--surf)",
          border: "1px solid var(--b2)",
          borderRadius: "20px",
          padding: "40px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}>

          {/* Logo */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div style={{
                width: "38px",
                height: "38px",
                background: "linear-gradient(135deg, var(--acc), var(--acc2))",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Syne', sans-serif",
                fontSize: "13px",
                fontWeight: 900,
                color: "#090b10",
                flexShrink: 0,
              }}>UG</div>
              <div>
                <div style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: "18px",
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                  color: "var(--t1)",
                }}>Urban<span style={{ color: "var(--acc)" }}>Glass</span></div>
                <div style={{
                  fontSize: "9px",
                  color: "var(--t3)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  fontFamily: "'DM Mono', monospace",
                }}>ERP INDUSTRIAL V3</div>
              </div>
            </div>
          </div>

          {/* Título */}
          <div style={{ marginBottom: "28px" }}>
            <h1 style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "26px",
              fontWeight: 800,
              color: "var(--t1)",
              letterSpacing: "-0.5px",
              marginBottom: "6px",
            }}>Bem-vindo</h1>
            <p style={{ fontSize: "13px", color: "var(--t2)" }}>
              Entre com suas credenciais para acessar
            </p>
          </div>

          {sessaoExpirada && (
            <div style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.3)",
              color: "#f59e0b",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "12px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <span>⏱</span>
              <span>Sessão encerrada automaticamente à meia-noite. Faça login para continuar.</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin}>

            <div style={{ marginBottom: "14px" }}>
              <label style={{
                display: "block",
                fontSize: "9.5px",
                color: "var(--t3)",
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                fontFamily: "'DM Mono', monospace",
                marginBottom: "6px",
              }}>E-mail</label>
              <input
                type="email"
                required
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--surf2)",
                  border: "1px solid var(--b2)",
                  borderRadius: "8px",
                  padding: "11px 14px",
                  color: "var(--t1)",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--acc)"}
                onBlur={(e) => e.target.style.borderColor = "var(--b2)"}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block",
                fontSize: "9.5px",
                color: "var(--t3)",
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                fontFamily: "'DM Mono', monospace",
                marginBottom: "6px",
              }}>Senha</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--surf2)",
                  border: "1px solid var(--b2)",
                  borderRadius: "8px",
                  padding: "11px 14px",
                  color: "var(--t1)",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--acc)"}
                onBlur={(e) => e.target.style.borderColor = "var(--b2)"}
              />
            </div>

            {error && (
              <div style={{
                background: "rgba(244,63,94,0.08)",
                border: "1px solid rgba(244,63,94,0.25)",
                color: "var(--err)",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "12px",
                marginBottom: "16px",
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading ? "var(--surf3)" : "var(--acc)",
                color: loading ? "var(--t2)" : "#090b10",
                border: "none",
                borderRadius: "8px",
                padding: "13px",
                fontSize: "14px",
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.2px",
              }}
            >
              {loading ? "Entrando..." : "→ Entrar"}
            </button>
          </form>

          {/* Footer */}
          <div style={{
            marginTop: "28px",
            paddingTop: "20px",
            borderTop: "1px solid var(--b1)",
            textAlign: "center",
            fontSize: "10px",
            color: "var(--t3)",
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "1px",
          }}>
            urban-glass-erp • acesso restrito
          </div>

        </div>
      </div>
    </div>
  );
}