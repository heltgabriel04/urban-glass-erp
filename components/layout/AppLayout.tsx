"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import CommandPalette from "@/components/ui/CommandPalette";

interface Props {
  children: React.ReactNode;
}

// ThemeProvider/ToastProvider/ConfirmProvider/PromptProvider moraram aqui
// até 2026-07-20 — cada página renderiza AppLayout dentro do próprio return,
// então um useConfirm()/useToast() chamado no topo da página nunca enxergava
// o Provider que a própria página criava como filho dela (Context só resolve
// ancestrais reais, e o Provider virava descendente, não ancestral). Os 4
// Providers agora vivem em app/layout.tsx, acima de toda página de verdade.
export default function AppLayout({ children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <CommandPalette />
      <div className="erp-layout">
        <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        <div className="erp-content">
          <Topbar onMenuClick={() => setMobileNavOpen(o => !o)} />
          <main className="erp-main">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}