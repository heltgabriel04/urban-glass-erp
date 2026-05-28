"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function SetPasswordPage() {
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function salvarSenha() {
    if (!password) {
      alert("Digite uma senha");
      return;
    }

    if (password.length < 6) {
      alert("A senha precisa ter pelo menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      alert("As senhas não conferem");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      alert("Senha criada com sucesso!");

      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050814",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#0b1020",
          padding: "40px",
          borderRadius: "16px",
          border: "1px solid #1f2b4d",
        }}
      >
        <h1
          style={{
            color: "white",
            marginBottom: "10px",
          }}
        >
          Criar senha
        </h1>

        <p
          style={{
            color: "#9ca3af",
            marginBottom: "30px",
          }}
        >
          Defina sua senha para acessar o sistema
        </p>

        <input
          type="password"
          placeholder="Nova senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "15px",
            borderRadius: "8px",
            border: "1px solid #24324f",
            background: "#111827",
            color: "white",
          }}
        />

        <input
          type="password"
          placeholder="Confirmar senha"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "20px",
            borderRadius: "8px",
            border: "1px solid #24324f",
            background: "#111827",
            color: "white",
          }}
        />

        <button
          onClick={salvarSenha}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontWeight: "bold",
            background: "#39f38f",
          }}
        >
          {loading ? "Salvando..." : "Criar senha"}
        </button>
      </div>
    </div>
  );
}