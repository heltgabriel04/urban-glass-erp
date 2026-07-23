# Estoque por Caixa — Sub-projeto 3: Etiquetas de caixa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar e (re)imprimir etiquetas individuais por caixa de vidro, com QR real, seguindo o mesmo padrão já existente para etiquetas de retalho.

**Architecture:** Reaproveita o padrão de `app/retalhos/etiquetas/page.tsx` (seleção via `sessionStorage`, página de impressão dedicada, CSS de etiqueta térmica 100×50mm) — sem tabela nova, sem lógica pura nova. A rota pública do QR (`app/api/cx/[token]/route.ts`) já existe (sub-projeto 1).

**Tech Stack:** Next.js (App Router), React, `qrcode.react` (já é dependência, usado em `app/pedidos/[id]/etiquetas/page.tsx`).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-23-etiquetas-caixa-design.md`.
- Sem flag de "já impressa" — reimprimir é só repetir a seleção, a qualquer momento (mesma filosofia do retalho).
- QR aponta pra `https://urbanglasserp.vercel.app/api/cx/{qr_token}` — mesmo domínio hardcoded que as etiquetas de pedido já usam.
- Depois de cada task: `npx tsc --noEmit` limpo e `npx vitest run` com os 216 testes existentes passando (nenhum teste novo esperado — páginas de apresentação/impressão não têm suíte dedicada neste projeto, mesmo padrão de `app/retalhos/etiquetas/page.tsx`).
- Antes do commit final (última task), rodar também `npx next build`.
- Commits em português, seguindo o estilo do histórico do repo.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `types/index.ts` | modificar | `LoteEstoque.produtos` ganha `espessura`/`cor` opcionais |
| `services/lotes.service.ts` | modificar | nova `getCaixasPorIds(ids)` |
| `app/estoque/caixas/page.tsx` | modificar | checkboxes de seleção, "Imprimir selecionadas", botão 🖨 por linha |
| `app/estoque/caixas/etiquetas/page.tsx` | criar | página de impressão da etiqueta de caixa (QR real) |

---

### Task 1: Tipo ampliado + `getCaixasPorIds`

**Files:**
- Modify: `types/index.ts:1434` (`LoteEstoque.produtos`)
- Modify: `services/lotes.service.ts` (nova função, no fim do arquivo)

**Interfaces:**
- Produces: `LoteEstoque.produtos?: Pick<Produto, 'nome' | 'espessura' | 'cor'> | null`; `getCaixasPorIds(ids: number[]): Promise<LoteEstoque[]>`. Consumidos pela Task 3.

- [ ] **Step 1: Ampliar `LoteEstoque.produtos` em `types/index.ts`**

Em `types/index.ts:1434`, trocar:

```ts
  produtos?: { nome: string } | null;
```

por:

```ts
  produtos?: Pick<Produto, 'nome' | 'espessura' | 'cor'> | null;
```

(mesmo padrão já usado em outras interfaces do arquivo, ex. `types/index.ts:276`, `Pick<Produto, 'id' | 'nome' | 'cod' | 'chapas_por_colar'>` — evita duplicar os mesmos 4 campos como um tipo inline.)

- [ ] **Step 2: Adicionar `getCaixasPorIds` em `services/lotes.service.ts`**

No fim do arquivo (depois de `calcularCustoPepsProduto`):

```ts
// ─── ETIQUETAS (Estoque > Caixas > Imprimir) ─────────────────
//
// Busca direta por IDs, sem os filtros de getLotesUtilizaveis/
// getTodasCaixas — mesmo padrão de app/retalhos/etiquetas/page.tsx
// (busca só o que foi selecionado pra imprimir, preservando a
// ordem de seleção é responsabilidade de quem chama).
export async function getCaixasPorIds(ids: number[]): Promise<LoteEstoque[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('lotes_estoque')
    .select('*, produtos(nome, espessura, cor)')
    .in('id', ids);
  if (error) { console.error('getCaixasPorIds:', error); return []; }
  return data as LoteEstoque[];
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 216 testes passando.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts services/lotes.service.ts
git commit -m "feat(estoque): tipo LoteEstoque.produtos ganha espessura/cor + getCaixasPorIds"
```

---

### Task 2: Seleção e impressão em `/estoque/caixas`

**Files:**
- Modify: `app/estoque/caixas/page.tsx` (imports, state, topbar, tabela)

**Interfaces:**
- Consumes: nenhuma nova (usa `useRouter` de `next/navigation`, já padrão no projeto).
- Produces: grava `sessionStorage["caixas_etiquetas_ids"]`, consumido pela Task 3.

