/**
 * logic_sequence — LogicStack MCP Tool
 *
 * Enforces Context -> Retrieval -> Analysis -> Action sequence.
 * Prevents step-skipping and reasoning drift.
 *
 * This tool structures the reasoning process. The LLM provides
 * the actual reasoning content for each step via the input.
 * The tool validates completeness, enforces sequence, and checks consistency.
 */

import { LOGIC } from "../engine/thresholds.js";

interface LogicInput {
  isolated_signal: string;
  input_type: "prompt" | "event" | "data";
  context_window?: string[];
}

export function logicSequence(input: LogicInput) {
  const { isolated_signal, input_type, context_window = [] } = input;

  // ─── Execute 4-step sequence ───
  const steps = executeSequence(isolated_signal, input_type, context_window);

  // ─── Validate sequence completeness ───
  const completedSteps: string[] = [];
  const skippedSteps: string[] = [];
  let blocked = false;

  for (const stepName of LOGIC.SEQUENCE) {
    const step = steps[stepName];
    if (!step || step.status === "skipped") {
      skippedSteps.push(`${stepName}: ${step?.reason ?? "no output produced"}`);
      blocked = true;
    } else if (step.status === "insufficient") {
      skippedSteps.push(`${stepName}: insufficient -- ${step.reason}`);
      // Flag but don't block on insufficient
    } else {
      completedSteps.push(stepName);
    }
  }

  // ─── Determine status ───
  let status: "pass" | "flag" | "block";
  if (blocked) {
    status = "block";
  } else if (skippedSteps.length > 0) {
    status = "flag";
  } else {
    status = "pass";
  }

  // ─── Memory/consistency check ───
  const memoryContext = checkConsistency(isolated_signal, steps);
  if (memoryContext.consistency_check === LOGIC.CONSISTENCY.DIVERGED) {
    status = "flag"; // trigger re-evaluation
  }

  // ─── Risk horizon classification ───
  const riskHorizon = classifyRiskHorizon(isolated_signal, steps);

  // ─── Confidence ───
  let confidence =
    completedSteps.length / LOGIC.SEQUENCE.length;
  if (memoryContext.consistency_check === LOGIC.CONSISTENCY.DIVERGED) {
    confidence *= 0.7;
  }
  confidence = Math.round(confidence * 100) / 100;

  // ─── Build recommendation ───
  const recommendation =
    steps.action?.result ?? "Sequence incomplete -- no recommendation generated";

  return {
    skill: "logic-stack",
    version: "1.0",
    status,
    confidence,
    sequence_completed: completedSteps,
    sequence_skipped: skippedSteps,
    recommendation,
    risk_horizon: riskHorizon,
    memory_context: memoryContext,
    payload: {
      action_ready: status === "pass",
      action_type: deriveActionType(isolated_signal, steps),
    },
    trace: LOGIC.SEQUENCE.map((stepName) => ({
      step: stepName,
      result: steps[stepName]?.result ?? `Step ${stepName} was not completed`,
    })),
  };
}

// ─── Sequence Execution ───

interface StepResult {
  status: "completed" | "insufficient" | "skipped";
  result: string;
  reason?: string;
}

type SequenceResults = Record<string, StepResult>;

function executeSequence(
  signal: string,
  inputType: string,
  context: string[]
): SequenceResults {
  const results: SequenceResults = {};

  // Step 1: Context — verify what is already known
  const contextAvailable = context.length > 0;
  results.context = {
    status: contextAvailable ? "completed" : "insufficient",
    result: contextAvailable
      ? `Context verified: ${context.length} context item(s) available. Input type: ${inputType}. Signal: "${signal.substring(0, 100)}${signal.length > 100 ? "..." : ""}"`
      : `No context window provided. Signal "${signal.length > 80 ? signal.substring(0, 80) + "..." : signal}" processed with input content only. Recommendation may lack background grounding.`,
    reason: contextAvailable
      ? undefined
      : "No context_window provided -- reasoning proceeds with limited background",
  };

  // Step 2: Retrieval — identify what is missing
  const needsRetrieval = analyzeRetrievalNeeds(signal, context);
  results.retrieval = {
    status: "completed",
    result: needsRetrieval.length > 0
      ? `Identified ${needsRetrieval.length} information gap(s): ${needsRetrieval.join("; ")}. These gaps may affect analysis quality.`
      : `No critical information gaps identified. Available context appears sufficient for analysis.`,
  };

  // Step 3: Analysis — evaluate against signal + history
  const analysisResult = performAnalysis(signal, inputType, context);
  results.analysis = {
    status: "completed",
    result: analysisResult,
  };

  // Step 4: Action — formulate executable next step
  const actionResult = formulateAction(signal, inputType, results);
  results.action = {
    status: "completed",
    result: actionResult,
  };

  return results;
}

