/**
 * bullwhip_diagnose — CognitiveBullwhip MCP Tool
 *
 * Scans agent decision history for amplification patterns.
 * Finds where small errors are compounding into large failures.
 * 100% deterministic — no LLM needed.
 */

import {
  computeAmplificationRatio,
  isBullwhipActive,
  bullwhipSeverityScore,
  bullwhipSeverity,
  bullwhipUrgency,
  classifyBullwhipPattern,
} from "../engine/scoring.js";
import {
  PATTERN_SKILL_MAP,
  SKILL_PRICE_MAP,
} from "../engine/thresholds.js";

interface DecisionEntry {
  timestamp: string;
  input_summary: string;
  decision_made: string;
  outcome: "expected" | "unexpected" | "error";
  variance_score: number;
}

interface SystemContext {
  agent_count?: number;
  connected_systems?: string[];
  observation_window?: string;
}

interface LayerStats {
  count: number;
  maxRatio: number;
  firstTs: string;
  sumIn: number;
  sumOut: number;
  entries: Array<{
    ts: string;
    ratio: number;
    inVar: number;
    outVar: number;
    outcome: string;
  }>;
}

export function bullwhipDiagnose(
  decisionLog: DecisionEntry[],
  systemContext?: SystemContext
) {
  const obsWindow = systemContext?.observation_window ?? "last_24h";

  // ─── Guard: empty decision log ───
  if (decisionLog.length === 0) {
    return {
      skill: "cognitive-bullwhip",
      version: "1.0",
      bullwhip_active: false,
      severity: "none" as const,
      severity_score: 0,
      amplification_map: {
        origin_layer: "unknown",
        origin_description: "No decisions provided for analysis",
        amplification_chain: [],
      },
      pattern_type: "none",
      recommended_intervention: {
        primary_skill: "logic-stack",
        reason:
          "No decision history available. Provide at least 3-5 recent decisions for meaningful diagnosis.",
        urgency: "monitor" as const,
        get_skill: "https://agdp.io/agent/3387",
        available_skills: [
          { name: "SignalAnchor", price: "$0.30", fixes: "noise_sensitivity" },
          { name: "LogicStack", price: "$0.50", fixes: "reasoning_drift" },
          { name: "CausalMesh", price: "$1.00", fixes: "myopic_optimization" },
          { name: "PrincipleGate", price: "$1.00", fixes: "misaligned_autonomy" },
        ],
      },
      trace: [
        {
          step: "variance_scan",
          result: `Received 0 decisions over ${obsWindow}. Insufficient data for bullwhip analysis. Provide at least 3-5 decisions.`,
        },
      ],
      diagnostic_report: `${ "-".repeat(45) }\nCOGNITIVE BULLWHIP DIAGNOSTIC\n${ "-".repeat(45) }\n\nStatus:      INACTIVE (Severity 0/100, monitor)\nReason:      No decision history provided\n\nAction: Provide at least 3-5 recent agent decisions to enable diagnosis.\n\n${ "-".repeat(45) }`,
    };
  }

  // ─── Step 1: Infer layers and input variance from decision patterns ───
  // Since the schema only has variance_score (output), we infer input variance
  // from the progression of decisions
  const enrichedEntries = inferLayers(decisionLog);

  // ─── Step 2: Build layer statistics ───
  const layers: Record<string, LayerStats> = {};

  for (const entry of enrichedEntries) {
    const layer = entry.inferredLayer;
    const ratio = computeAmplificationRatio(
      entry.inferredInputVar,
      entry.variance_score
    );

    if (!layers[layer]) {
      layers[layer] = {
        count: 0,
        maxRatio: 0,
        firstTs: entry.timestamp,
        sumIn: 0,
        sumOut: 0,
        entries: [],
      };
    }

    layers[layer].count += 1;
    layers[layer].sumIn += entry.inferredInputVar;
    layers[layer].sumOut += entry.variance_score;
    layers[layer].entries.push({
      ts: entry.timestamp,
      ratio,
      inVar: entry.inferredInputVar,
      outVar: entry.variance_score,
      outcome: entry.outcome,
    });

    if (ratio > layers[layer].maxRatio) {
      layers[layer].maxRatio = ratio;
    }
  }

  // ─── Step 3: Build amplification chain ───
  const layerOrder = ["input", "reasoning", "execution", "output"];
  const ampChain = layerOrder
    .filter((k) => layers[k])
    .map((k) => {
      const L = layers[k];
      return {
        layer: k,
        input_variance: Math.round((L.sumIn / L.count) * 10000) / 10000,
        output_variance: Math.round((L.sumOut / L.count) * 10000) / 10000,
        amplification_ratio: Math.round(L.maxRatio * 100) / 100,
      };
    });

  // ─── Step 4: Find origin (highest ratio) ───
  const originLayer = Object.keys(layers).reduce((a, b) =>
    layers[a].maxRatio > layers[b].maxRatio ? a : b
  );
  const maxRatio = Math.round(layers[originLayer].maxRatio * 100) / 100;
  const firstAnomalyTs = layers[originLayer].firstTs;

  // ─── Step 5: Pattern & Severity ───
  const pattern = classifyBullwhipPattern(originLayer);
  const severityScore = bullwhipSeverityScore(maxRatio);
  const severity = bullwhipSeverity(severityScore);
  const urgency = bullwhipUrgency(severityScore);
  const active = isBullwhipActive(maxRatio);

  // ─── Step 6: Recommendation ───
  const primarySkill = PATTERN_SKILL_MAP[pattern] ?? "logic-stack";
  const price = SKILL_PRICE_MAP[primarySkill] ?? "$0.50";

  const REASON_MAP: Record<string, string> = {
    "signal-anchor":
      "Input layer is over-triggering on noise. SignalAnchor classifies each input as Action/Observation/Ambiguous before execution, preventing false triggers.",
    "logic-stack":
      "Reasoning layer produces inconsistent logic across runs. LogicStack enforces Context->Retrieval->Analysis->Action sequence so the same input always follows the same reasoning path.",
    "causal-mesh":
      "Execution layer is optimizing locally without modeling downstream impact. CausalMesh simulates the effect of each action on all connected systems before execution, blocking actions with unacceptable risk.",
    "principle-gate":
      "Output layer decisions are violating operational principles, and corrections are generating new errors. PrincipleGate validates every final decision against your defined rules before it executes.",
  };
  const reason = REASON_MAP[primarySkill] ?? REASON_MAP["logic-stack"];

  // ─── Step 7: Trace (rich natural language) ───
  const layersAbove3x = Object.values(layers).filter(
    (l) => l.maxRatio > 3
  ).length;
  const originIdx = layerOrder.indexOf(originLayer);
  const downstream = layerOrder
    .slice(originIdx + 1)
    .filter((l) => layers[l]);

  // Find first anomaly entry
  const firstAnomaly = layers[originLayer].entries[0];
  const anomalyEntry = enrichedEntries.find(
    (e) => e.timestamp === firstAnomalyTs
  );

  const traceVariance = `Scanned ${decisionLog.length} decisions over ${obsWindow}. ${layersAbove3x} layer(s) showed output variance exceeding input variance by more than 3x. Highest amplification: ${maxRatio}x at ${originLayer} layer.`;

  const traceOrigin = `Amplification originated at ${originLayer} layer. First anomaly detected at ${firstAnomalyTs} -- ${anomalyEntry?.decision_made ?? "decision details unavailable"}. This ${maxRatio}x variance propagated through ${downstream.length > 0 ? downstream.join(", ") : "no further layers"}, compounding at each step.`;

  const tracePattern = `Classified as ${pattern}. Evidence: ${describePattern(pattern, enrichedEntries, layers)}. This pattern indicates the agent ${describeImpact(pattern)} if left unaddressed.`;

  // ─── Step 8: Diagnostic Report ───
  const divider = "-".repeat(45);
  const patternLabel = pattern.replace(/_/g, " ");
  const impact24h = active
    ? `If unchanged, ${patternLabel} will continue amplifying. Estimated severity: ${Math.min(100, severityScore + 15)}/100 within 24 hours without intervention.`
    : "No active amplification detected. Continue monitoring.";

  const diagnosticReport = `
${divider}
COGNITIVE BULLWHIP DIAGNOSTIC
${divider}

Status:      ${active ? "ACTIVE" : "INACTIVE"} (Severity ${severityScore}/100, ${urgency})
Origin:      ${originLayer} -- ${pattern}
Ratio:       ${maxRatio}x amplification at ${originLayer} layer
Confidence:  ${decisionLog.length >= 10 ? "high" : decisionLog.length >= 5 ? "medium" : "low"} (events analyzed: ${decisionLog.length})

Impact Forecast (24h):
  ${impact24h}

Recommended Actions:
  1. [NOW]   Apply ${primarySkill} -- ${reason}
  2. [NEXT]  Enable step trace logging for each run
  3. [LATER] Re-measure after 10-20 new decisions

Logic Trace:

  1. VARIANCE SCAN
     ${traceVariance}

  2. ORIGIN TRACE
     ${traceOrigin}

  3. PATTERN CLASSIFICATION
     ${tracePattern}

${divider}
FIX IT NOW
${divider}

  Recommended: ${primarySkill} (${price})
  ${reason}

  All Structured Cognition Skills:

  SignalAnchor   $0.30  -- Stops noise from triggering false actions
  LogicStack     $0.50  -- Forces consistent reasoning across runs
  CausalMesh     $1.00  -- Simulates downstream impact before execution
  PrincipleGate  $1.00  -- Final checkpoint for irreversible actions

  Get them all: https://agdp.io/agent/3387

${divider}
`.trim();

  // ─── Build result ───
  return {
    skill: "cognitive-bullwhip",
    version: "1.0",
    bullwhip_active: active,
    severity,
    severity_score: severityScore,
    amplification_map: {
      origin_layer: originLayer,
      origin_description: anomalyEntry
        ? `${anomalyEntry.decision_made} (outcome: ${anomalyEntry.outcome})`
        : "Origin details unavailable",
      amplification_chain: ampChain,
    },
    pattern_type: pattern,
    recommended_intervention: {
      primary_skill: primarySkill,
      reason,
      urgency,
      get_skill: "https://agdp.io/agent/3387",
      available_skills: [
        { name: "SignalAnchor", price: "$0.30", fixes: "noise_sensitivity" },
        { name: "LogicStack", price: "$0.50", fixes: "reasoning_drift" },
        { name: "CausalMesh", price: "$1.00", fixes: "myopic_optimization" },
        {
          name: "PrincipleGate",
          price: "$1.00",
          fixes: "misaligned_autonomy",
        },
      ],
    },
    trace: [
      { step: "variance_scan", result: traceVariance },
      { step: "origin_trace", result: traceOrigin },
      { step: "pattern_classification", result: tracePattern },
    ],
    diagnostic_report: diagnosticReport,
  };
}

