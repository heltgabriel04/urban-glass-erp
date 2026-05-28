"use client";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { ToastProvider } from "@/components/ui/toast";

interface Props {
  children: React.ReactNode;
}

export default function AppLayout({ children }: Props) {
  return (
    <ToastProvider>
      <div className="erp-layout">
        <Sidebar />
        <div className="erp-content">
          <Topbar />
          <main className="erp-main">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}