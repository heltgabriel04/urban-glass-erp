"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Breadcrumb from "@/components/ui/Breadcrumb";

interface Tab {
  label: string;
  slug: string; // "" = /pedidos/{id}, senão /pedidos/{id}/{slug}
  precisaItens?: boolean;
}

const TABS: Tab[] = [
  { label: "Visão Geral", slug: "" },
  { label: "Editar", slug: "editar" },
  { label: "Checklist", slug: "checklist" },
  { label: "Retiradas", slug: "retiradas", precisaItens: true },
  { label: "Etiquetas", slug: "etiquetas", precisaItens: true },
  { label: "Plano de Corte", slug: "plano", precisaItens: true },
];

export default function PedidoTabs({ id, temItens }: { id: string; temItens: boolean }) {
  const pathname = usePathname();

  return (
    <div className="no-print" style={{ padding: "10px 26px 0", background: "var(--surf)" }}>
      <Breadcrumb items={[{ label: "Pedidos", href: "/pedidos" }, { label: id }]} />
      <div style={{ display: "flex", gap: "2px", overflowX: "auto" }}>
        {TABS.map(t => {
          const href = t.slug ? `/pedidos/${id}/${t.slug}` : `/pedidos/${id}`;
          const ativo = pathname === href;
          const desabilitado = t.precisaItens && !temItens;
          if (desabilitado) {
            return (
              <span key={t.label} style={{
                padding: "8px 14px", fontSize: "12px", fontWeight: 600, color: "var(--t3)",
                opacity: 0.35, whiteSpace: "nowrap", cursor: "default",
              }} title="Sem itens neste pedido">
                {t.label}
              </span>
            );
          }
          return (
            <Link key={t.label} href={href} style={{
              padding: "8px 14px", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
              textDecoration: "none", borderBottom: ativo ? "2px solid var(--acc)" : "2px solid transparent",
              color: ativo ? "var(--acc)" : "var(--t3)", marginBottom: "-1px", letterSpacing: "0.02em",
            }}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
