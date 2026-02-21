/**
 * sc_pipeline — Full Structured Cognition Pipeline MCP Tool
 *
 * Runs the complete chain: SignalAnchor -> LogicStack -> CausalMesh -> PrincipleGate
 * Returns combined result with per-stage outputs.
 *
 * Each stage gates the next: if a stage flags/blocks, the pipeline stops
 * and returns the result with the blocking stage identified.
 */

import { anchorClassify } from "./anchor-classify.js";
import { logicSequence } from "./logic-sequence.js";
import { meshSimulate } from "./mesh-simulate.js";
import { gateValidate } from "./gate-validate.js";

interface PrincipleConfig {
  id: string;
  rule: string;
  threshold: string;
  on_violation: "block" | "escalate" | "warn";
}

interface PipelineInput {
  raw_input: string;
  input_type: "prompt" | "event" | "data";
  context_window?: string[];
  principles?: PrincipleConfig[];
  confidence_floor?: number;
}

export function scPipeline(input: PipelineInput) {
  const {
    raw_input,
    input_type,
    context_window = [],
    principles = [],
    confidence_floor,
  } = input;

  const stages: Record<string, unknown> = {};
  let finalStatus: "pass" | "flag" | "block" = "pass";
  let stoppedAt: string | null = null;

  // ─── Stage 1: SignalAnchor ───
  const anchorResult = anchorClassify({
    raw_input,
    input_type,
    context_window,
  });
  stages.signal_anchor = anchorResult;

  if (anchorResult.status === "block") {
    finalStatus = "block";
    stoppedAt = "signal_anchor";
    return buildPipelineResult(stages, finalStatus, stoppedAt, anchorResult.confidence);
  }
  if (anchorResult.status === "flag" && !anchorResult.payload.proceed) {
    finalStatus = "flag";
    stoppedAt = "signal_anchor";
    return buildPipelineResult(stages, finalStatus, stoppedAt, anchorResult.confidence);
  }

  // ─── Stage 2: LogicStack ───
  const logicResult = logicSequence({
    isolated_signal: anchorResult.isolated_signal,
    input_type,
    context_window,
  });
  stages.logic_stack = logicResult;

  if (logicResult.status === "block") {
    finalStatus = "block";
    stoppedAt = "logic_stack";
    return buildPipelineResult(stages, finalStatus, stoppedAt, logicResult.confidence);
  }
  if (logicResult.status === "flag") {
    // Flag doesn't stop pipeline, but we note it
    finalStatus = "flag";
  }

  // ─── Stage 3: CausalMesh ───
  const meshResult = meshSimulate({
    recommendation: logicResult.recommendation,
    action_type: logicResult.payload.action_type,
    risk_horizon: logicResult.risk_horizon,
    context_window,
  });
  stages.causal_mesh = meshResult;

  if (meshResult.status === "block") {
    finalStatus = "block";
    stoppedAt = "causal_mesh";
    return buildPipelineResult(stages, finalStatus, stoppedAt, meshResult.confidence);
  }
  if (meshResult.status === "flag") {
    finalStatus = "flag";
  }

  // ─── Stage 4: PrincipleGate ───
  // Gate checks both the recommendation AND the original input.
  // Principles often reference keywords from the user's original request,
  // but LogicStack's recommendation is a cleaned/generic form that may
  // lose those keywords. Concatenating ensures principle checks apply
  // to the full decision context.
  const gateRecommendation = meshResult.payload.requires_modification
    ? meshResult.adjusted_recommendation
    : logicResult.recommendation;
  const fullGateContext = `${gateRecommendation} [Original request: ${raw_input}]`;
  const gateResult = gateValidate({
    recommendation: fullGateContext,
    risk_score: meshResult.risk_score,
    confidence: logicResult.confidence,
    action_type: logicResult.payload.action_type,
    context_window,
    principles,
    confidence_floor,
  });
  stages.principle_gate = gateResult;

  if (gateResult.status === "blocked") {
    finalStatus = "block";
    stoppedAt = "principle_gate";
  } else if (gateResult.status === "escalated") {
    finalStatus = "flag";
    stoppedAt = "principle_gate";
  }

  const overallConfidence =
    Math.round(
      ((anchorResult.confidence +
        logicResult.confidence +
        meshResult.confidence +
        gateResult.confidence) /
        4) *
        100
    ) / 100;

  return buildPipelineResult(stages, finalStatus, stoppedAt, overallConfidence);
}

function buildPipelineResult(
  stages: Record<string, unknown>,
  finalStatus: "pass" | "flag" | "block",
  stoppedAt: string | null,
  confidence: number
) {
  const completedStages = Object.keys(stages);
  const allStages = [
    "signal_anchor",
    "logic_stack",
    "causal_mesh",
    "principle_gate",
  ];
  const skippedStages = allStages.filter(
    (s) => !completedStages.includes(s)
  );

  // Build summary trace
  const summaryParts: string[] = [];
  for (const stageName of completedStages) {
    const stage = stages[stageName] as Record<string, unknown>;
    const stageStatus = stage.status ?? stage.final_decision ?? "unknown";
    summaryParts.push(`${stageName}: ${stageStatus}`);
  }
  for (const skipped of skippedStages) {
    summaryParts.push(`${skipped}: skipped (pipeline stopped at ${stoppedAt})`);
  }

  return {
    skill: "sc-pipeline",
    version: "1.0",
    pipeline_status: finalStatus,
    stopped_at: stoppedAt,
    confidence,
    stages_completed: completedStages,
    stages_skipped: skippedStages,
    stages,
    summary: summaryParts.join(" | "),
    trace: [
      {
        step: "pipeline_execution",
        result: `Executed ${completedStages.length}/4 stages. ${stoppedAt ? `Pipeline ${finalStatus === "block" ? "blocked" : "flagged"} at ${stoppedAt}.` : "All stages completed."} Overall confidence: ${confidence}.`,
      },
    ],
  };
}