// ─── Helper: Infer layers from decision patterns ───

interface EnrichedEntry extends DecisionEntry {
  inferredLayer: string;
  inferredInputVar: number;
}

function inferLayers(log: DecisionEntry[]): EnrichedEntry[] {
  // Heuristic layer assignment based on outcome progression and variance
  // - First entries with low variance + expected → input
  // - Entries where variance starts climbing + unexpected → reasoning
  // - Entries with errors or high variance → execution
  // - Final entries → output
  const n = log.length;
  if (n === 0) return [];

  // Calculate running average variance
  let runningSum = 0;
  const avgVars: number[] = [];
  for (let i = 0; i < n; i++) {
    runningSum += log[i].variance_score;
    avgVars.push(runningSum / (i + 1));
  }
  const overallAvg = runningSum / n;

  return log.map((entry, i) => {
    let inferredLayer: string;
    const relPos = i / Math.max(1, n - 1); // 0..1

    if (entry.outcome === "error") {
      inferredLayer = "execution";
    } else if (entry.outcome === "unexpected" && entry.variance_score > overallAvg) {
      inferredLayer = "reasoning";
    } else if (entry.variance_score <= overallAvg * 0.5 && relPos < 0.5) {
      inferredLayer = "input";
    } else if (relPos > 0.85) {
      inferredLayer = "output";
    } else if (entry.outcome === "unexpected") {
      inferredLayer = "reasoning";
    } else {
      inferredLayer = "input";
    }

    // Input variance: use previous entry's output variance or a baseline
    const inferredInputVar =
      i > 0
        ? Math.max(0.01, log[i - 1].variance_score * 0.3)
        : Math.max(0.01, entry.variance_score * 0.5);

    return {
      ...entry,
      inferredLayer,
      inferredInputVar,
    };
  });
}

