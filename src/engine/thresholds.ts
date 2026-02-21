/**
 * Hard-coded thresholds from all 5 SKILL.md specifications.
 * These are deterministic — no LLM needed.
 */

// === CognitiveBullwhip ===
export const BULLWHIP = {
  /** Amplification ratio above this confirms Bullwhip active */
  RATIO_CONFIRM: 3.0,
  /** Severity score thresholds */
  SEVERITY: {
    NONE_MAX: 20,
    LOW_MAX: 40,
    MODERATE_MAX: 60,
    HIGH_MAX: 80,
    // 81-100 = critical
  },
  /** Urgency thresholds */
  URGENCY: {
    IMMEDIATE_ABOVE: 70,
    SCHEDULED_ABOVE: 40,
    // below 40 = monitor
  },
} as const;

// === SignalAnchor ===
export const ANCHOR = {
  /** Confidence below this → auto-flag regardless of signal_type */
  CONFIDENCE_AUTO_FLAG: 0.6,
} as const;

// === LogicStack ===
export const LOGIC = {
  /** Required sequence — order matters */
  SEQUENCE: ["context", "retrieval", "analysis", "action"] as const,
  /** Consistency check values */
  CONSISTENCY: {
    ALIGNED: "aligned",
    DIVERGED: "diverged",
    NO_HISTORY: "no_history",
  },
} as const;

// === CausalMesh ===
export const MESH = {
  /** Risk score thresholds */
  RISK: {
    FLAG_ABOVE: 70,
    BLOCK_ABOVE: 90,
  },
  /** Structural risk special threshold */
  STRUCTURAL_ESCALATE_ABOVE: 50,
} as const;

// === PrincipleGate ===
export const GATE = {
  /** Default confidence floor (used when no principles.json provided) */
  DEFAULT_CONFIDENCE_FLOOR: 0.70,
  /** Risk score that blocks regardless of principles */
  RISK_AUTO_BLOCK: 90,
} as const;

// === Pattern → Skill mapping (Bullwhip) ===
export const PATTERN_SKILL_MAP: Record<string, string> = {
  noise_sensitivity: "signal-anchor",
  reasoning_drift: "logic-stack",
  myopic_optimization: "causal-mesh",
  misaligned_autonomy: "principle-gate",
  compound: "logic-stack", // start with highest severity layer
};

export const PATTERN_LAYER_MAP: Record<string, string> = {
  input: "noise_sensitivity",
  reasoning: "reasoning_drift",
  execution: "myopic_optimization",
  output: "misaligned_autonomy",
};

export const SKILL_PRICE_MAP: Record<string, string> = {
  "signal-anchor": "$0.30",
  "logic-stack": "$0.50",
  "causal-mesh": "$1.00",
  "principle-gate": "$1.00",
};
