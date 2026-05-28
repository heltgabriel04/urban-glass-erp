"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/");
  }

  return (
    <div className="min-h-screen bg-[#020816] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#0b1220] border border-[#173056] rounded-3xl p-8 shadow-2xl">

        <div className="mb-8">
          <img
            src="/logo.png"
            alt="UrbanGlass"
            className="h-12 mb-6"
          />

          <h1 className="text-4xl font-bold text-white mb-2">
            Bem-vindo
          </h1>

          <p className="text-gray-400 text-sm">
            Entre com suas credenciais para acessar
          </p>
        </div>

        <form onSubmit={handleLogin}>

          <div className="mb-4">
            <label className="block text-xs text-gray-400 uppercase mb-2">
              E-mail
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="w-full bg-[#101827] border border-[#1f365c] rounded-xl px-4 py-4 text-white outline-none focus:border-[#38ef7d]"
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs text-gray-400 uppercase mb-2">
              Senha
            </label>

            <input
              type="password"
              required
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              className="w-full bg-[#101827] border border-[#1f365c] rounded-xl px-4 py-4 text-white outline-none focus:border-[#38ef7d]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#43f08f] hover:opacity-90 transition rounded-xl py-4 font-bold text-black"
          >
            {loading
              ? "Entrando..."
              : "→ Entrar"}
          </button>
        </form>

        <div className="mt-8 border-t border-[#1c2b46] pt-6 text-center text-xs text-gray-500">
          urban-glass-erp • acesso restrito
        </div>

      </div>
    </div>
  );
}