- [ ] **Step 1: Imports e novo state**

Em `app/estoque/caixas/page.tsx:1-8`, trocar:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getTodasCaixas } from "@/services/lotes.service";
import { statusCaixa } from "@/lib/caixaEstoque";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { LoteEstoque } from "@/types";
```

por:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getTodasCaixas } from "@/services/lotes.service";
import { statusCaixa } from "@/lib/caixaEstoque";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { LoteEstoque } from "@/types";
```

Em `app/estoque/caixas/page.tsx:18-22` (dentro do componente), trocar:

```tsx
export default function CaixasEstoquePage() {
  const [caixas, setCaixas]   = useState<LoteEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProduto, setFiltroProduto] = useState<number | "todas">("todas");
  const [filtroStatus, setFiltroStatus]   = useState<FiltroStatus>("todas");
```

por:

```tsx
export default function CaixasEstoquePage() {
  const router = useRouter();
  const [caixas, setCaixas]   = useState<LoteEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProduto, setFiltroProduto] = useState<number | "todas">("todas");
  const [filtroStatus, setFiltroStatus]   = useState<FiltroStatus>("todas");
  // Todas começam selecionadas — 1 clique em "Imprimir" continua imprimindo
  // tudo que está visível; a seleção só serve pra excluir (mesmo padrão de
  // app/pedidos/[id]/etiquetas/page.tsx).
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Popular a seleção quando as caixas carregam**

Em `app/estoque/caixas/page.tsx:24-26`, trocar:

```tsx
  useEffect(() => {
    getTodasCaixas().then(c => { setCaixas(c); setLoading(false); });
  }, []);
```

por:

```tsx
  useEffect(() => {
    getTodasCaixas().then(c => {
      setCaixas(c);
      setSelecionadas(new Set(c.map(item => item.id)));
      setLoading(false);
    });
  }, []);
```

- [ ] **Step 3: Funções de seleção e impressão**

Depois do cálculo de `caixasFiltradas` (`app/estoque/caixas/page.tsx:34-38`), adicionar:

```tsx
  function toggleSelecao(id: number) {
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selecionarTodasVisiveis() {
    setSelecionadas(prev => {
      const next = new Set(prev);
      caixasFiltradas.forEach(c => next.add(c.id));
      return next;
    });
  }

  function limparSelecaoVisiveis() {
    setSelecionadas(prev => {
      const next = new Set(prev);
      caixasFiltradas.forEach(c => next.delete(c.id));
      return next;
    });
  }

  function imprimir(ids: number[]) {
    sessionStorage.setItem("caixas_etiquetas_ids", JSON.stringify(ids));
    router.push("/estoque/caixas/etiquetas");
  }

  const totalSelecionadasVisiveis = caixasFiltradas.filter(c => selecionadas.has(c.id)).length;
```

- [ ] **Step 4: Botões na topbar**

Em `app/estoque/caixas/page.tsx:51-62` (bloco de filtros na topbar), trocar:

```tsx
        <div style={{ display: "flex", gap: 8 }}>
          <select className="fc sm" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value === "todas" ? "todas" : Number(e.target.value))}>
            <option value="todas">Todos os produtos</option>
            {produtosOpts.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select className="fc sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as FiltroStatus)}>
            <option value="todas">Todos os status</option>
            <option value="fechada">Fechada</option>
            <option value="aberta">Aberta</option>
            <option value="esgotada">Esgotada</option>
          </select>
        </div>
```

por:

```tsx
        <div style={{ display: "flex", gap: 8 }}>
          <select className="fc sm" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value === "todas" ? "todas" : Number(e.target.value))}>
            <option value="todas">Todos os produtos</option>
            {produtosOpts.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select className="fc sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as FiltroStatus)}>
            <option value="todas">Todos os status</option>
            <option value="fechada">Fechada</option>
            <option value="aberta">Aberta</option>
            <option value="esgotada">Esgotada</option>
          </select>
          <button className="btn bg sm" onClick={selecionarTodasVisiveis}>Selecionar todas</button>
          <button className="btn bg sm" onClick={limparSelecaoVisiveis}>Limpar seleção</button>
          <button className="btn bp sm" onClick={() => imprimir(caixasFiltradas.filter(c => selecionadas.has(c.id)).map(c => c.id))} disabled={totalSelecionadasVisiveis === 0}>
            🖨 Imprimir selecionadas ({totalSelecionadasVisiveis})
          </button>
        </div>
```

- [ ] **Step 5: Coluna de checkbox + botão de impressão individual na tabela**

Em `app/estoque/caixas/page.tsx:68-77` (`<thead>`), trocar:

```tsx
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th>Medida</th>
                <th>Status</th>
                <th>Chapas (saldo/entrada)</th>
                <th>m² saldo</th>
                <th>Data de entrada</th>
              </tr>
            </thead>
```

por:

```tsx
            <thead>
              <tr>
                <th></th>
                <th>Código</th>
                <th>Produto</th>
                <th>Medida</th>
                <th>Status</th>
                <th>Chapas (saldo/entrada)</th>
                <th>m² saldo</th>
                <th>Data de entrada</th>
                <th></th>
              </tr>
            </thead>
```

Em `app/estoque/caixas/page.tsx:80-93` (linha da tabela), trocar:

```tsx
              {caixasFiltradas.map(c => {
                const status = statusCaixa(c.chapas_saldo, c.chapas_entrada);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{c.codigo}</td>
                    <td>{c.produtos?.nome ?? `#${c.produto_id}`}</td>
                    <td className="mono">{c.chapa_largura_mm ?? "—"} × {c.chapa_altura_mm ?? "—"} mm</td>
                    <td><span className={CHIP_STATUS[status]}>{status}</span></td>
                    <td className="mono">{c.chapas_saldo} / {c.chapas_entrada}</td>
                    <td className="mono">{formatM2(Number(c.m2_saldo))}</td>
                    <td className="mono">{c.dt_entrada_estimada ? "estimada" : formatDate(c.dt_entrada)}</td>
                  </tr>
                );
              })}
