/**
 * gate_validate — PrincipleGate MCP Tool
 *
 * Final checkpoint before irreversible execution.
 * Validates decisions against governance rules and produces audit trail.
 *
 * Deterministic principle checking + threshold enforcement.
 */

import { gateDecision, gateStatus } from "../engine/scoring.js";
import { GATE } from "../engine/thresholds.js";

interface PrincipleConfig {
  id: string;
  rule: string;
  threshold: string;
  on_violation: "block" | "escalate" | "warn";
}

interface GateInput {
  recommendation: string;
  risk_score: number;
  confidence: number;
  action_type: string;
  context_window?: string[];
  principles?: PrincipleConfig[];
  confidence_floor?: number;
}

export function gateValidate(input: GateInput) {
  const {
    recommendation,
    risk_score,
    confidence,
    action_type,
    context_window = [],
    principles = [],
    confidence_floor = GATE.DEFAULT_CONFIDENCE_FLOOR,
  } = input;

  // ─── Step 1: Check each principle ───
  const violations: Array<{
    principle_id: string;
    rule: string;
    triggered_by: string;
  }> = [];
  const principlesPassed: string[] = [];
  const principlesViolated: string[] = [];
  const principleResults: Array<{
    id: string;
    rule: string;
    passed: boolean;
    triggered_by?: string;
  }> = [];

  for (const p of principles) {
    const violated = checkPrincipleViolation(
      p,
      recommendation,
      risk_score,
      confidence,
      action_type,
      context_window
    );

    if (violated) {
      violations.push({
        principle_id: p.id,
        rule: p.rule,
        triggered_by: violated.triggered_by,
      });
      principlesViolated.push(p.id);
      principleResults.push({
        id: p.id,
        rule: p.rule,
        passed: false,
        triggered_by: violated.triggered_by,
      });
    } else {
      principlesPassed.push(p.id);
      principleResults.push({
        id: p.id,
        rule: p.rule,
        passed: true,
      });
    }
  }

  // ─── Step 2: Map violations to their on_violation rules ───
  const violationsWithAction = violations.map((v) => {
    const p = principles.find((pr) => pr.id === v.principle_id);
    return {
      ...v,
      on_violation: p?.on_violation ?? ("escalate" as const),
    };
  });

  // ─── Step 3: Determine final decision ───
  const decision = gateDecision(
    confidence,
    confidence_floor,
    risk_score,
    violationsWithAction
  );
  const status = gateStatus(decision);

  // ─── Step 4: Escalation reason ───
  let escalationRequired = decision === "escalate";
  let escalationReason = "";

  if (confidence < confidence_floor) {
    escalationRequired = true;
    escalationReason = `Agent confidence (${confidence}) is below the required floor (${confidence_floor}). Human review required before proceeding with: "${recommendation.substring(0, 100)}".`;
  } else if (risk_score > GATE.RISK_AUTO_BLOCK) {
    escalationReason = `Risk score ${risk_score} exceeds hard block threshold (${GATE.RISK_AUTO_BLOCK}). Action blocked: "${recommendation.substring(0, 100)}".`;
  } else if (violations.length > 0) {
    const violationSummary = violations
      .map((v) => `${v.principle_id}: ${v.rule} (triggered by: ${v.triggered_by})`)
      .join("; ");
    escalationReason = `${violations.length} principle violation(s) detected: ${violationSummary}`;
  }

  // ─── Step 5: Build audit trail ───
  const now = new Date().toISOString();
  const auditTrail = {
    decision_summary: buildDecisionSummary(
      decision,
      recommendation,
      violations,
      confidence,
      confidence_floor,
      risk_score
    ),
    principles_passed: principlesPassed,
    principles_violated: principlesViolated,
    decision_timestamp: now,
    decision_authority: decision === "execute" ? "agent" : ("human" as const),
    full_trace: principleResults,
  };

  // ─── Step 6: Build trace ───
  const tracePrincipleCheck = principles.length > 0
    ? `Checked ${principles.length} principle(s). ${principlesPassed.length} passed, ${principlesViolated.length} violated. ${principlesViolated.length > 0 ? `Violations: ${principlesViolated.join(", ")}.` : "All principles satisfied."}`
    : `No custom principles provided. Applying default thresholds only (confidence floor: ${confidence_floor}, risk block: ${GATE.RISK_AUTO_BLOCK}).`;

  const traceConfidence = `Confidence: ${confidence} (floor: ${confidence_floor}). ${confidence < confidence_floor ? `BELOW FLOOR -- auto-escalate triggered.` : "Above floor -- confidence check passed."} Risk score: ${risk_score}/100. ${risk_score > GATE.RISK_AUTO_BLOCK ? `ABOVE BLOCK THRESHOLD (${GATE.RISK_AUTO_BLOCK}) -- hard block.` : risk_score > 70 ? "Elevated but below hard block." : "Within acceptable range."}`;

  const recPreview = recommendation.length > 80
    ? `${recommendation.substring(0, 80)}...`
    : recommendation;
  const traceDecision = `Final decision: ${decision}. ${decision === "execute" ? `All checks passed. Action "${recPreview}" approved for autonomous execution.` : decision === "escalate" ? `Escalation required. ${escalationReason}` : `Blocked. ${escalationReason}`}`;

  return {
    skill: "principle-gate",
    version: "1.0",
    status,
    confidence,
    principles_checked: principles.map((p) => p.id),
    violations,
    final_decision: decision,
    escalation_required: escalationRequired,
    escalation_reason: escalationReason,
    audit_trail: auditTrail,
    trace: [
      { step: "principle_check", result: tracePrincipleCheck },
      { step: "confidence_risk_check", result: traceConfidence },
      { step: "final_decision", result: traceDecision },
    ],
  };
}

