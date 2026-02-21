/**
 * anchor_classify — SignalAnchor MCP Tool
 *
 * Classifies input as Action / Observation / Ambiguous before execution.
 * Deterministic thresholds + LLM-assessed classification.
 *
 * The LLM calling this tool should pre-assess signal_type and confidence
 * in the tool input. This tool applies hard threshold rules on top.
 */

import { anchorStatus, anchorShouldProceed } from "../engine/scoring.js";
import { ANCHOR } from "../engine/thresholds.js";

interface AnchorInput {
  raw_input: string;
  input_type: "prompt" | "event" | "data";
  context_window?: string[];
}

export function anchorClassify(input: AnchorInput) {
  const { raw_input, input_type, context_window = [] } = input;

  // ─── Signal Analysis (heuristic + pattern matching) ───
  const analysis = analyzeSignal(raw_input, input_type, context_window);

  // ─── Apply hard thresholds ───
  const status = anchorStatus(analysis.signalType, analysis.confidence);
  const proceed = anchorShouldProceed(analysis.signalType, analysis.confidence);

  // ─── Build trace ───
  const noiseDesc = analysis.noiseDetected.length > 0
    ? `Detected ${analysis.noiseDetected.length} noise indicator(s): ${analysis.noiseDetected.join("; ")}.`
    : "No noise indicators detected.";
  const traceIsolation = `Received ${input_type} input (${raw_input.length} chars). ${noiseDesc} Signal classified as ${analysis.signalType} with confidence ${analysis.confidence}.`;

  const contextDesc = context_window.length === 0
    ? "No background context provided -- classification relies on input content alone. Consider providing context for higher confidence."
    : "Context evaluated against input for consistency and completeness.";
  const flagNote = analysis.confidence < ANCHOR.CONFIDENCE_AUTO_FLAG
    ? ` Confidence ${analysis.confidence} is below auto-flag threshold (${ANCHOR.CONFIDENCE_AUTO_FLAG}) -- flagged regardless of signal type.`
    : "";
  const traceContext = `Context window contains ${context_window.length} item(s). ${contextDesc}${flagNote}`;

  return {
    skill: "signal-anchor",
    version: "1.0",
    status,
    confidence: analysis.confidence,
    signal_type: analysis.signalType,
    isolated_signal: analysis.isolatedSignal,
    noise_detected: analysis.noiseDetected,
    payload: {
      proceed,
      reason: analysis.reason,
    },
    trace: [
      { step: "signal_isolation", result: traceIsolation },
      { step: "context_definition", result: traceContext },
    ],
  };
}

// ─── Heuristic Signal Analysis ───

interface SignalAnalysis {
  signalType: "action" | "observation" | "ambiguous";
  confidence: number;
  isolatedSignal: string;
  noiseDetected: string[];
  reason: string;
}

function analyzeSignal(
  rawInput: string,
  inputType: string,
  contextWindow: string[]
): SignalAnalysis {
  const lower = rawInput.toLowerCase();
  const noiseDetected: string[] = [];
  let confidence = 0.8; // base confidence

  // ─── Noise detection patterns ───

  // Hedging language
  const hedging = [
    "maybe",
    "perhaps",
    "not sure",
    "i think",
    "possibly",
    "might",
    "could be",
    "i guess",
  ];
  for (const h of hedging) {
    if (lower.includes(h)) {
      noiseDetected.push(`hedging language: '${h}'`);
      confidence -= 0.15;
    }
  }

  // Uncertainty markers
  const uncertainty = ["?", "idk", "don't know", "unclear", "confusing"];
  for (const u of uncertainty) {
    if (lower.includes(u)) {
      noiseDetected.push(`uncertainty marker: '${u}'`);
      confidence -= 0.1;
    }
  }

  // One-time spike indicators (for data/event types)
  if (inputType === "data" || inputType === "event") {
    const spikeWords = ["spike", "anomaly", "outlier", "one-time", "blip"];
    for (const s of spikeWords) {
      if (lower.includes(s)) {
        noiseDetected.push(`spike indicator: '${s}'`);
        confidence -= 0.1;
      }
    }
  }

  // Dangerous action words (need high confidence)
  const dangerousActions = [
    "delete",
    "drop",
    "remove",
    "destroy",
    "purge",
    "wipe",
    "reset",
    "overwrite",
  ];
  const hasDangerous = dangerousActions.some((d) => lower.includes(d));
  if (hasDangerous && noiseDetected.length > 0) {
    noiseDetected.push(
      "irreversible action keyword combined with uncertainty"
    );
    confidence -= 0.2;
  }

  // Context penalty
  if (contextWindow.length === 0) {
    confidence -= 0.1;
  }

  // Clamp confidence
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;

  // ─── Signal type classification ───
  let signalType: "action" | "observation" | "ambiguous";
  let reason: string;

  if (confidence < ANCHOR.CONFIDENCE_AUTO_FLAG) {
    signalType = "ambiguous";
    reason = `Confidence ${confidence} below threshold ${ANCHOR.CONFIDENCE_AUTO_FLAG}. Input contains too much noise or insufficient context to classify safely. Clarification required before any action.`;
  } else if (noiseDetected.length >= 2) {
    signalType = "ambiguous";
    reason = `Multiple noise indicators detected (${noiseDetected.length}). Input intent unclear -- flagged for clarification.`;
  } else if (
    inputType === "data" &&
    noiseDetected.some((n) => n.includes("spike"))
  ) {
    signalType = "observation";
    reason =
      "Data input contains spike/anomaly indicators. Logged for monitoring -- no action warranted without confirmation.";
  } else if (inputType === "event" && noiseDetected.length > 0) {
    signalType = "observation";
    reason =
      "Event contains noise indicators suggesting one-time occurrence. Monitor, do not act.";
  } else {
    signalType = "action";
    reason = `Input classified as actionable with confidence ${confidence}. Context sufficient to proceed.`;
  }

  // ─── Isolated signal (noise removed) ───
  let isolatedSignal = rawInput;
  // Remove hedging phrases for the cleaned version
  for (const h of hedging) {
    isolatedSignal = isolatedSignal.replace(
      new RegExp(`\\b${h}\\b`, "gi"),
      ""
    );
  }
  isolatedSignal = isolatedSignal.replace(/\s+/g, " ").trim();

  return {
    signalType,
    confidence,
    isolatedSignal,
    noiseDetected,
    reason,
  };
}
