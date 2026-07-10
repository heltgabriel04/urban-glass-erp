"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useEscToClose } from "./useEscToClose";

interface ConfirmOptions {
  titulo?: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  perigo?: boolean; // true = ação destrutiva (botão vermelho)
}

interface ConfirmState extends ConfirmOptions {
  mensagem: string;
  resolve: (v: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (mensagem: string, opts?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: async () => false });

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((mensagem: string, opts?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ mensagem, resolve, ...opts });
    });
  }, []);

  function responder(v: boolean) {
    state?.resolve(v);
    setState(null);
  }

  useEscToClose(!!state, () => responder(false));

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <div
        className={`mov ${state ? "open" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) responder(false); }}
      >
        {state && (
          <div className="mod" style={{ width: 380 }}>
            <div className="mhd">
              <span className="mtit">{state.titulo ?? "Confirmar"}</span>
              <button className="mcl" aria-label="Fechar" onClick={() => responder(false)}>✕</button>
            </div>
            <p style={{ color: "var(--t2)", fontSize: "13.5px", lineHeight: 1.5, whiteSpace: "pre-line", margin: "0 0 20px" }}>
              {state.mensagem}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="btn bg sm" onClick={() => responder(false)}>
                {state.cancelarLabel ?? "Cancelar"}
              </button>
              <button className={`btn sm ${state.perigo ? "bw" : "bp"}`} onClick={() => responder(true)}>
                {state.confirmarLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}
