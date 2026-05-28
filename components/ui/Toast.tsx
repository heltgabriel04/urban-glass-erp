"use client";

import { createContext, useCallback, useContext, useState } from "react";

// ─── TIPOS ────────────────────────────────────────────────
type ToastTipo = "ok" | "warn" | "err";

interface ToastItem {
  id: number;
  msg: string;
  tipo: ToastTipo;
}

interface ToastContextValue {
  toast: (msg: string, tipo?: ToastTipo) => void;
}

// ─── CONTEXT ──────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

// ─── PROVIDER ─────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, tipo: ToastTipo = "ok") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, tipo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            {t.tipo === "ok"   && "✓ "}
            {t.tipo === "warn" && "⚠ "}
            {t.tipo === "err"  && "✕ "}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── HOOK ─────────────────────────────────────────────────
export function useToast() {
  return useContext(ToastContext);
}