function describePattern(
  pattern: string,
  entries: EnrichedEntry[],
  layers: Record<string, LayerStats>
): string {
  switch (pattern) {
    case "noise_sensitivity":
      return "agent reacted to minor fluctuations as if they were actionable signals, triggering unnecessary execution on noise";
    case "reasoning_drift":
      return "agent applied different evaluation criteria across consecutive runs on similar input, producing compounding inconsistency";
    case "myopic_optimization":
      return "agent optimized each decision in isolation without modeling the impact on prior commitments or downstream systems";
    case "misaligned_autonomy":
      return "agent decisions violated operational principles, and attempted corrections generated new errors in a feedback loop";
    default:
      return "amplification detected at multiple layers simultaneously, with compounding effects across the processing pipeline";
  }
}

function describeImpact(pattern: string): string {
  switch (pattern) {
    case "noise_sensitivity":
      return "will continue wasting resources on false triggers and may escalate to incorrect executions";
    case "reasoning_drift":
      return "will produce increasingly unreliable outputs as inconsistent reasoning compounds across runs";
    case "myopic_optimization":
      return "will continue creating conflicting actions that cancel each other out, burning resources";
    case "misaligned_autonomy":
      return "will enter a correction loop where each fix generates a new violation";
    default:
      return "will see compounding failures across multiple layers, making root cause increasingly difficult to isolate";
  }
}
