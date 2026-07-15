"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidoById } from "@/services/pedidos.service";
import { getChecklistByPedido, upsertChecklist } from "@/services/checklist.service";
import type {
  Pedido,
  ChecklistDados,
  ChecklistExpedicao,
  ChecklistItemData,
  SecaoChecklist,
} from "@/types";

// ─── Definições estáticas das seções ──────────────────────

const SECAO_DEFS = {
  programacao: {
    titulo: "1  Programação para Expedição",
    responsavel: "Supervisor de produção ou Assistente de Produção",
    itens: [
      { id: "prog_1", label: "Pedido emitido, ou seja, pago?" },
      { id: "prog_2", label: "Romaneio foi emitido?" },
      { id: "prog_3", label: "Disponibilidade do material no sistema e fisicamente na área de armazenagem?" },
      { id: "prog_4", label: "Frete/caminhão próprio ou terceiro disponível?" },
      { id: "prog_5", label: "Endereço e roteiro de entrega validado?" },
    ],
  },
  separacao: {
    titulo: "2  Separação dos Produtos",
    responsavel: "Operacional de Expedição",
    itens: [
      { id: "sep_1", label: "Itens do pedido estão etiquetados?" },
      { id: "sep_2", label: "Nome do Cliente confere com o romaneio?" },
      { id: "sep_3", label: "Tipo de vidro (laminado, float, etc) confere?" },
      { id: "sep_4", label: "Cor ou Acabamento especial confere?" },
      { id: "sep_5", label: "Quantidade confere?" },
      { id: "sep_6", label: "Medidas (Largura, altura, espessura) conferem?" },
      { id: "sep_7", label: "Relatório/Checklist de Qualidade (vidro beneficiado ou de colar) confere?" },
      { id: "sep_8", label: "Observações especiais conferem?" },
      { id: "sep_9", label: "Vidros cortados estão posicionados na área de Pré-expedição?" },
    ],
  },
  carregamento: {
    titulo: "3  Carregamento",
    responsavel: "Supervisor de produção ou Assistente de Produção",
    itens: [
      { id: "car_1", label: 'Realizada a dupla checagem da etapa de "Separação dos Produtos" imediatamente antes do carregamento?' },
      { id: "car_2", label: '"Checklist do veículo" está preenchido?' },
      { id: "car_3", label: "Inspecionada a fixação de cavaletes e suportes?" },
      { id: "car_4", label: "Carga uniformemente distribuída?" },
      { id: "car_5", label: "Verificado se mais de um pedido está sendo levado na mesma viagem e qual será a ordem de descarregamento por cliente?" },
      { id: "car_6", label: "Os volumes estão fixados de modo que não haja movimentação ou folgas?" },
    ],
  },
  entrega: {
    titulo: "4  Descarregamento e Entrega",
    responsavel: "Motorista ou Responsável",
    itens: [
      { id: "ent_1", label: "O endereço e Cliente conferem com o romaneio?" },
      { id: "ent_2", label: "Caminhão posicionado em superfície plana e estável?" },
      { id: "ent_3", label: "Itens que serão descarregados conferem com o pedido do cliente em questão?" },
      { id: "ent_4", label: "Após o descarregamento foi realizada a conferência dos itens descarregados na presença de um representante do cliente?" },
      { id: "ent_5", label: "O cliente ou responsável assinou o documento de recebimento do pedido?" },
    ],
  },
} as const;

type SecaoKey = keyof typeof SECAO_DEFS;

// Status a partir do qual etapas 2-4 ficam disponíveis
const STATUSES_SEPARACAO_OU_ALEM = new Set([
  "Separação",
  "Finalizado",
  "Entregue",
]);

function makeSecao(key: SecaoKey): SecaoChecklist {
  return {
    inicio: "",
    fim: "",
    itens: SECAO_DEFS[key].itens.map((i) => ({ id: i.id, valor: null, obs: "" })),
    obs: "",
    nome: "",
    assinatura: "",
  };
}

function makeDados(): ChecklistDados {
  return {
    transportadora: "",
    programacao: makeSecao("programacao"),
    separacao: makeSecao("separacao"),
    carregamento: makeSecao("carregamento"),
    entrega: makeSecao("entrega"),
  };
}

