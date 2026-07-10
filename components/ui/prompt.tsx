"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useEscToClose } from "./useEscToClose";

interface PromptOptions {
  titulo?: string;
  placeholder?: string;
  valorInicial?: string;
  obrigatorio?: boolean; // exige texto não vazio pra habilitar o botão
  matchExato?: string;   // exige digitar esse texto exato pra habilitar o botão (ex.: "ZERAR")
  confirmarLabel?: string;
  cancelarLabel?: string;
  perigo?: boolean;
}

interface PromptState extends PromptOptions {
  mensagem: string;
  resolve: (v: string | null) => void;
}

interface PromptContextValue {
  prompt: (mensagem: string, opts?: PromptOptions) => Promise<string | null>;
}

const PromptContext = createContext<PromptContextValue>({ prompt: async () => null });

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PromptState | null>(null);
  const [valor, setValor] = useState("");

  const prompt = useCallback((mensagem: string, opts?: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setValor(opts?.valorInicial ?? "");
      setState({ mensagem, resolve, ...opts });
    });
  }, []);

  function responder(v: string | null) {
    state?.resolve(v);
    setState(null);
  }

  useEscToClose(!!state, () => responder(null));

  const podeConfirmar = state
    ? (state.matchExato ? valor === state.matchExato : (!state.obrigatorio || valor.trim().length > 0))
    : false;

  return (
    <PromptContext.Provider value={{ prompt }}>
      {children}
      <div
        className={`mov ${state ? "open" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) responder(null); }}
      >
        {state && (
          <div className="mod" style={{ width: 400 }}>
            <div className="mhd">
              <span className="mtit">{state.titulo ?? "Confirmar"}</span>
              <button className="mcl" aria-label="Fechar" onClick={() => responder(null)}>✕</button>
            </div>
            <p style={{ color: "var(--t2)", fontSize: "13.5px", lineHeight: 1.5, whiteSpace: "pre-line", margin: "0 0 14px" }}>
              {state.mensagem}
            </p>
            <form onSubmit={(e) => { e.preventDefault(); if (podeConfirmar) responder(valor); }}>
              <input
                className="fc"
                autoFocus
                value={valor}
                placeholder={state.placeholder}
                onChange={(e) => setValor(e.target.value)}
              />
            </form>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button className="btn bg sm" onClick={() => responder(null)}>
                {state.cancelarLabel ?? "Cancelar"}
              </button>
              <button
                className={`btn sm ${state.perigo ? "bw" : "bp"}`}
                disabled={!podeConfirmar}
                onClick={() => responder(valor)}
              >
                {state.confirmarLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  return useContext(PromptContext).prompt;
}