// ─── Helpers ───

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Irregular English verb forms relevant to agent governance keywords.
// Returns additional word forms that cannot be derived by regular morphology rules.
function getIrregularForms(keyword: string): string[] {
  const irregulars: Record<string, string[]> = {
    write: ["written", "wrote", "writing", "writes", "rewrite", "rewritten", "overwrite", "overwritten"],
    overwrite: ["overwritten", "overwrote", "overwriting", "overwrites"],
    break: ["broken", "broke", "breaking", "breaks"],
    take: ["taken", "took", "taking", "takes"],
    give: ["given", "gave", "giving", "gives"],
    send: ["sent", "sending", "sends"],
    spend: ["spent", "spending", "spends"],
    run: ["ran", "running", "runs"],
    set: ["setting", "sets"],
    get: ["got", "gotten", "getting", "gets"],
    do: ["did", "done", "doing", "does"],
    go: ["went", "gone", "going", "goes"],
    make: ["made", "making", "makes"],
    see: ["saw", "seen", "seeing", "sees"],
    know: ["knew", "known", "knowing", "knows"],
    find: ["found", "finding", "finds"],
    lose: ["lost", "losing", "loses"],
    choose: ["chose", "chosen", "choosing", "chooses"],
    begin: ["began", "begun", "beginning", "begins"],
    hold: ["held", "holding", "holds"],
    pay: ["paid", "paying", "pays"],
    buy: ["bought", "buying", "buys"],
    sell: ["sold", "selling", "sells"],
    build: ["built", "building", "builds"],
    withdraw: ["withdrew", "withdrawn", "withdrawing", "withdraws", "withdrawal", "withdrawals"],
    forbid: ["forbade", "forbidden", "forbidding", "forbids"],
  };
  return irregulars[keyword.toLowerCase()] ?? [];
}

// ─── Principle Violation Check ───

