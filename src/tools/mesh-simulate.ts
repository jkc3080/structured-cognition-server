/**
 * mesh_simulate — CausalMesh MCP Tool
 *
 * Simulates downstream impact of a proposed action before execution.
 * Catches cascading failures — API overloads, cost explosions, data corruption.
 *
 * Deterministic risk scoring + heuristic impact mapping.
 */

import { meshStatus, meshSafeToProceed } from "../engine/scoring.js";
import { MESH } from "../engine/thresholds.js";

interface MeshInput {
  recommendation: string;
  action_type: string;
  risk_horizon: "immediate" | "short_term" | "structural";
  context_window?: string[];
}

export function meshSimulate(input: MeshInput) {
  const {
    recommendation,
    action_type,
    risk_horizon,
    context_window = [],
  } = input;

  // ─── Step 1: Map system nodes from context ───
  const nodes = mapSystemNodes(recommendation, action_type, context_window);

  // ─── Step 2: Evaluate risk per dimension ───
  const riskAssessment = assessRisk(
    recommendation,
    action_type,
    risk_horizon,
    nodes,
    context_window
  );

  // ─── Step 3: Calculate risk score ───
  const riskScore = riskAssessment.score;

  // ─── Step 4: Apply thresholds ───
  const status = meshStatus(riskScore, risk_horizon);
  const safeToProceeed = meshSafeToProceed(riskScore, risk_horizon);

  // ─── Step 5: Generate adjusted recommendation if needed ───
  const needsModification = !safeToProceeed;
  const adjustedRecommendation = needsModification
    ? generateAdjustedRecommendation(recommendation, action_type, riskAssessment)
    : recommendation;

  // ─── Step 6: Risk horizon analysis ───
  const horizonAnalysis = analyzeHorizons(
    recommendation,
    action_type,
    risk_horizon,
    riskAssessment
  );

  // ─── Step 7: Build trace ───
  const traceNodeMapping = `Mapped ${nodes.riskNodes.length} system node(s) potentially affected by proposed ${action_type} action. ${nodes.riskNodes.length > 0 ? `Risk nodes identified: ${nodes.riskNodes.join(", ")}.` : "No external system dependencies detected."} Context contained ${context_window.length} item(s) for simulation.`;

  const traceRiskSim = `Risk score: ${riskScore}/100. ${riskAssessment.factors.join(" ")} ${status === "block" ? `Score exceeds block threshold (${MESH.RISK.BLOCK_ABOVE}). Action blocked pending modification.` : status === "flag" ? `Score exceeds flag threshold (${MESH.RISK.FLAG_ABOVE}). Action flagged for review.` : "Score within acceptable range."}`;

  const traceHorizon = `Horizon analysis (${risk_horizon}): Immediate -- ${horizonAnalysis.immediate}. Short-term -- ${horizonAnalysis.short_term}. Structural -- ${horizonAnalysis.structural}.`;

  // ─── Confidence ───
  const confidence =
    Math.round(
      (context_window.length > 0 ? 0.7 : 0.5) *
        (nodes.riskNodes.length > 0 ? 1.0 : 0.8) *
        100
    ) / 100;

  return {
    skill: "causal-mesh",
    version: "1.0",
    status,
    confidence,
    impact_map: {
      direct_effect: nodes.directEffect,
      secondary_effects: nodes.secondaryEffects,
      risk_nodes: nodes.riskNodes,
    },
    risk_score: riskScore,
    risk_horizon_analysis: horizonAnalysis,
    adjusted_recommendation: adjustedRecommendation,
    payload: {
      safe_to_proceed: safeToProceeed,
      requires_modification: needsModification,
      modification_reason: needsModification
        ? `Risk score ${riskScore} exceeds safe threshold. ${riskAssessment.factors[0] ?? "Review recommended."}`
        : "No modification needed",
    },
    trace: [
      { step: "node_mapping", result: traceNodeMapping },
      { step: "risk_simulation", result: traceRiskSim },
      { step: "horizon_analysis", result: traceHorizon },
    ],
  };
}

// ─── System Node Mapping ───

interface NodeMap {
  directEffect: string;
  secondaryEffects: string[];
  riskNodes: string[];
}

function mapSystemNodes(
  recommendation: string,
  actionType: string,
  context: string[]
): NodeMap {
  const lower = recommendation.toLowerCase();
  const contextLower = context.map((c) => c.toLowerCase()).join(" ");
  const allText = lower + " " + contextLower;

  const riskNodes: string[] = [];
  const secondaryEffects: string[] = [];

  // Detect API dependencies
  if (allText.match(/\b(api|endpoint|request|fetch|http|rest|graphql)\b/)) {
    riskNodes.push("external_api");
    secondaryEffects.push("API rate limit consumption");
  }

  // Detect database operations
  if (allText.match(/\b(database|db|sql|write|insert|update|delete|query|table|schema)\b/)) {
    riskNodes.push("database");
    secondaryEffects.push("Data integrity impact on dependent tables/caches");
  }

  // Detect cache systems
  if (allText.match(/\b(cache|redis|memcache|invalidat|cdn)\b/)) {
    riskNodes.push("cache_layer");
    secondaryEffects.push("Cache invalidation may affect downstream read performance");
  }

  // Detect agent dependencies
  if (allText.match(/\b(agent|bot|worker|downstream|pipeline|queue)\b/)) {
    riskNodes.push("agent_dependency");
    secondaryEffects.push("Downstream agents may be blocked or receive inconsistent input");
  }

  // Detect cost exposure
  if (allText.match(/\b(cost|token|credit|billing|payment|budget|spend)\b/)) {
    riskNodes.push("cost_center");
    secondaryEffects.push("Financial exposure from resource consumption");
  }

  // Detect file/storage operations
  if (allText.match(/\b(file|storage|disk|s3|bucket|upload|download)\b/)) {
    riskNodes.push("storage");
    secondaryEffects.push("Storage capacity and concurrent access considerations");
  }

  // Direct effect description
  const directEffect = `${actionType} action: ${recommendation.substring(0, 150)}${recommendation.length > 150 ? "..." : ""}`;

  return { directEffect, secondaryEffects, riskNodes };
}