function mergeSecao(fresh: SecaoChecklist, saved?: Partial<SecaoChecklist>): SecaoChecklist {
  if (!saved) return fresh;
  return {
    inicio: saved.inicio ?? "",
    fim: saved.fim ?? "",
    obs: saved.obs ?? "",
    nome: saved.nome ?? "",
    assinatura: saved.assinatura ?? "",
    itens: fresh.itens.map((fi) => {
      const si = saved.itens?.find((i) => i.id === fi.id);
      return si ? { id: fi.id, valor: si.valor ?? null, obs: si.obs ?? "" } : fi;
    }),
  };
}

function mergeDadosFromDB(saved: ChecklistDados): ChecklistDados {
  const fresh = makeDados();
  return {
    transportadora: saved.transportadora ?? "",
    programacao: mergeSecao(fresh.programacao, saved.programacao),
    separacao: mergeSecao(fresh.separacao, saved.separacao),
    carregamento: mergeSecao(fresh.carregamento, saved.carregamento),
    entrega: mergeSecao(fresh.entrega, saved.entrega),
  };
}

// ─── Componente de assinatura ──────────────────────────────

function SignaturePad({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (b64: string) => void;
  disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const hasDrawn = useRef(false);

  useEffect(() => {
    if (!value || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPos(
    e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>
  ) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function getStrokeColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--t1").trim() || "#dde1f0";
  }

  function startDraw(
    e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>
  ) {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = getStrokeColor();
    ctx.fill();
  }

  function draw(
    e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>
  ) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = getStrokeColor();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    hasDrawn.current = true;
  }

  function endDraw() {
    if (!drawing.current || disabled) return;
    drawing.current = false;
    if (hasDrawn.current) {
      onChange(canvasRef.current!.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <canvas
        ref={canvasRef}
        width={600}
        height={130}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        style={{
          background: "var(--surf3)",
          border: value
            ? "1.5px solid var(--ok)"
            : "1.5px dashed var(--b3)",
          borderRadius: 10,
          width: "100%",
          height: 110,
          cursor: disabled ? "default" : "crosshair",
          touchAction: "none",
          display: "block",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {value ? (
          <span style={{ fontSize: 11, color: "var(--ok)" }}>✓ Assinatura capturada</span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--t3)" }}>
            {disabled ? "" : "Assine aqui com o dedo ou mouse"}
          </span>
        )}
        {value && !disabled && (
          <button className="btn bg xs" onClick={clear} style={{ fontSize: 11, padding: "3px 8px" }}>
            ✕ Limpar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Card de seção bloqueada ───────────────────────────────

function SecaoLocked({ defKey }: { defKey: SecaoKey }) {
  const def = SECAO_DEFS[defKey];
  return (
    <div
      className="card"
      style={{
        borderColor: "var(--b1)",
        opacity: 0.65,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "16px 20px",
      }}
    >
      <div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--t2)" }}>
          {def.titulo}
        </div>
        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>
          {def.responsavel} · {def.itens.length} itens
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(245,158,11,.08)",
          border: "1px solid rgba(245,158,11,.25)",
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 12,
          color: "var(--warn)",
          whiteSpace: "nowrap",
        }}
      >
        🔒 Disponível após o pedido atingir status{" "}
        <strong style={{ marginLeft: 4 }}>Separação</strong>
      </div>
    </div>
  );
}

// ─── Componente de seção ───────────────────────────────────

function SecaoCard({
  defKey,
  data,
  disabled,
  showErrors,
  onChange,
}: {
  defKey: SecaoKey;
  data: SecaoChecklist;
  disabled: boolean;
  showErrors: boolean;
  onChange: (d: SecaoChecklist) => void;
}) {
  const def = SECAO_DEFS[defKey];

  const fc: React.CSSProperties = {
    background: "var(--surf2)",
    border: "1px solid var(--b2)",
    borderRadius: 8,
    padding: "9px 12px",
    color: "var(--t1)",
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "'DM Mono', monospace",
  };

  function setItem(id: string, field: keyof ChecklistItemData, value: string | null) {
    onChange({
      ...data,
      itens: data.itens.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    });
  }

  const isSigned = !!data.assinatura;
  const allAnswered = data.itens.every((i) => i.valor !== null);
  const pendingCount = data.itens.filter((i) => i.valor === null).length;

  return (
    <div
      className="card"
      style={{
        borderColor:
          showErrors && (!allAnswered || !isSigned)
            ? "var(--err)"
            : isSigned
            ? "var(--ok)"
            : allAnswered
            ? "var(--acc2)"
            : "var(--b1)",
        transition: "border-color 0.2s",
      }}
    >
      {/* Cabeçalho da seção */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: 15,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {def.titulo}
          {showErrors && (!allAnswered || !isSigned) && (
            <span
              style={{
                fontSize: 11,
                color: "var(--err)",
                background: "rgba(244,63,94,.1)",
                border: "1px solid rgba(244,63,94,.3)",
                borderRadius: 6,
                padding: "2px 8px",
              }}
            >
              {[
                !allAnswered && `${pendingCount} ${pendingCount > 1 ? "itens" : "item"} sem resposta`,
                !isSigned && "assinatura pendente",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {isSigned && allAnswered && (
            <span
              style={{
                fontSize: 11,
                color: "var(--ok)",
                background: "rgba(16,185,129,.12)",
                border: "1px solid rgba(16,185,129,.3)",
                borderRadius: 6,
                padding: "2px 8px",
              }}
            >
              ✓ Assinado
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" }}>
            Início
            <input name="data_inicio"
              type="time"
              value={data.inicio}
              onChange={(e) => onChange({ ...data, inicio: e.target.value })}
              disabled={disabled}
              style={{ ...fc, width: 115, marginLeft: 8, display: "inline-block" }}
            />
          </label>
          <label style={{ fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" }}>
            Finalização
            <input name="data_fim"
              type="time"
              value={data.fim}
              onChange={(e) => onChange({ ...data, fim: e.target.value })}
              disabled={disabled}
              style={{ ...fc, width: 115, marginLeft: 8, display: "inline-block" }}
            />
          </label>
        </div>
      </div>

      {/* Linha de cabeçalho da tabela */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 72px 72px 200px",
          gap: 8,
          padding: "4px 6px",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--t3)",
          letterSpacing: "0.05em",
          borderBottom: "1px solid var(--b1)",
          marginBottom: 4,
        }}
      >
        <div>ITEM</div>
        <div style={{ textAlign: "center" }}>SIM</div>
        <div style={{ textAlign: "center" }}>NÃO</div>
        <div>OBSERVAÇÃO</div>
      </div>

      {/* Itens */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {data.itens.map((item) => {
          const defItem = def.itens.find((d) => d.id === item.id);
          if (!defItem) return null;
          const isSim = item.valor === "sim";
          const isNao = item.valor === "nao";
          return (
            <div
              key={item.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 72px 72px 200px",
                gap: 8,
                alignItems: "center",
                padding: "10px 6px",
                borderBottom: "1px solid var(--b1)",
                background: isNao
                  ? "rgba(244,63,94,.04)"
                  : isSim
                  ? "rgba(16,185,129,.03)"
                  : showErrors && item.valor === null
                  ? "rgba(244,63,94,.07)"
                  : "transparent",
                transition: "background 0.15s",
                outline: showErrors && item.valor === null ? "1px solid rgba(244,63,94,.25)" : "none",
                borderRadius: showErrors && item.valor === null ? 6 : 0,
              }}
            >
              <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--t1)" }}>
                {defItem.label}
                {showErrors && item.valor === null && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: "var(--err)", fontWeight: 700 }}>
                    ⚠ pendente
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  disabled={disabled}
                  onClick={() => setItem(item.id, "valor", isSim ? null : "sim")}
                  style={{
                    width: 56, height: 46, borderRadius: 9,
                    border: isSim ? "2px solid var(--ok)" : "1px solid var(--b2)",
                    background: isSim ? "rgba(16,185,129,.2)" : "var(--surf2)",
                    color: isSim ? "var(--ok)" : "var(--t3)",
                    fontWeight: 700, fontSize: 12,
                    cursor: disabled ? "default" : "pointer",
                    fontFamily: "'DM Mono', monospace",
                    transition: "all 0.12s",
                  }}
                >
                  SIM
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  disabled={disabled}
                  onClick={() => setItem(item.id, "valor", isNao ? null : "nao")}
                  style={{
                    width: 56, height: 46, borderRadius: 9,
                    border: isNao ? "2px solid var(--err)" : "1px solid var(--b2)",
                    background: isNao ? "rgba(244,63,94,.15)" : "var(--surf2)",
                    color: isNao ? "var(--err)" : "var(--t3)",
                    fontWeight: 700, fontSize: 12,
                    cursor: disabled ? "default" : "pointer",
                    fontFamily: "'DM Mono', monospace",
                    transition: "all 0.12s",
                  }}
                >
                  NÃO
                </button>
              </div>
              <input name={`item_obs_${item.id}`}
                value={item.obs}
                onChange={(e) => setItem(item.id, "obs", e.target.value)}
                placeholder="Observação..."
                disabled={disabled}
                style={{ ...fc, padding: "11px 12px", height: 46 }}
              />
            </div>
          );
        })}
      </div>

      {/* Observações + Responsável + Assinatura */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>OBSERVAÇÕES GERAIS</div>
          <textarea name="data_obs"
            value={data.obs}
            onChange={(e) => onChange({ ...data, obs: e.target.value })}
            disabled={disabled}
            rows={2}
            placeholder="Observações..."
            style={{ ...fc, resize: "vertical", minHeight: 56 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>
              RESPONSÁVEL — {def.responsavel}
            </div>
            <input name="data_nome"
              value={data.nome}
              onChange={(e) => onChange({ ...data, nome: e.target.value })}
              placeholder="Nome do responsável"
              disabled={disabled}
              style={{ ...fc }}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: showErrors && !isSigned ? "var(--err)" : "var(--t3)",
                marginBottom: 6,
                fontWeight: showErrors && !isSigned ? 700 : 400,
              }}
            >
              ASSINATURA{showErrors && !isSigned ? " ⚠ obrigatória" : ""}
            </div>
            <SignaturePad
              value={data.assinatura}
              onChange={(sig) => onChange({ ...data, assinatura: sig })}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────

export default function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [checklist, setChecklist] = useState<ChecklistExpedicao | null>(null);
  const [dados, setDados] = useState<ChecklistDados>(makeDados);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [concluding, setConcluding] = useState(false);
  const [salvando1, setSalvando1] = useState(false);
  const [tentouConcluir, setTentouConcluir] = useState(false);
  const [tentouSalvar1, setTentouSalvar1] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitRef = useRef(false);
  const concluido = checklist?.status === "concluido";

  // Etapas 2-4 só ficam disponíveis após "Separação"
  const etapas234Liberadas = pedido
    ? STATUSES_SEPARACAO_OU_ALEM.has(pedido.status)
    : false;

  const fc: React.CSSProperties = {
    background: "var(--surf2)",
    border: "1px solid var(--b2)",
    borderRadius: 8,
    padding: "9px 12px",
    color: "var(--t1)",
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "'DM Mono', monospace",
  };

  useEffect(() => {
    async function load() {
      const [p, c] = await Promise.all([
        getPedidoById(id),
        getChecklistByPedido(id),
      ]);
      setPedido(p);
      if (c) {
        setChecklist(c);
        setDados(mergeDadosFromDB(c.dados));
      }
      setLoading(false);
      setTimeout(() => { didInitRef.current = true; }, 50);
    }
    load();
  }, [id]);

  // Auto-save ao alterar dados (somente campos de etapas disponíveis)
  useEffect(() => {
    if (!didInitRef.current || concluido) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      const result = await upsertChecklist(id, dados, "em_andamento");
      if (result) {
        setChecklist(result);
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  function secaoValida(s: SecaoChecklist) {
    return s.itens.every((i) => i.valor !== null) && !!s.assinatura;
  }

  const etapa1Valida = secaoValida(dados.programacao);

  const podeConcluir =
    etapa1Valida &&
    secaoValida(dados.separacao) &&
    secaoValida(dados.carregamento) &&
    secaoValida(dados.entrega);

  const SECAO_LABELS: Record<string, string> = {
    programacao: "1 Programação para Expedição",
    separacao: "2 Separação dos Produtos",
    carregamento: "3 Carregamento",
    entrega: "4 Descarregamento e Entrega",
  };

  // Pendências só das etapas disponíveis
  const secoesPendentes = etapas234Liberadas
    ? (["programacao", "separacao", "carregamento", "entrega"] as SecaoKey[])
    : (["programacao"] as SecaoKey[]);

  const pendencias = secoesPendentes.flatMap((key) => {
    const s = dados[key];
    const faltando = s.itens.filter((i) => i.valor === null).length;
    const issues: string[] = [];
    if (faltando > 0) issues.push(`${faltando} ${faltando > 1 ? "itens" : "item"} sem resposta`);
    if (!s.assinatura) issues.push("assinatura pendente");
    if (issues.length === 0) return [];
    return [{ label: SECAO_LABELS[key], issues }];
  });

  async function handleSalvarEtapa1() {
    if (!etapa1Valida) {
      setTentouSalvar1(true);
      return;
    }
    setSalvando1(true);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const result = await upsertChecklist(id, dados, "em_andamento");
    if (result) {
      setChecklist(result);
      setSaveStatus("saved");
    } else {
      setSaveStatus("error");
    }
    setSalvando1(false);
  }

  async function handleConcluir() {
    if (!podeConcluir) {
      setTentouConcluir(true);
      return;
    }
    setConcluding(true);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const result = await upsertChecklist(id, dados, "concluido");
    if (result) {
      setChecklist(result);
      setSaveStatus("saved");
    }
    setConcluding(false);
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="con">
          <div className="loading">Carregando checklist...</div>
        </div>
      </AppLayout>
    );
  }

  if (!pedido) {
    return (
      <AppLayout>
        <div className="con" style={{ color: "var(--err)", padding: 32 }}>
          Pedido não encontrado.
        </div>
      </AppLayout>
    );
  }

  const showErrors1 = tentouSalvar1 || tentouConcluir;
  const showErrorsRest = tentouConcluir;

  return (
    <AppLayout>
      {/* Top bar */}
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.back()}>
          ← Voltar
        </button>
        <div className="tb-title" style={{ flex: 1 }}>
          Checklist de Expedição{" "}
          <span style={{ color: "var(--acc)" }}>{pedido.id}</span>
        </div>

        {/* Badge de status do pedido */}
        <div style={{
          fontSize: 11,
          color: "var(--t3)",
          background: "var(--surf2)",
          border: "1px solid var(--b1)",
          borderRadius: 6,
          padding: "4px 10px",
          fontFamily: "'DM Mono', monospace",
        }}>
          {pedido.status}
        </div>

        {concluido ? (
          <span
            style={{
              fontSize: 12,
              color: "var(--ok)",
              background: "rgba(16,185,129,.12)",
              border: "1px solid rgba(16,185,129,.3)",
              borderRadius: 8,
              padding: "4px 12px",
              fontWeight: 700,
            }}
          >
            ✓ Checklist Concluído
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              color:
                saveStatus === "error"
                  ? "var(--err)"
                  : saveStatus === "saved"
                  ? "var(--ok)"
                  : "var(--t3)",
              minWidth: 80,
              textAlign: "right",
            }}
          >
            {saveStatus === "saving"
              ? "Salvando..."
              : saveStatus === "saved"
              ? "✓ Salvo"
              : saveStatus === "error"
              ? "Erro ao salvar"
              : ""}
          </span>
        )}

        {!concluido && !etapas234Liberadas && (
          <button
            className="btn bs sm"
            disabled={salvando1}
            onClick={handleSalvarEtapa1}
          >
            {salvando1 ? "Salvando..." : "💾 Salvar Etapa 1"}
          </button>
        )}

        {!concluido && etapas234Liberadas && (
          <button
            className="btn bp sm"
            disabled={concluding}
            onClick={handleConcluir}
          >
            {concluding ? "Salvando..." : "✓ Concluir"}
          </button>
        )}
      </div>

      <div className="con" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Aviso de etapas bloqueadas */}
        {!etapas234Liberadas && !concluido && (
          <div
            style={{
              background: "rgba(0,200,255,.06)",
              border: "1px solid rgba(0,200,255,.2)",
              borderRadius: 10,
              padding: "12px 18px",
              fontSize: 13,
              color: "var(--acc2)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16 }}>ℹ</span>
            <div>
              <strong>Etapa 1</strong> está disponível agora. As etapas{" "}
              <strong>2, 3 e 4</strong> serão liberadas quando o pedido atingir o
              status <strong>Separação</strong>.
              {etapa1Valida && (
                <span style={{ marginLeft: 8, color: "var(--ok)", fontWeight: 600 }}>
                  ✓ Etapa 1 preenchida
                </span>
              )}
            </div>
          </div>
        )}

        {/* Cabeçalho com dados do pedido */}
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>
                CLIENTE
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {pedido.clientes?.nome ?? "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>
                N. PEDIDO
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--acc)" }}>
                {pedido.id}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>
                QTDE DE ITENS
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {pedido.itens_pedido?.reduce((s, i) => s + i.quantidade, 0) ?? 0} peças
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" }}>
                TRANSPORTADORA / VEÍCULO PRÓPRIO
              </div>
              <input name="transportadora"
                value={dados.transportadora}
                onChange={(e) =>
                  setDados((prev) => ({ ...prev, transportadora: e.target.value }))
                }
                placeholder="Ex: Veículo próprio, Transportadora XYZ..."
                disabled={concluido}
                style={fc}
              />
            </div>
          </div>
        </div>

        {/* Etapa 1 — sempre disponível */}
        <SecaoCard
          defKey="programacao"
          data={dados.programacao}
          disabled={concluido}
          showErrors={showErrors1}
          onChange={(d) => setDados((prev) => ({ ...prev, programacao: d }))}
        />

        {/* Etapas 2-4 — bloqueadas ou disponíveis */}
        {etapas234Liberadas ? (
          <>
            <SecaoCard
              defKey="separacao"
              data={dados.separacao}
              disabled={concluido}
              showErrors={showErrorsRest}
              onChange={(d) => setDados((prev) => ({ ...prev, separacao: d }))}
            />
            <SecaoCard
              defKey="carregamento"
              data={dados.carregamento}
              disabled={concluido}
              showErrors={showErrorsRest}
              onChange={(d) => setDados((prev) => ({ ...prev, carregamento: d }))}
            />
            <SecaoCard
              defKey="entrega"
              data={dados.entrega}
              disabled={concluido}
              showErrors={showErrorsRest}
              onChange={(d) => setDados((prev) => ({ ...prev, entrega: d }))}
            />
          </>
        ) : (
          <>
            <SecaoLocked defKey="separacao" />
            <SecaoLocked defKey="carregamento" />
            <SecaoLocked defKey="entrega" />
          </>
        )}

        {/* Banner de pendências */}
        {(tentouConcluir || tentouSalvar1) && pendencias.length > 0 && (
          <div
            style={{
              background: "rgba(244,63,94,.08)",
              border: "1px solid rgba(244,63,94,.3)",
              borderRadius: 12,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "var(--err)",
                marginBottom: 10,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ⚠ Pendências — preencha os itens abaixo antes de
              {etapas234Liberadas ? " concluir" : " salvar a Etapa 1"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pendencias.map((p) => (
                <div key={p.label} style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "baseline" }}>
                  <span style={{ color: "var(--t1)", fontWeight: 600, minWidth: 240 }}>{p.label}</span>
                  <span style={{ color: "var(--err)" }}>{p.issues.join(" · ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botão de conclusão no final (só quando etapas 2-4 liberadas) */}
        {!concluido && etapas234Liberadas && (
          <div style={{ display: "flex", justifyContent: "center", paddingBottom: 48 }}>
            <button
              className="btn bp"
              disabled={concluding}
              onClick={handleConcluir}
              style={{ padding: "14px 48px", fontSize: 15 }}
            >
              {concluding ? "Salvando..." : "✓ Concluir e Salvar Checklist"}
            </button>
          </div>
        )}

        {/* Botão salvar etapa 1 no final (quando etapas 2-4 ainda bloqueadas) */}
        {!concluido && !etapas234Liberadas && (
          <div style={{ display: "flex", justifyContent: "center", paddingBottom: 48 }}>
            <button
              className="btn bs"
              disabled={salvando1}
              onClick={handleSalvarEtapa1}
              style={{ padding: "14px 48px", fontSize: 15 }}
            >
              {salvando1 ? "Salvando..." : "💾 Salvar Etapa 1"}
            </button>
          </div>
        )}

        {concluido && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 20px",
              color: "var(--ok)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            ✓ Checklist concluído e salvo em{" "}
            {checklist?.updated_at
              ? new Date(checklist.updated_at).toLocaleString("pt-BR")
              : "—"}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