function checkPrincipleViolation(
  principle: PrincipleConfig,
  recommendation: string,
  riskScore: number,
  confidence: number,
  actionType: string,
  context: string[]
): { triggered_by: string } | null {
  const lower = recommendation.toLowerCase();
  const thresholdLower = principle.threshold.toLowerCase();

  // Parse threshold for numeric comparisons
  // Supports patterns like: "amount > 500", "cost > 100", "risk > 70"
  const numericMatch = thresholdLower.match(
    /(\w+)\s*(>|<|>=|<=)\s*(\d+(?:\.\d+)?)/
  );

  if (numericMatch) {
    const [, field, op, valStr] = numericMatch;
    const thresholdVal = parseFloat(valStr);

    // Check known fields
    let actualVal: number | null = null;
    if (field === "risk" || field === "risk_score") {
      actualVal = riskScore;
    } else if (field === "confidence") {
      actualVal = confidence;
    }

    // Try to extract the field name followed by a number from recommendation
    if (actualVal === null) {
      const fieldMatch = lower.match(
        new RegExp(`${field}[:\\s]*\\$?([\\d,]+\\.?\\d*)`)
      );
      if (fieldMatch) {
        actualVal = parseFloat(fieldMatch[1].replace(/,/g, ""));
      }
    }

    // Fallback: if the field name isn't found, look for currency values ($NNN)
    // or standalone large numbers that likely represent the field
    if (actualVal === null) {
      const currencyMatch = recommendation.match(
        /\$\s?([\d,]+\.?\d*)/
      );
      if (currencyMatch) {
        actualVal = parseFloat(currencyMatch[1].replace(/,/g, ""));
      }
    }

    if (actualVal !== null) {
      let violated = false;
      switch (op) {
        case ">":
          violated = actualVal > thresholdVal;
          break;
        case ">=":
          violated = actualVal >= thresholdVal;
          break;
        case "<":
          violated = actualVal < thresholdVal;
          break;
        case "<=":
          violated = actualVal <= thresholdVal;
          break;
      }
      if (violated) {
        return {
          triggered_by: `${field}: ${actualVal} ${op} ${thresholdVal}`,
        };
      }
    }
  }

  // Keyword-based threshold matching
  // e.g., threshold: "contains delete" or "action_type = deletion"
  // Supports stem matching: "contains delete" matches "delete", "deleted",
  // "deleting", "deletion", "deletes" etc.
  const keywordMatch = thresholdLower.match(
    /contains?\s+["']?(.+?)["']?\s*$/
  );
  if (keywordMatch) {
    const keyword = keywordMatch[1].trim();

    // ─── Irregular verb forms (must check before regex patterns) ───
    const irregularForms = getIrregularForms(keyword);
    for (const form of irregularForms) {
      const irregRegex = new RegExp(`\\b${escapeRegex(form)}\\b`, "i");
      if (irregRegex.test(lower)) {
        const match = lower.match(irregRegex);
        return {
          triggered_by: `recommendation contains "${match?.[0] ?? form}" (matched keyword: "${keyword}")`,
        };
      }
    }

    // ─── Regular morphology patterns ───
    // Rules:
    //   1. Direct suffix:       "delete" + "s"    → "deletes"
    //   2. E-drop before vowel: "delete" - "e"    → "delet" + "ion" → "deletion"
    //   3. Consonant doubling:  "stop" + "p"      → "stopp" + "ed"  → "stopped"
    //   4. Y→I transformation: "modify" - "y"     → "modif" + "ication" → "modification"
    const escaped = escapeRegex(keyword);
    const vowelSuffixes = "(?:ing|ion|ions|ive|ible|able|ance|ence|ation|ations|ed|er|ers|ous|al)";
    const consonantSuffixes = "(?:e?s|e?d|ing|ment|ments|ful|less|ness|ly)";

    // Pattern 1: keyword + optional consonant-starting suffix
    const directPattern = `\\b${escaped}${consonantSuffixes}?\\b`;

    // Pattern 2: keyword minus trailing "e" + vowel-starting suffix (e-drop rule)
    // e.g. "expire" → "expir" + "ation" → "expiration"
    const eDropPattern = keyword.endsWith("e")
      ? `\\b${escapeRegex(keyword.slice(0, -1))}${vowelSuffixes}\\b`
      : null;

    // Pattern 3: keyword with last consonant doubled + suffix (e.g., stop→stopped)
    const lastChar = keyword[keyword.length - 1];
    const doublingPattern = lastChar && /[bcdfghlmnprstvz]/.test(lastChar)
      ? `\\b${escaped}${escapeRegex(lastChar)}(?:ed|ing|er|ers)\\b`
      : null;

    // Pattern 4: Y→I transformation (e.g., modify→modification, classify→classification)
    const yTransformPattern = keyword.endsWith("y")
      ? `\\b${escapeRegex(keyword.slice(0, -1))}(?:ied|ies|ication|ications|ier|iers|ily)\\b`
      : null;

    // Combine all patterns
    const patterns = [directPattern];
    if (eDropPattern) patterns.push(eDropPattern);
    if (doublingPattern) patterns.push(doublingPattern);
    if (yTransformPattern) patterns.push(yTransformPattern);
    const stemRegex = new RegExp(`(?:${patterns.join("|")})`, "i");

    if (stemRegex.test(lower)) {
      const match = lower.match(stemRegex);
      return {
        triggered_by: `recommendation contains "${match?.[0] ?? keyword}" (matched keyword: "${keyword}")`,
      };
    }
  }

  // Action type matching
  const actionMatch = thresholdLower.match(
    /action_type\s*=\s*["']?(\w+)["']?/
  );
  if (actionMatch) {
    if (actionType.toLowerCase() === actionMatch[1]) {
      return {
        triggered_by: `action_type matches "${actionMatch[1]}"`,
      };
    }
  }

  return null;
}

// ─── Decision Summary ───

function buildDecisionSummary(
  decision: string,
  recommendation: string,
  violations: Array<{ principle_id: string; rule: string; triggered_by: string }>,
  confidence: number,
  confidenceFloor: number,
  riskScore: number
): string {
  const recShort = recommendation.length > 120
    ? `${recommendation.substring(0, 120)}...`
    : recommendation;

  if (decision === "execute") {
    return `Approved: "${recShort}" -- all principles passed, confidence ${confidence} >= ${confidenceFloor}, risk ${riskScore} within bounds.`;
  }

  if (decision === "escalate") {
    if (confidence < confidenceFloor) {
      return `Escalated: "${recShort}" -- confidence ${confidence} below floor ${confidenceFloor}. Human review required.`;
    }
    return `Escalated: "${recShort}" -- ${violations.length} principle violation(s) require human review.`;
  }

  return `Blocked: "${recShort}" -- ${violations.length > 0 ? `principle violations: ${violations.map((v) => v.principle_id).join(", ")}` : `risk score ${riskScore} exceeds block threshold`}.`;
}
