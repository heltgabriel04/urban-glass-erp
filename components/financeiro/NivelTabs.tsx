"use client";

import Link from "next/link";

interface Nivel {
  label: string;
  slug: string; // "" = /dashboard-financeiro, senão /dashboard-financeiro/{slug}
  horizonte: string;
}

const NIVEIS: Nivel[] = [
  { label: "Executiva", slug: "", horizonte: "Agora" },
  { label: "Operacional", slug: "operacional", horizonte: "Esta semana" },
  { label: "Analítica", slug: "analitica", horizonte: "Últimos meses" },
  { label: "Estratégica", slug: "estrategica", horizonte: "3–6 meses" },
];

export default function NivelTabs({ ativo }: { ativo: "executiva" | "operacional" | "analitica" | "estrategica" }) {
  return (
    <div className="no-print" style={{ display: "flex", gap: "2px", overflowX: "auto", padding: "0 26px" }}>
      {NIVEIS.map(n => {
        const slug = n.slug || "executiva";
        const href = n.slug ? `/dashboard-financeiro/${n.slug}` : "/dashboard-financeiro";
        const ativoTab = slug === ativo;
        return (
          <Link key={slug} href={href} style={{
            padding: "10px 16px 8px", whiteSpace: "nowrap", textDecoration: "none",
            borderBottom: ativoTab ? "2px solid var(--acc)" : "2px solid transparent",
            marginBottom: "-1px",
          }}>
            <div style={{ fontSize: "12.5px", fontWeight: 700, letterSpacing: "0.01em", color: ativoTab ? "var(--acc)" : "var(--t2)" }}>
              {n.label}
            </div>
            <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>{n.horizonte}</div>
          </Link>
        );
      })}
    </div>
  );
}
