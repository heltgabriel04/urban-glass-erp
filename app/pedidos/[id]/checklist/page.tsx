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
    ctx.fillStyle = "#dde1f0";
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
    ctx.strokeStyle = "#dde1f0";
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {value ? (
          <span style={{ fontSize: 11, color: "var(--ok)" }}>✓ Assinatura capturada</span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--t3)" }}>
            {disabled ? "" : "Assine aqui com o dedo ou mouse"}
          </span>
        )}
        {value && !disabled && (
          <button
            className="btn bg xs"
            onClick={clear}
            style={{ fontSize: 11, padding: "3px 8px" }}
          >
            ✕ Limpar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Componente de seção ───────────────────────────────────

function SecaoCard({
  defKey,
  data,
  disabled,
  onChange,
}: {
  defKey: SecaoKey;
  data: SecaoChecklist;
  disabled: boolean;
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

  return (
    <div
      className="card"
      style={{
        borderColor: isSigned ? "var(--ok)" : allAnswered ? "var(--acc2)" : "var(--b1)",
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
          {isSigned && (
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
            <input
              type="time"
              value={data.inicio}
              onChange={(e) => onChange({ ...data, inicio: e.target.value })}
              disabled={disabled}
              style={{ ...fc, width: 115, marginLeft: 8, display: "inline-block" }}
            />
          </label>
          <label style={{ fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" }}>
            Finalização
            <input
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
                  : "transparent",
                transition: "background 0.15s",
              }}
            >
              <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--t1)" }}>
                {defItem.label}
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  disabled={disabled}
                  onClick={() => setItem(item.id, "valor", isSim ? null : "sim")}
                  style={{
                    width: 56,
                    height: 46,
                    borderRadius: 9,
                    border: isSim ? "2px solid var(--ok)" : "1px solid var(--b2)",
                    background: isSim ? "rgba(16,185,129,.2)" : "var(--surf2)",
                    color: isSim ? "var(--ok)" : "var(--t3)",
                    fontWeight: 700,
                    fontSize: 12,
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
                    width: 56,
                    height: 46,
                    borderRadius: 9,
                    border: isNao ? "2px solid var(--err)" : "1px solid var(--b2)",
                    background: isNao ? "rgba(244,63,94,.15)" : "var(--surf2)",
                    color: isNao ? "var(--err)" : "var(--t3)",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: disabled ? "default" : "pointer",
                    fontFamily: "'DM Mono', monospace",
                    transition: "all 0.12s",
                  }}
                >
                  NÃO
                </button>
              </div>
              <input
                value={item.obs}
                onChange={(e) => setItem(item.id, "obs", e.target.value)}
                placeholder="Obs..."
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
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>
            OBSERVAÇÕES GERAIS
          </div>
          <textarea
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
            <input
              value={data.nome}
              onChange={(e) => onChange({ ...data, nome: e.target.value })}
              placeholder="Nome do responsável"
              disabled={disabled}
              style={{ ...fc }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>
              ASSINATURA
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

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitRef = useRef(false);
  const concluido = checklist?.status === "concluido";

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

  // Auto-save ao alterar dados
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

  async function handleConcluir() {
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

  const podeConcluir =
    !!dados.programacao.assinatura &&
    !!dados.separacao.assinatura &&
    !!dados.carregamento.assinatura &&
    !!dados.entrega.assinatura;

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
        {!concluido && (
          <button
            className="btn bp sm"
            disabled={!podeConcluir || concluding}
            onClick={handleConcluir}
            title={!podeConcluir ? "Assine todas as 4 seções para concluir" : ""}
          >
            {concluding ? "Salvando..." : "✓ Concluir"}
          </button>
        )}
      </div>

      <div className="con" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Cabeçalho com dados do pedido */}
        <div className="card">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 20,
            }}
          >
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
              <input
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

        {/* Seções */}
        <SecaoCard
          defKey="programacao"
          data={dados.programacao}
          disabled={concluido}
          onChange={(d) => setDados((prev) => ({ ...prev, programacao: d }))}
        />
        <SecaoCard
          defKey="separacao"
          data={dados.separacao}
          disabled={concluido}
          onChange={(d) => setDados((prev) => ({ ...prev, separacao: d }))}
        />
        <SecaoCard
          defKey="carregamento"
          data={dados.carregamento}
          disabled={concluido}
          onChange={(d) => setDados((prev) => ({ ...prev, carregamento: d }))}
        />
        <SecaoCard
          defKey="entrega"
          data={dados.entrega}
          disabled={concluido}
          onChange={(d) => setDados((prev) => ({ ...prev, entrega: d }))}
        />

        {/* Botão de conclusão no final */}
        {!concluido && (
          <div style={{ display: "flex", justifyContent: "center", paddingBottom: 48 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              {!podeConcluir && (
                <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center" }}>
                  Assine todas as 4 seções para habilitar a conclusão
                </div>
              )}
              <button
                className="btn bp"
                disabled={!podeConcluir || concluding}
                onClick={handleConcluir}
                style={{ padding: "14px 48px", fontSize: 15, opacity: podeConcluir ? 1 : 0.4 }}
              >
                {concluding ? "Salvando..." : "✓ Concluir e Salvar Checklist"}
              </button>
            </div>
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
