# Captação de NF-e de Entrada via SIEG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Buscar Notas Recebidas" na tela de Compras que consulta
a SIEG por NF-e de entrada pendentes e reaproveita a tela de revisão de
importação de XML já existente, em vez do usuário precisar baixar e
subir o arquivo manualmente.

**Architecture:** Uma rota server-side isola a única parte incerta
(chamada real à API da SIEG, ainda não confirmada); um service
client-side chama essa rota; um modal novo lista as notas pendentes
(filtradas contra o que já foi importado) e cada uma vira um `File`
sintético que abre o modal de revisão já existente, sem duplicar
nenhuma lógica de parsing/casamento/confirmação.

**Tech Stack:** Next.js (App Router, Route Handlers, client components),
Supabase-js, TypeScript.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-20-captacao-nfe-entrada-sieg-design.md`.
- **A chamada real à API da SIEG não está confirmada** (endpoint,
  autenticação, formato de resposta, se cobre NF-e de entrada sem
  certificado digital A1). Não inventar uma URL/formato como se fosse
  real — a função que faria essa chamada deve lançar um erro claro e
  isolado, não uma implementação fictícia disfarçada de real.
- **Reaproveitar 100% do fluxo de revisão já existente**
  (`ImportarXmlCompraModal`, `parseXmlCompra`, `casarFornecedorPorCnpj`,
  `casarProdutoPorNome`, `getDocumentoFiscalPorChaveAcesso`) — a única
  mudança nesse modal é um prop novo opcional que pula a etapa de
  escolher o arquivo manualmente.
- Rota nova protegida com `requireAuth()` (mesmo padrão de
  `app/api/notas/emitir/route.ts` e `app/api/clientes/[id]/relatorio-pdf/route.tsx`).
- Nova env var `SIEG_API_KEY` (server-only, nunca exposta ao cliente).
- Sem teste automatizado — nenhuma rota de API, componente ou página
  deste projeto tem teste (só `lib/` puro, que não muda nesta feature).
  Verificação via `npx tsc --noEmit` e `npm run build`.
- Commit direto na `main` (workflow padrão do projeto), mensagens em
  português no padrão do `git log --oneline`.
- Este projeto mistura CRLF/LF; se um "Localizar" não casar byte a
  byte, releia o trecho atual do arquivo e monte o `old_string` a
  partir dele.

---

### Task 1: Rota server-side + service client-side

**Files:**
- Create: `app/api/compras/buscar-notas-sieg/route.ts`
- Create: `services/siegNfe.service.ts`

**Interfaces:**
- Produces: `NotaSieg { chaveAcesso: string; numeroNF: string | null; emitenteNome: string | null; emitenteCnpj: string | null; dataEmissao: string | null; xml: string }`
  (definida em `route.ts`, re-exportada por `siegNfe.service.ts`);
  `buscarNotasSieg(periodo: { inicio: string; fim: string }): Promise<{ notas: NotaSieg[]; erro: string | null }>`
  — exportada de `services/siegNfe.service.ts`, é o que os componentes
  vão consumir (Tasks 3-4 nunca importam de dentro de `app/api/`).

- [ ] **Step 1: Criar a rota**

Criar `app/api/compras/buscar-notas-sieg/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";

export interface NotaSieg {
  chaveAcesso: string;
  numeroNF: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  dataEmissao: string | null;
  xml: string;
}