```

por:

```tsx
              {caixasFiltradas.map(c => {
                const status = statusCaixa(c.chapas_saldo, c.chapas_entrada);
                return (
                  <tr key={c.id}>
                    <td>
                      <input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => toggleSelecao(c.id)}
                        style={{ width: "14px", height: "14px", cursor: "pointer" }} />
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>{c.codigo}</td>
                    <td>{c.produtos?.nome ?? `#${c.produto_id}`}</td>
                    <td className="mono">{c.chapa_largura_mm ?? "—"} × {c.chapa_altura_mm ?? "—"} mm</td>
                    <td><span className={CHIP_STATUS[status]}>{status}</span></td>
                    <td className="mono">{c.chapas_saldo} / {c.chapas_entrada}</td>
                    <td className="mono">{formatM2(Number(c.m2_saldo))}</td>
                    <td className="mono">{c.dt_entrada_estimada ? "estimada" : formatDate(c.dt_entrada)}</td>
                    <td>
                      <button className="btn bw xs" onClick={() => imprimir([c.id])} title="Gerar/reimprimir etiqueta desta caixa">🖨</button>
                    </td>
                  </tr>
                );
              })}
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 216 testes passando.

- [ ] **Step 7: Commit**

```bash
git add app/estoque/caixas/page.tsx
git commit -m "feat(estoque): selecao multipla e impressao individual na lista de caixas"
```

---

### Task 3: Página de impressão `/estoque/caixas/etiquetas`

**Files:**
- Create: `app/estoque/caixas/etiquetas/page.tsx`

**Interfaces:**
- Consumes: `getCaixasPorIds` (Task 1), `sessionStorage["caixas_etiquetas_ids"]` (Task 2), `statusCaixa` (`lib/caixaEstoque.ts`, já existe).

- [ ] **Step 1: Criar a página**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getCaixasPorIds } from "@/services/lotes.service";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { LoteEstoque } from "@/types";

function EtiquetaCaixaCard({ c, num }: { c: LoteEstoque; num: number }) {
  const dataEntrada = c.dt_entrada_estimada ? "—" : formatDate(c.dt_entrada);
  const qrData = `https://urbanglasserp.vercel.app/api/cx/${c.qr_token}`;

  return (
    <div className="etiqueta">
      <div className="et-topo">
        <div className="et-empresa">URBAN GLASS</div>
        <div className="et-seq">#{String(num).padStart(3, "0")}</div>
      </div>
      <div className="et-corpo">
        <div className="et-esq">
          <div className="et-linha">
            <span className="et-lbl">CAIXA</span>
            <span className="et-val et-cliente">{c.codigo}</span>
          </div>
          <div className="et-linha">
            <span className="et-lbl">VIDRO</span>
            <span className="et-val">{c.produtos?.nome ?? `#${c.produto_id}`}</span>
          </div>
          <div className="et-linha">
            <span className="et-lbl">ESPESSURA / COR</span>
            <span className="et-val">{c.produtos?.espessura ?? "—"} · {c.produtos?.cor ?? "—"}</span>
          </div>
          <div className="et-linha et-dim">
            <span className="et-lbl">MEDIDA</span>
            <span className="et-val et-medidas">{c.chapa_largura_mm ?? "—"} × {c.chapa_altura_mm ?? "—"} mm</span>
          </div>
          <div className="et-rodape-info">
            <span>Chapas: {c.chapas_saldo}</span>
            <span className="et-sep">·</span>
            <span>Área: {formatM2(Number(c.m2_saldo))}</span>
            <span className="et-sep">·</span>
            <span>Entrada: {dataEntrada}</span>
          </div>
        </div>
        <div className="et-dir">
          <QRCodeSVG value={qrData} size={72} bgColor="#ffffff" fgColor="#000000" level="M" />
          <div className="et-qrlbl">ESCANEAR</div>
        </div>
      </div>
    </div>
  );
}

