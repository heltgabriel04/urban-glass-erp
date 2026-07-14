"use client";

import Link from "next/link";

interface Aba {
  label: string;
  slug: string; // "" = /contabilidade, senão /contabilidade/{slug}
}

const ABAS: Aba[] = [
  { label: "Dashboard", slug: "" },
  { label: "Checklist Mensal", slug: "checklist" },
  { label: "Documentos Fiscais", slug: "documentos" },
  { label: "Estoque / CMV", slug: "estoque" },
  { label: "Ativo Imobilizado", slug: "ativo-imobilizado" },
  { label: "Cartões", slug: "cartoes" },
  { label: "Empréstimos", slug: "emprestimos" },
  { label: "Consórcios", slug: "consorcios" },
  { label: "Documentos Diversos", slug: "diversos" },
  { label: "Configuração Fiscal", slug: "fiscal-produtos" },
];

export default function ContabilidadeTabs({ ativo }: { ativo: "dashboard" | "checklist" | "documentos" | "estoque" | "ativo-imobilizado" | "cartoes" | "emprestimos" | "consorcios" | "diversos" | "fiscal-produtos" }) {
  return (
    <div className="no-print" style={{ display: "flex", gap: "2px", overflowX: "auto", padding: "0 26px" }}>
      {ABAS.map((a) => {
        const slug = a.slug || "dashboard";
        const href = a.slug ? `/contabilidade/${a.slug}` : "/contabilidade";
        const ativoTab = slug === ativo;
        return (
          <Link key={slug} href={href} style={{
            padding: "10px 16px 8px", whiteSpace: "nowrap", textDecoration: "none",
            borderBottom: ativoTab ? "2px solid var(--acc)" : "2px solid transparent",
            marginBottom: "-1px",
          }}>
            <div style={{ fontSize: "12.5px", fontWeight: 700, letterSpacing: "0.01em", color: ativoTab ? "var(--acc)" : "var(--t2)" }}>
              {a.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