// Chamada real à API da SIEG — DETALHES AINDA NÃO CONFIRMADOS pelo
// usuário (endpoint, forma de autenticação, formato de resposta, se
// cobre NF-e de entrada sem certificado digital A1 cadastrado no
// painel deles). Ver
// docs/superpowers/specs/2026-07-20-captacao-nfe-entrada-sieg-design.md.
// Isolada nesta única função — quando o contrato real for confirmado,
// só ela precisa mudar; nada na rota, no service client-side nem nos
// componentes depende de como essa chamada é feita por dentro.
async function chamarSiegApi(apiKey: string, inicio: string, fim: string): Promise<NotaSieg[]> {
  throw new Error(
    "Integração com a SIEG ainda não confirmada — endpoint, autenticação e formato de resposta pendentes de confirmação com o suporte deles. Ver docs/superpowers/specs/2026-07-20-captacao-nfe-entrada-sieg-design.md."
  );
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const apiKey = process.env.SIEG_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "SIEG_API_KEY não configurada" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  if (!inicio || !fim) {
    return NextResponse.json({ error: "Parâmetros 'inicio' e 'fim' são obrigatórios" }, { status: 400 });
  }

  try {
    const notas = await chamarSiegApi(apiKey, inicio, fim);
    return NextResponse.json({ notas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro de conexão com a SIEG";
    console.error("api/compras/buscar-notas-sieg:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Criar o service client-side**

Criar `services/siegNfe.service.ts`:

```ts
import type { NotaSieg } from "@/app/api/compras/buscar-notas-sieg/route";

export type { NotaSieg };

export interface PeriodoBusca { inicio: string; fim: string; }

export async function buscarNotasSieg(periodo: PeriodoBusca): Promise<{ notas: NotaSieg[]; erro: string | null }> {
  try {
    const params = new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim });
    const res = await fetch(`/api/compras/buscar-notas-sieg?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) return { notas: [], erro: json.error ?? `Erro ${res.status}` };
    return { notas: (json.notas ?? []) as NotaSieg[], erro: null };
  } catch (err) {
    console.error("buscarNotasSieg:", err);
    return { notas: [], erro: "Erro de conexão" };
  }
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "app/api/compras/buscar-notas-sieg/route.ts" services/siegNfe.service.ts
git commit -m "feat: rota e service pra buscar notas recebidas na SIEG"
```

---

### Task 2: `ImportarXmlCompraModal` ganha `arquivoInicial`

**Files:**
- Modify: `components/ui/ImportarXmlCompraModal.tsx`

**Interfaces:**
- Produces: `Props` de `ImportarXmlCompraModal` ganha o campo opcional
  `arquivoInicial?: File`. Nenhuma outra interface do componente muda
  (`DadosImportadosXml`, `onImportar`, etc. idênticos a hoje).

- [ ] **Step 1: Importar `useEffect`**

Localizar em `components/ui/ImportarXmlCompraModal.tsx`:

```tsx
import { useState } from "react";
```

Substituir por:

```tsx
import { useEffect, useState } from "react";
```

- [ ] **Step 2: Novo prop**

Localizar:

```tsx
interface Props {
  produtos: ProdutoOpt[];
  fornecedores: FornecedorOpt[];
  onImportar: (dados: DadosImportadosXml) => void;
  onFornecedorCriado: (fornecedor: FornecedorOpt) => void;
  onClose: () => void;
}

export default function ImportarXmlCompraModal({ produtos, fornecedores, onImportar, onFornecedorCriado, onClose }: Props) {
```

Substituir por:

```tsx
interface Props {
  produtos: ProdutoOpt[];
  fornecedores: FornecedorOpt[];
  onImportar: (dados: DadosImportadosXml) => void;
  onFornecedorCriado: (fornecedor: FornecedorOpt) => void;
  onClose: () => void;
  // Quando informado, o modal já abre lendo este arquivo automaticamente
  // (mesmo fluxo de handleFile, sem o usuário escolher no input) — usado
  // pelo fluxo de importação via SIEG, que já tem o XML em mãos antes de
  // abrir este modal.
  arquivoInicial?: File;
}

export default function ImportarXmlCompraModal({ produtos, fornecedores, onImportar, onFornecedorCriado, onClose, arquivoInicial }: Props) {
```

- [ ] **Step 3: Auto-disparar a leitura no mount**

Localizar:

```tsx
  const [criandoFornecedor, setCriandoFornecedor] = useState(false);
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false);

  async function handleFile(file: File) {
```

Substituir por:

```tsx
  const [criandoFornecedor, setCriandoFornecedor] = useState(false);
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false);

  useEffect(() => {
    if (arquivoInicial) handleFile(arquivoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(file: File) {
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add components/ui/ImportarXmlCompraModal.tsx
git commit -m "feat: ImportarXmlCompraModal aceita arquivo inicial pre-carregado"
```

---

### Task 3: `BuscarNotasRecebidasModal`

**Files:**
- Create: `components/ui/BuscarNotasRecebidasModal.tsx`

**Interfaces:**
- Consumes: `buscarNotasSieg`, `NotaSieg` (Task 1);
  `getDocumentoFiscalPorChaveAcesso` (`services/contabilidadeDocumentos.service.ts`,
  já existe); `Modal` (`components/ui/Modal.tsx`, já existe).
- Produces: `Props { onRevisar: (arquivo: File) => void; onClose: () => void }`
  — `onRevisar` é chamado com um `File` sintético construído a partir do
  XML da nota escolhida, pronto pra virar `arquivoInicial` do
  `ImportarXmlCompraModal` (Task 2).

- [ ] **Step 1: Criar o componente**

Criar `components/ui/BuscarNotasRecebidasModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { buscarNotasSieg, type NotaSieg } from "@/services/siegNfe.service";
import { getDocumentoFiscalPorChaveAcesso } from "@/services/contabilidadeDocumentos.service";

interface Props {
  onRevisar: (arquivo: File) => void;
  onClose: () => void;
}

function primeiroDiaMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hoje(): string {
  return new Date().toISOString().split("T")[0];
}

export default function BuscarNotasRecebidasModal({ onRevisar, onClose }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [notas, setNotas] = useState<NotaSieg[]>([]);

  useEffect(() => { buscar(); }, []);

  async function buscar() {
    setCarregando(true);
    setErro("");
    const { notas: encontradas, erro: erroBusca } = await buscarNotasSieg({ inicio: primeiroDiaMes(), fim: hoje() });
    if (erroBusca) {
      setErro(erroBusca);
      setNotas([]);
      setCarregando(false);
      return;
    }

    // Oculta as que já foram importadas (mesma checagem por chave de
    // acesso que o upload manual já usa).
    const pendentes: NotaSieg[] = [];
    for (const nota of encontradas) {
      if (!nota.chaveAcesso) { pendentes.push(nota); continue; }
      const existente = await getDocumentoFiscalPorChaveAcesso(nota.chaveAcesso);
      if (!existente) pendentes.push(nota);
    }
    setNotas(pendentes);
    setCarregando(false);
  }

  function handleRevisar(nota: NotaSieg) {
    const nomeArquivo = (nota.numeroNF ?? nota.chaveAcesso ?? "nota") + ".xml";
    const arquivo = new File([nota.xml], nomeArquivo, { type: "application/xml" });
    onRevisar(arquivo);
  }

  return (
    <Modal open onClose={onClose} title="Buscar Notas Recebidas (SIEG)" width="560px" style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        {carregando && <div style={{ fontSize: "12px", color: "var(--t3)" }}>Buscando notas na SIEG...</div>}
        {erro && <div className="al al-w">{erro}</div>}
        {!carregando && !erro && notas.length === 0 && (
          <div style={{ fontSize: "12px", color: "var(--t3)" }}>Nenhuma nota pendente encontrada neste mês.</div>
        )}
        {notas.map((nota) => (
          <div key={nota.chaveAcesso || nota.numeroNF} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t1)" }}>{nota.emitenteNome ?? "Fornecedor não identificado"}</div>
              <div style={{ fontSize: "10px", color: "var(--t3)" }}>NF {nota.numeroNF ?? "—"} · {nota.dataEmissao ?? "—"}</div>
            </div>
            <button type="button" className="btn bp xs" onClick={() => handleRevisar(nota)}>Revisar e Importar</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
        <button type="button" className="btn bg" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/ui/BuscarNotasRecebidasModal.tsx
git commit -m "feat: modal de lista de notas recebidas pendentes da SIEG"
```

---

### Task 4: Botão e wiring em `app/compras/page.tsx`

**Files:**
- Modify: `app/compras/page.tsx`

**Interfaces:**
- Consumes: `BuscarNotasRecebidasModal` (Task 3); `arquivoInicial` prop
  de `ImportarXmlCompraModal` (Task 2).

- [ ] **Step 1: Importar o modal novo**

Localizar:

```tsx
import ImportarXmlCompraModal, { type DadosImportadosXml } from "@/components/ui/ImportarXmlCompraModal";
```

Substituir por:

```tsx
import ImportarXmlCompraModal, { type DadosImportadosXml } from "@/components/ui/ImportarXmlCompraModal";
import BuscarNotasRecebidasModal from "@/components/ui/BuscarNotasRecebidasModal";
```

- [ ] **Step 2: Estado novo**

Localizar:

```tsx
  const [modalXmlAberto, setModalXmlAberto] = useState(false);
```

Substituir por:

```tsx
  const [modalXmlAberto, setModalXmlAberto] = useState(false);
  const [modalSiegAberto, setModalSiegAberto] = useState(false);
  const [arquivoSiegRevisao, setArquivoSiegRevisao] = useState<File | null>(null);
```

- [ ] **Step 3: Botão na topbar**

Localizar:

```tsx
        <button className="btn bg sm" onClick={() => setModalXmlAberto(true)}>
          Importar XML
        </button>
        <button className="btn bp sm" onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}>
          {showForm ? "✕ Cancelar" : "+ Nova Compra"}
        </button>
      </div>

      {modalXmlAberto && (
        <ImportarXmlCompraModal
          produtos={produtos.map(p => ({ id: p.id, nome: p.nome }))}
          fornecedores={fornecedores}
          onImportar={handleImportarXml}
          onFornecedorCriado={handleFornecedorCriado}
          onClose={() => setModalXmlAberto(false)}
        />
      )}
```

Substituir por:

```tsx
        <button className="btn bg sm" onClick={() => setModalXmlAberto(true)}>
          Importar XML
        </button>
        <button className="btn bg sm" onClick={() => setModalSiegAberto(true)}>
          🔍 Buscar Notas Recebidas
        </button>
        <button className="btn bp sm" onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}>
          {showForm ? "✕ Cancelar" : "+ Nova Compra"}
        </button>
      </div>

      {(modalXmlAberto || arquivoSiegRevisao) && (
        <ImportarXmlCompraModal
          produtos={produtos.map(p => ({ id: p.id, nome: p.nome }))}
          fornecedores={fornecedores}
          onImportar={handleImportarXml}
          onFornecedorCriado={handleFornecedorCriado}
          onClose={() => { setModalXmlAberto(false); setArquivoSiegRevisao(null); }}
          arquivoInicial={arquivoSiegRevisao ?? undefined}
        />
      )}

      {modalSiegAberto && (
        <BuscarNotasRecebidasModal
          onRevisar={(arquivo) => { setModalSiegAberto(false); setArquivoSiegRevisao(arquivo); }}
          onClose={() => setModalSiegAberto(false)}
        />
      )}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar build completo**

Run: `npm run build`
Expected: build completo sem erros (rota de API nova + componentes
novos entram no build do Next normalmente).

- [ ] **Step 6: Commit**

```bash
git add app/compras/page.tsx
git commit -m "feat: botao Buscar Notas Recebidas na tela de Compras"
```

---

### Task 5: Verificação manual (caminho de erro, disponível hoje)

**Files:** nenhum (só validação)

**Interfaces:** N/A

- [ ] **Step 1: Rodar build completo**

Run: `npx tsc --noEmit && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Testar sem `SIEG_API_KEY` configurada (estado atual)**

Subir o dev server, abrir `/compras`, clicar em "🔍 Buscar Notas
Recebidas". Confirmar que aparece o erro **"SIEG_API_KEY não
configurada"** — não uma tela em branco, não um erro genérico de rede,
não um crash. Fechar o modal e confirmar que o resto da tela de Compras
continua funcionando normalmente (Importar XML manual, Nova Compra).

- [ ] **Step 3: Confirmar que o fluxo manual não regrediu**

Testar o fluxo de "Importar XML" manual (upload de um arquivo do disco)
de ponta a ponta, exatamente como antes desta feature — deve continuar
idêntico, já que `arquivoInicial` é opcional e não afeta esse caminho.

- [ ] **Step 4: Pendências que dependem do usuário, fora deste plano**

Registrar como pendência separada (não uma task deste plano): assim
que `SIEG_API_KEY` existir e o usuário confirmar com o suporte da SIEG
o endpoint/autenticação/formato de resposta reais, `chamarSiegApi()` em
`app/api/compras/buscar-notas-sieg/route.ts` precisa ser reescrita com
a chamada real — só essa função, nada mais no sistema muda. Depois
disso, testar de ponta a ponta: buscar notas reais, revisar, importar,
confirmar recebimento.
