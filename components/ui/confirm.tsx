"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "./Modal";

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
    console.log("[DIAG-confirm] confirm() chamado, abrindo dialog", { mensagem, opts });
    return new Promise<boolean>((resolve) => {
      setState({ mensagem, resolve, ...opts });
    });
  }, []);

  function responder(v: boolean) {
    console.log("[DIAG-confirm] responder() chamado", { v, stackTrace: new Error().stack });
    state?.resolve(v);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal open={!!state} onClose={() => responder(false)} title={state?.titulo ?? "Confirmar"} width={380}>
        {state && (
          <>
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
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}
