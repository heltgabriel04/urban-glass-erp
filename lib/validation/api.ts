import { z } from "zod";

// ── /api/logs (POST) ───────────────────────────────────────
export const logEntrySchema = z.object({
  usuario_id:       z.string().nullable().optional(),
  usuario_email:    z.string().optional(),
  acao:             z.string().min(1),
  tabela:           z.string().min(1),
  registro_id:      z.string().nullable().optional(),
  descricao:        z.string().min(1),
  campos_alterados: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ── /api/notas/emitir (POST) ───────────────────────────────
export const emitirNotaSchema = z.object({
  ref:     z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
