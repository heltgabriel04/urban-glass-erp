"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { PromptProvider } from "@/components/ui/prompt";
import CommandPalette from "@/components/ui/CommandPalette";

interface Props {
  children: React.ReactNode;
}

export default function AppLayout({ children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PromptProvider>
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
          </PromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}