/**
 * Human-readable report generators for all 5 skills + pipeline.
 * These produce the text that LLM can show directly to the user.
 *
 * Design principle:
 *   - "run it" / "diagnose" -> LLM shows the report block as-is
 *   - "fix this" / "based on this, change..." -> LLM reads JSON block, uses report as reference
 *   - "explain" / "what's wrong" -> LLM interprets JSON + report together
 */

const D = "-".repeat(50);

// ═══════════════════════════════════════════════════════════════
// SignalAnchor Report
// ═══════════════════════════════════════════════════════════════

export function anchorReport(r: Record<string, unknown>): string {
  const noise = r.noise_detected as string[];
  const payload = r.payload as Record<string, unknown>;
  const trace = r.trace as Array<{ step: string; result: string }>;
  const statusIcon = r.status === "pass" ? "CLEAR" : r.status === "flag" ? "FLAGGED" : "BLOCKED";

  return `
${D}
SIGNAL ANCHOR -- INPUT CLASSIFICATION
${D}

Status:      ${statusIcon}
Signal Type: ${r.signal_type}
Confidence:  ${r.confidence}
Proceed:     ${payload.proceed ? "YES" : "NO"}

${noise.length > 0 ? `Noise Detected (${noise.length}):
${noise.map((n, i) => `  ${i + 1}. ${n}`).join("\n")}` : "Noise Detected: None"}

Cleaned Signal:
  "${r.isolated_signal}"

Decision:
  ${payload.reason}

Logic Trace:
${trace.map((t, i) => `
  ${i + 1}. ${t.step.toUpperCase()}
     ${t.result}`).join("")}

${D}
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// LogicStack Report
// ═══════════════════════════════════════════════════════════════

export function logicReport(r: Record<string, unknown>): string {
  const completed = r.sequence_completed as string[];
  const skipped = r.sequence_skipped as string[];
  const memory = r.memory_context as Record<string, unknown>;
  const trace = r.trace as Array<{ step: string; result: string }>;
  const payload = r.payload as Record<string, unknown>;
  const statusIcon = r.status === "pass" ? "COMPLETE" : r.status === "flag" ? "FLAGGED" : "BLOCKED";

  return `
${D}
LOGIC STACK -- REASONING SEQUENCE
${D}

Status:       ${statusIcon}
Confidence:   ${r.confidence}
Risk Horizon: ${r.risk_horizon}
Action Ready: ${payload.action_ready ? "YES" : "NO"}
Action Type:  ${payload.action_type}

Sequence: Context -> Retrieval -> Analysis -> Action
  Completed: [${completed.join(" -> ")}]${skipped.length > 0 ? `
  Skipped:   ${skipped.join(", ")}` : ""}

Recommendation:
  ${r.recommendation}

Consistency Check:
  Prior Pattern: ${memory.prior_pattern_found ? "YES" : "NO"}
  ${memory.prior_pattern_found ? `Prior Decision: ${memory.prior_decision}\n  Consistency: ${memory.consistency_check}` : `Status: ${memory.consistency_check}`}

Reasoning Trace:
${trace.map((t, i) => `
  ${i + 1}. ${t.step.toUpperCase()}
     ${t.result}`).join("")}

${D}
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// CausalMesh Report
// ═══════════════════════════════════════════════════════════════

export function meshReport(r: Record<string, unknown>): string {
  const impact = r.impact_map as Record<string, unknown>;
  const secondary = impact.secondary_effects as string[];
  const riskNodes = impact.risk_nodes as string[];
  const horizon = r.risk_horizon_analysis as Record<string, string>;
  const payload = r.payload as Record<string, unknown>;
  const trace = r.trace as Array<{ step: string; result: string }>;
  const statusIcon = r.status === "pass" ? "SAFE" : r.status === "flag" ? "CAUTION" : "BLOCKED";

  return `
${D}
CAUSAL MESH -- IMPACT SIMULATION
${D}

Status:      ${statusIcon}
Risk Score:  ${r.risk_score}/100
Confidence:  ${r.confidence}
Safe:        ${payload.safe_to_proceed ? "YES" : "NO"}

Direct Effect:
  ${impact.direct_effect}

${riskNodes.length > 0 ? `Risk Nodes (${riskNodes.length}):
${riskNodes.map((n, i) => `  ${i + 1}. ${n}`).join("\n")}` : "Risk Nodes: None detected"}

${secondary.length > 0 ? `Secondary Effects:
${secondary.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}` : "Secondary Effects: None anticipated"}

Horizon Analysis:
  Immediate:  ${horizon.immediate}
  Short-term: ${horizon.short_term}
  Structural: ${horizon.structural}

${payload.requires_modification ? `Adjusted Recommendation:
  ${r.adjusted_recommendation}

Modification Reason:
  ${payload.modification_reason}` : `Recommendation: No modification needed. Original action is safe to proceed.`}

Simulation Trace:
${trace.map((t, i) => `
  ${i + 1}. ${t.step.toUpperCase()}
     ${t.result}`).join("")}

${D}
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// PrincipleGate Report
// ═══════════════════════════════════════════════════════════════

export function gateReport(r: Record<string, unknown>): string {
  const violations = r.violations as Array<Record<string, string>>;
  const audit = r.audit_trail as Record<string, unknown>;
  const trace = r.trace as Array<{ step: string; result: string }>;
  const passed = audit.principles_passed as string[];
  const violated = audit.principles_violated as string[];
  const statusIcon = r.status === "approved" ? "APPROVED" : r.status === "escalated" ? "ESCALATED" : "BLOCKED";

  return `
${D}
PRINCIPLE GATE -- GOVERNANCE CHECK
${D}

Status:       ${statusIcon}
Decision:     ${r.final_decision}
Confidence:   ${r.confidence}
Authority:    ${audit.decision_authority}
Timestamp:    ${audit.decision_timestamp}

Principles Checked: ${(r.principles_checked as string[]).length || "None (default thresholds only)"}
  Passed:   [${passed.join(", ") || "n/a"}]
  Violated: [${violated.join(", ") || "none"}]

${violations.length > 0 ? `Violations:
${violations.map((v, i) => `  ${i + 1}. ${v.principle_id}: ${v.rule}
     Triggered by: ${v.triggered_by}`).join("\n")}` : ""}

${r.escalation_required ? `Escalation Required: YES
  Reason: ${r.escalation_reason}` : "Escalation Required: NO"}

Decision Summary:
  ${audit.decision_summary}

Audit Trace:
${trace.map((t, i) => `
  ${i + 1}. ${t.step.toUpperCase()}
     ${t.result}`).join("")}

${D}
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Report
// ═══════════════════════════════════════════════════════════════

export function pipelineReport(r: Record<string, unknown>): string {
  const completed = r.stages_completed as string[];
  const skipped = r.stages_skipped as string[];
  const stages = r.stages as Record<string, Record<string, unknown>>;
  const statusIcon = r.pipeline_status === "pass" ? "ALL CLEAR" : r.pipeline_status === "flag" ? "FLAGGED" : "BLOCKED";

  const stageNames: Record<string, string> = {
    signal_anchor: "SignalAnchor",
    logic_stack: "LogicStack",
    causal_mesh: "CausalMesh",
    principle_gate: "PrincipleGate",
  };

  const stageIcons: Record<string, string> = {
    pass: "[PASS]",
    flag: "[FLAG]",
    block: "[BLOCK]",
    approved: "[PASS]",
    escalated: "[FLAG]",
    blocked: "[BLOCK]",
  };

  // Build stage summary lines
  const stageLines: string[] = [];
  const allStageOrder = ["signal_anchor", "logic_stack", "causal_mesh", "principle_gate"];

  for (const name of allStageOrder) {
    if (stages[name]) {
      const s = stages[name];
      const st = (s.status ?? s.final_decision ?? "?") as string;
      const icon = stageIcons[st] ?? `[${st.toUpperCase()}]`;
      const conf = s.confidence ?? "?";

      let detail = "";
      if (name === "signal_anchor") {
        detail = `signal=${s.signal_type}, noise=${(s.noise_detected as string[]).length}`;
      } else if (name === "logic_stack") {
        detail = `steps=${(s.sequence_completed as string[]).length}/4, horizon=${s.risk_horizon}`;
      } else if (name === "causal_mesh") {
        detail = `risk=${s.risk_score}/100, nodes=${(s.impact_map as Record<string, unknown>).risk_nodes ? ((s.impact_map as Record<string, unknown>).risk_nodes as string[]).length : 0}`;
      } else if (name === "principle_gate") {
        detail = `decision=${s.final_decision}, violations=${(s.violations as unknown[]).length}`;
      }

      stageLines.push(`  ${icon} ${stageNames[name].padEnd(14)} conf=${conf}  ${detail}`);
    } else {
      stageLines.push(`  [SKIP] ${(stageNames[name] || name).padEnd(14)} (pipeline stopped before this stage)`);
    }
  }

  // Build per-stage detail sections
  const detailSections: string[] = [];
  for (const name of completed) {
    const s = stages[name];
    if (!s) continue;

    if (name === "signal_anchor") {
      detailSections.push(anchorReport(s));
    } else if (name === "logic_stack") {
      detailSections.push(logicReport(s));
    } else if (name === "causal_mesh") {
      detailSections.push(meshReport(s));
    } else if (name === "principle_gate") {
      detailSections.push(gateReport(s));
    }
  }

  return `
${"=".repeat(50)}
STRUCTURED COGNITION PIPELINE
${"=".repeat(50)}

Result:     ${statusIcon}
${r.stopped_at ? `Stopped At: ${stageNames[(r.stopped_at as string)] ?? r.stopped_at}` : "Stopped At: (completed all stages)"}
Confidence: ${r.confidence}
Stages:     ${completed.length}/4 completed${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}

Stage Summary:
${stageLines.join("\n")}

${"=".repeat(50)}
STAGE DETAILS
${"=".repeat(50)}

${detailSections.join("\n\n")}
`.trim();
}