// ─── Risk Assessment ───

interface RiskAssessment {
  score: number;
  factors: string[];
}

function assessRisk(
  recommendation: string,
  actionType: string,
  riskHorizon: string,
  nodes: NodeMap,
  context: string[]
): RiskAssessment {
  let score = 20; // base risk
  const factors: string[] = [];

  // Node count contributes to risk
  score += nodes.riskNodes.length * 12;
  if (nodes.riskNodes.length > 2) {
    factors.push(
      `${nodes.riskNodes.length} system nodes affected -- multi-system impact increases cascading risk.`
    );
  }

  // Action type risk
  const lower = recommendation.toLowerCase();
  if (lower.match(/\b(delete|drop|destroy|purge|wipe|reset)\b/)) {
    score += 25;
    factors.push("Irreversible action detected -- deletion/reset operations carry high inherent risk.");
  } else if (lower.match(/\b(write|insert|update|modify|overwrite)\b/)) {
    score += 15;
    factors.push("Write operation detected -- data mutation may affect downstream consumers.");
  } else if (lower.match(/\b(send|publish|post|deploy|execute|transfer)\b/)) {
    score += 18;
    factors.push("External-facing action detected -- once executed, rollback may be difficult or impossible.");
  }

  // Horizon penalty
  if (riskHorizon === "structural") {
    score += 15;
    factors.push("Structural time horizon -- long-term system patterns will be affected.");
  } else if (riskHorizon === "immediate") {
    score += 5;
  }

  // Batch/volume indicators
  if (lower.match(/\b(batch|bulk|all|every|mass|loop)\b/)) {
    score += 12;
    factors.push("Batch/bulk operation -- amplifies impact across multiple records or systems.");
  }

  // No context penalty
  if (context.length === 0) {
    score += 10;
    factors.push("No system context provided -- simulation may miss undocumented dependencies.");
  }

  // Clamp
  score = Math.min(100, Math.max(0, score));

  if (factors.length === 0) {
    factors.push("No specific risk indicators detected beyond base risk level.");
  }

  return { score, factors };
}

// ─── Adjusted Recommendation ───

function generateAdjustedRecommendation(
  original: string,
  actionType: string,
  risk: RiskAssessment
): string {
  const suggestions: string[] = [];

  if (risk.factors.some((f) => f.includes("Batch"))) {
    suggestions.push("split into smaller batches with intervals between each");
  }
  if (risk.factors.some((f) => f.includes("Irreversible"))) {
    suggestions.push("add a dry-run or preview step before final execution");
  }
  if (risk.factors.some((f) => f.includes("External-facing"))) {
    suggestions.push("implement a staging/preview step before public execution");
  }
  if (risk.factors.some((f) => f.includes("multi-system"))) {
    suggestions.push("execute sequentially with health checks between each system");
  }

  if (suggestions.length === 0) {
    suggestions.push("reduce scope or add validation checkpoints");
  }

  const preview = original.length > 100
    ? `${original.substring(0, 100)}...`
    : original;
  return `Modified: ${preview} -- Suggested: ${suggestions.join("; ")}`;
}

// ─── Horizon Analysis ───

function analyzeHorizons(
  recommendation: string,
  actionType: string,
  primaryHorizon: string,
  risk: RiskAssessment
): {
  immediate: string;
  short_term: string;
  structural: string;
} {
  const lower = recommendation.toLowerCase();

  return {
    immediate:
      risk.score > MESH.RISK.FLAG_ABOVE
        ? `High immediate risk (score ${risk.score}). Action may cause visible failures in current execution cycle.`
        : `Acceptable immediate risk. Action should complete within current cycle without critical failures.`,
    short_term:
      risk.score > 50
        ? `Elevated short-term risk. Secondary effects (${risk.factors.length} identified) may surface within the next few execution cycles.`
        : `Low short-term risk. No significant secondary effects anticipated in near term.`,
    structural:
      primaryHorizon === "structural" || risk.score > 70
        ? `Structural concern: This action creates patterns that will repeat or compound. ${risk.factors.some((f) => f.includes("multi-system")) ? "Multi-system dependency makes this a systemic pattern risk." : "Monitor for accumulation effects over time."}`
        : `No significant structural risk identified. Action is bounded to its immediate scope.`,
  };
}
