import { useEffect } from "react";

// Atalho de teclado global — ignora quando o foco está num campo de
// digitação, pra não atrapalhar quem está preenchendo um formulário.
// `key` casa com `e.key` (ex.: "/", "n"); `ctrlEnter: true` casa Ctrl+Enter
// (ou Cmd+Enter no Mac) em vez de `key`.
export function useGlobalShortcut(
  key: string,
  handler: () => void,
  ativo: boolean = true,
  opts?: { ctrlEnter?: boolean }
) {
  useEffect(() => {
    if (!ativo) return;
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const emCampo = !!alvo && (
        alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable
      );

      if (opts?.ctrlEnter) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handler();
        }
        return;
      }

      if (emCampo) return;
      if (e.key === key) {
        e.preventDefault();
        handler();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, ativo, opts?.ctrlEnter, handler]);
}