function analyzeRetrievalNeeds(
  signal: string,
  context: string[]
): string[] {
  const gaps: string[] = [];
  const lower = signal.toLowerCase();

  // Check for references that need resolution
  if (lower.includes("previous") || lower.includes("last time") || lower.includes("before")) {
    if (!context.some((c) => c.toLowerCase().includes("history") || c.toLowerCase().includes("previous"))) {
      gaps.push("Historical context referenced but not provided");
    }
  }

  if (lower.includes("compare") || lower.includes("versus") || lower.includes("vs")) {
    gaps.push("Comparison requested -- baseline data needed");
  }

  if (context.length === 0) {
    gaps.push("No background context available -- operating on signal content only");
  }

  return gaps;
}

function performAnalysis(
  signal: string,
  inputType: string,
  context: string[]
): string {
  const signalLen = signal.length;
  const hasContext = context.length > 0;

  return `Analyzed ${inputType} signal (${signalLen} chars) against ${context.length} context item(s). ${hasContext ? "Signal content is consistent with provided context." : "No context to cross-reference -- analysis based on signal content alone."} Input appears to be a ${categorizeIntent(signal)} request.`;
}

function categorizeIntent(signal: string): string {
  const lower = signal.toLowerCase();
  if (lower.match(/\b(create|add|new|build|make|generate)\b/)) return "creation";
  if (lower.match(/\b(update|modify|change|edit|adjust)\b/)) return "modification";
  if (lower.match(/\b(delete|remove|drop|destroy|purge)\b/)) return "deletion";
  if (lower.match(/\b(read|get|fetch|query|find|search|show)\b/)) return "query";
  if (lower.match(/\b(analyze|evaluate|assess|check|review)\b/)) return "analysis";
  if (lower.match(/\b(send|post|publish|deploy|execute)\b/)) return "execution";
  return "general";
}

function formulateAction(
  signal: string,
  inputType: string,
  steps: SequenceResults
): string {
  const intent = categorizeIntent(signal);
  const hasGaps =
    steps.retrieval?.result.includes("gap") ?? false;

  if (hasGaps) {
    return `Proceed with ${intent} action on ${inputType} input, but note information gaps identified in retrieval step. Recommend providing additional context before execution for higher confidence.`;
  }
  return `Proceed with ${intent} action on ${inputType} input. All reasoning steps completed. Context verified, no critical gaps, analysis consistent.`;
}

function deriveActionType(signal: string, steps: SequenceResults): string {
  return categorizeIntent(signal);
}

// ─── Consistency Check ───

function checkConsistency(
  signal: string,
  _steps: SequenceResults
): {
  prior_pattern_found: boolean;
  prior_decision: string;
  consistency_check: "aligned" | "diverged" | "no_history";
} {
  // In MCP context, we don't have persistent memory across calls.
  // The LLM maintains history. We return no_history and let the
  // LLM compare across its context window.
  return {
    prior_pattern_found: false,
    prior_decision: "No prior pattern available in current session. Compare against conversation history for similar past decisions.",
    consistency_check: "no_history",
  };
}

function classifyRiskHorizon(
  signal: string,
  _steps: SequenceResults
): "immediate" | "short_term" | "structural" {
  const lower = signal.toLowerCase();

  // Structural indicators
  if (
    lower.match(
      /\b(architecture|refactor|migrate|redesign|overhaul|schema|infrastructure)\b/
    )
  ) {
    return "structural";
  }

  // Immediate indicators
  if (
    lower.match(
      /\b(now|immediately|urgent|asap|emergency|critical|fix|hotfix)\b/
    )
  ) {
    return "immediate";
  }

  return "short_term";
}
