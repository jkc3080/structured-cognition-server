/**
 * Deterministic scoring functions for all 5 skills.
 * Pure functions — no LLM, no side effects.
 */

import { BULLWHIP, MESH, GATE, ANCHOR } from "./thresholds.js";

// ─── Bullwhip Scoring ───

export interface LayerVariance {
  layer: string;
  inputVariance: number;
  outputVariance: number;
}

export interface BullwhipLayerResult {
  layer: string;
  input_variance: number;
  output_variance: number;
  amplification_ratio: number;
}

export function computeAmplificationRatio(
  inputVar: number,
  outputVar: number
): number {
  if (inputVar <= 0) return 0;
  return Math.round((outputVar / inputVar) * 100) / 100;
}

export function isBullwhipActive(maxRatio: number): boolean {
  return maxRatio > BULLWHIP.RATIO_CONFIRM;
}

export function bullwhipSeverityScore(maxRatio: number): number {
  return Math.min(100, Math.round(maxRatio * 10));
}

export function bullwhipSeverity(
  score: number
): "none" | "low" | "moderate" | "high" | "critical" {
  if (score > BULLWHIP.SEVERITY.HIGH_MAX) return "critical";
  if (score > BULLWHIP.SEVERITY.MODERATE_MAX) return "high";
  if (score > BULLWHIP.SEVERITY.LOW_MAX) return "moderate";
  if (score > BULLWHIP.SEVERITY.NONE_MAX) return "low";
  return "none";
}

export function bullwhipUrgency(
  score: number
): "immediate" | "scheduled" | "monitor" {
  if (score > BULLWHIP.URGENCY.IMMEDIATE_ABOVE) return "immediate";
  if (score > BULLWHIP.URGENCY.SCHEDULED_ABOVE) return "scheduled";
  return "monitor";
}

export function classifyBullwhipPattern(
  originLayer: string
): string {
  const map: Record<string, string> = {
    input: "noise_sensitivity",
    reasoning: "reasoning_drift",
    execution: "myopic_optimization",
    output: "misaligned_autonomy",
  };
  return map[originLayer] ?? "compound";
}

// ─── SignalAnchor Scoring ───

export function anchorStatus(
  signalType: string,
  confidence: number
): "pass" | "flag" | "block" {
  if (confidence < ANCHOR.CONFIDENCE_AUTO_FLAG) return "flag";
  if (signalType === "ambiguous") return "flag";
  if (signalType === "observation") return "pass"; // observe = log, no action
  return "pass";
}

export function anchorShouldProceed(
  signalType: string,
  confidence: number
): boolean {
  if (confidence < ANCHOR.CONFIDENCE_AUTO_FLAG) return false;
  if (signalType === "ambiguous") return false;
  if (signalType === "observation") return false;
  return signalType === "action";
}

// ─── CausalMesh Scoring ───

export function meshStatus(
  riskScore: number,
  riskHorizon: string
): "pass" | "flag" | "block" {
  if (riskScore > MESH.RISK.BLOCK_ABOVE) return "block";
  if (riskScore > MESH.RISK.FLAG_ABOVE) return "flag";
  if (
    riskHorizon === "structural" &&
    riskScore > MESH.STRUCTURAL_ESCALATE_ABOVE
  )
    return "flag";
  return "pass";
}

export function meshSafeToProceed(
  riskScore: number,
  riskHorizon: string
): boolean {
  return meshStatus(riskScore, riskHorizon) === "pass";
}

// ─── PrincipleGate Scoring ───

export interface PrincipleViolation {
  principle_id: string;
  rule: string;
  triggered_by: string;
  on_violation: "block" | "escalate" | "warn";
}

export function gateDecision(
  confidence: number,
  confidenceFloor: number,
  riskScore: number,
  violations: PrincipleViolation[]
): "execute" | "escalate" | "block" {
  // Hard block: risk > 90
  if (riskScore > GATE.RISK_AUTO_BLOCK) return "block";

  // Auto-escalate: confidence < floor
  if (confidence < confidenceFloor) return "escalate";

  // Check violations
  const hasBlock = violations.some((v) => v.on_violation === "block");
  if (hasBlock) return "block";

  const hasEscalate = violations.some((v) => v.on_violation === "escalate");
  if (hasEscalate) return "escalate";

  // No violations or only warn-level
  if (violations.length === 0) return "execute";
  return "execute"; // warn-only violations don't block
}

export function gateStatus(
  decision: "execute" | "escalate" | "block"
): "approved" | "escalated" | "blocked" {
  const map: Record<string, "approved" | "escalated" | "blocked"> = {
    execute: "approved",
    escalate: "escalated",
    block: "blocked",
  };
  return map[decision];
}
