/**
 * Shared Zod schemas used across multiple tools.
 */

import { z } from "zod";

// ─── Common sub-schemas ───

export const TraceStepSchema = z.object({
  step: z.string().describe("Name of the trace step"),
  result: z.string().describe("Natural language result of this step"),
});

export const ContextWindowSchema = z
  .array(z.string())
  .describe("Relevant background context for the analysis");

// ─── CognitiveBullwhip ───

export const DecisionLogEntrySchema = z.object({
  timestamp: z.string().describe("ISO8601 timestamp"),
  input_summary: z.string().describe("What the agent received"),
  decision_made: z.string().describe("What the agent did"),
  outcome: z
    .enum(["expected", "unexpected", "error"])
    .describe("Decision outcome"),
  variance_score: z
    .number()
    .min(0)
    .describe("Output variance score (0.0+)"),
});

export const SystemContextSchema = z.object({
  agent_count: z.number().int().min(1).default(1),
  connected_systems: z.array(z.string()).default([]),
  observation_window: z
    .string()
    .default("last_24h")
    .describe("e.g. last_24h, last_7d"),
});

export const BullwhipInputSchema = z.object({
  decision_log: z
    .array(DecisionLogEntrySchema)
    .min(1)
    .describe("Recent agent decisions to analyze (minimum 5 recommended)"),
  system_context: SystemContextSchema.optional(),
});

// ─── SignalAnchor ───

export const AnchorInputSchema = z.object({
  raw_input: z
    .string()
    .describe("Original prompt, event, or data payload"),
  input_type: z
    .enum(["prompt", "event", "data"])
    .describe("Type of input"),
  context_window: ContextWindowSchema.optional(),
});

// ─── LogicStack ───

export const LogicInputSchema = z.object({
  isolated_signal: z
    .string()
    .describe("Cleaned input to reason about (from SignalAnchor or direct)"),
  input_type: z
    .enum(["prompt", "event", "data"])
    .describe("Type of input"),
  context_window: ContextWindowSchema.optional(),
});

// ─── CausalMesh ───

export const MeshInputSchema = z.object({
  recommendation: z
    .string()
    .describe("Proposed action to simulate"),
  action_type: z.string().describe("Type of action"),
  risk_horizon: z
    .enum(["immediate", "short_term", "structural"])
    .describe("Time horizon for risk assessment"),
  context_window: ContextWindowSchema.optional(),
});

// ─── PrincipleGate ───

export const PrincipleConfigSchema = z.object({
  id: z.string(),
  rule: z.string().describe("Governance rule in plain language"),
  threshold: z
    .string()
    .describe("Measurable condition that triggers violation"),
  on_violation: z.enum(["block", "escalate", "warn"]),
});

export const GateInputSchema = z.object({
  recommendation: z.string().describe("Final proposed action"),
  risk_score: z
    .number()
    .min(0)
    .max(100)
    .describe("Risk score from CausalMesh or direct assessment"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Agent confidence in the recommendation"),
  action_type: z.string().describe("Type of action"),
  context_window: ContextWindowSchema.optional(),
  principles: z
    .array(PrincipleConfigSchema)
    .optional()
    .describe("Custom governance rules (optional, uses defaults if not provided)"),
  confidence_floor: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Custom confidence floor (default: 0.70)"),
});

// ─── Full Pipeline ───

export const PipelineInputSchema = z.object({
  raw_input: z
    .string()
    .describe("Original input to process through full pipeline"),
  input_type: z
    .enum(["prompt", "event", "data"])
    .describe("Type of input"),
  context_window: ContextWindowSchema.optional(),
  principles: z
    .array(PrincipleConfigSchema)
    .optional()
    .describe("Governance rules for PrincipleGate stage"),
  confidence_floor: z.number().min(0).max(1).optional(),
});