export default function EtiquetasCaixasPage() {
  const router = useRouter();
  const [caixas, setCaixas] = useState<LoteEstoque[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const raw = sessionStorage.getItem("caixas_etiquetas_ids");
      const ids: number[] = raw ? JSON.parse(raw) : [];
      if (ids.length === 0) { setLoading(false); return; }

      const data = await getCaixasPorIds(ids);
      const porId = new Map(data.map(c => [c.id, c]));
      setCaixas(ids.map(id => porId.get(id)).filter((c): c is LoteEstoque => !!c));
      setLoading(false);
    }
    load();
  }, []);

  if (loading)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", color: "#333" }}>
        Gerando etiquetas...
      </div>
    );

  if (caixas.length === 0)
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", fontFamily: "Arial" }}>
        <div style={{ color: "#c00", fontWeight: 700 }}>Nenhuma caixa selecionada.</div>
        <button onClick={() => router.push("/estoque/caixas")} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #ccc", cursor: "pointer" }}>
          ← Voltar
        </button>
      </div>
    );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: Arial, sans-serif; background: #666; color: #000; height: auto; overflow-y: auto; }

        .toolbar {
          position: sticky; top: 0; z-index: 100;
          background: #111; padding: 8px 20px;
          display: flex; align-items: center; gap: 10px;
        }
        .toolbar-title { flex: 1; color: white; font-size: 13px; font-weight: 700; }
        .toolbar-title span { color: #3dffa0; }
        .btn-back {
          padding: 6px 12px; border-radius: 4px; border: 1px solid #555;
          background: transparent; color: #ccc; cursor: pointer; font-size: 12px; font-family: Arial;
        }
        .btn-print {
          padding: 7px 16px; border-radius: 4px; border: none;
          background: #3dffa0; color: #000; font-weight: 700; cursor: pointer; font-size: 12px; font-family: Arial;
        }

        .grid-wrapper {
          padding: 24px;
          display: flex; flex-direction: column; align-items: center; gap: 20px;
        }

        .etiqueta {
          width: 500px; height: 250px;
          background: white;
          border: 2px solid #555;
          border-radius: 8px;
          overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }

        .et-topo {
          background: #000; color: white;
          padding: 6px 14px;
          display: flex; justify-content: space-between; align-items: center;
          flex-shrink: 0;
        }
        .et-empresa {
          font-size: 15px; font-weight: 900; letter-spacing: 3px;
          font-family: Arial Black, Arial, sans-serif;
        }
        .et-seq { font-size: 12px; font-family: 'Courier New', monospace; color: #bbb; }

        .et-corpo {
          flex: 1; display: flex; padding: 10px 12px 8px 14px; gap: 10px;
          min-height: 0;
        }
        .et-esq {
          flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0;
        }
        .et-dir {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 3px; flex-shrink: 0;
        }
        .et-qrlbl {
          font-size: 8px; color: #333; letter-spacing: 1px;
          font-family: 'Courier New', monospace; text-align: center; font-weight: 700;
        }

        .et-linha { display: flex; flex-direction: column; gap: 0; }
        .et-lbl {
          font-size: 8px; font-weight: 900; letter-spacing: 1.5px;
          color: #333; line-height: 1; text-transform: uppercase;
        }
        .et-val {
          font-size: 14px; font-weight: 700; color: #000;
          line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .et-cliente { font-size: 17px; font-weight: 900; }
        .et-medidas {
          font-size: 16px; font-weight: 900;
          font-family: 'Courier New', monospace; color: #000;
        }
        .et-dim { margin-top: 2px; }

        .et-rodape-info {
          margin-top: auto;
          font-size: 10px; font-family: 'Courier New', monospace;
          color: #000; font-weight: 700;
          border-top: 1px solid #ddd; padding-top: 4px;
          display: flex; gap: 4px; align-items: center; flex-wrap: wrap;
        }
        .et-sep { color: #888; }

        @media print {
          .toolbar { display: none !important; }

          @page {
            size: 100mm 50mm landscape;
            margin: 0;
          }

          html, body {
            background: white;
            margin: 0; padding: 0;
            width: 100mm; height: 50mm;
            overflow: visible;
          }

          .grid-wrapper {
            display: block;
            padding: 0; margin: 0;
            width: 100mm;
            background: white;
            overflow: visible;
          }

          .etiqueta {
            display: flex; flex-direction: column;
            width: 87mm; height: 44mm;
            box-sizing: border-box;
            border: none; border-radius: 0;
            box-shadow: none; overflow: hidden;
            margin: 4mm auto 0 auto; padding: 0;
            page-break-after: always; break-after: page;
          }

          .et-topo {
            padding: 3px 6px;
            background: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            flex-shrink: 0;
          }
          .et-corpo { padding: 3px 4px 3px 4px; gap: 6px; }
          .et-dir img { width: 64px !important; height: 64px !important; }

          .et-empresa { font-size: 9pt; letter-spacing: 2px; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .et-seq     { font-size: 7pt; color: #ccc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .et-lbl     { font-size: 7pt; color: #000 !important; font-weight: 900 !important; letter-spacing: 0.5px; }
          .et-val     { font-size: 8pt; color: #000 !important; font-weight: 900 !important; }
          .et-cliente { font-size: 10pt; color: #000 !important; font-weight: 900 !important; }
          .et-medidas { font-size: 9pt; color: #000 !important; font-weight: 900 !important; }
          .et-rodape-info { font-size: 7pt; color: #000 !important; font-weight: 700 !important; border-top: 0.3pt solid #ccc; padding-top: 2px; margin-top: 2px !important; }
          .et-qrlbl   { font-size: 7pt; color: #000 !important; font-weight: 700 !important; }
          .et-dim     { margin-top: 0; }
        }
      `}</style>

      <div className="toolbar">
        <button className="btn-back" onClick={() => router.push("/estoque/caixas")}>← Voltar</button>
        <div className="toolbar-title">
          Etiquetas de Caixas
          <span style={{ fontSize: "11px", color: "#aaa", marginLeft: "12px" }}>{caixas.length} etiqueta(s)</span>
        </div>
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      <div className="grid-wrapper">
        {caixas.map((c, i) => (
          <EtiquetaCaixaCard key={c.id} c={c} num={i + 1} />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 216 testes passando.

- [ ] **Step 3: Commit**

```bash
git add app/estoque/caixas/etiquetas/page.tsx
git commit -m "feat(estoque): pagina de impressao das etiquetas de caixa com QR real"
```

---

### Task 4: Verificação final

**Files:** nenhum (task só de verificação).

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit` — Expected: limpo, zero erros.

- [ ] **Step 2: Suite de testes completa**

Run: `npx vitest run` — Expected: 216 testes passando (sem testes novos nesta leva).

- [ ] **Step 3: Build de produção**

Run: `npx next build` — Expected: compila sem erro; `/estoque/caixas` e `/estoque/caixas/etiquetas` aparecem no output.

- [ ] **Step 4: Checklist manual no navegador**

Abrir `/estoque/caixas` (com pelo menos uma caixa ativa no banco — rodar `sql/carga-estoque-caixas-2026-07-23.sql` antes, se ainda não rodado) e conferir:

- [ ] Checkboxes aparecem, todas começam marcadas.
- [ ] "Imprimir selecionadas (N)" reflete a seleção atual e desabilita com 0 selecionadas.
- [ ] Botão 🖨 de uma linha abre a tela de etiquetas só com aquela caixa.
- [ ] Cada etiqueta mostra código, vidro, espessura/cor, medida, chapas, área, data de entrada (ou "—" se estimada) e um QR.
- [ ] Escanear o QR (ou abrir a URL manualmente) abre a página pública da caixa com os dados batendo.
- [ ] Reimprimir a mesma caixa depois funciona normalmente (sem nenhum estado de "já impressa" bloqueando).

- [ ] **Step 5: Commit final (se sobrar algum ajuste)**

Se o checklist manual encontrar qualquer ajuste necessário, fazer o ajuste pontual e commitar separadamente. Se tudo passar, nenhum commit adicional é necessário aqui.
