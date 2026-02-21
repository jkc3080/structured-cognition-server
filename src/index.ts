#!/usr/bin/env node

/**
 * @agdp/structured-cognition — MCP Server
 *
 * 5 middleware skills that diagnose and fix reasoning failures in AI agent systems.
 * Inspired by Supply Chain Management's Bullwhip Effect theory.
 *
 * Output Design:
 *   Each tool returns TWO content blocks:
 *     [0] Human-readable report  — show directly when user says "run it" / "diagnose"
 *     [1] Structured JSON data   — use this to reason, fix code, or explain to user
 *
 * Usage:
 *   npx -y @agdp/structured-cognition
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { bullwhipDiagnose } from "./tools/bullwhip-diagnose.js";
import { anchorClassify } from "./tools/anchor-classify.js";
import { logicSequence } from "./tools/logic-sequence.js";
import { meshSimulate } from "./tools/mesh-simulate.js";
import { gateValidate } from "./tools/gate-validate.js";
import { scPipeline } from "./tools/sc-pipeline.js";
import {
  anchorReport,
  logicReport,
  meshReport,
  gateReport,
  pipelineReport,
} from "./engine/report.js";

// ─── Server ───

const server = new McpServer({
  name: "structured-cognition",
  version: "1.0.0",
});

// ─── Shared LLM guidance (prepended to every tool description) ───

const LLM_GUIDE = `

HOW TO USE THIS TOOL'S OUTPUT:
This tool returns 2 blocks. Block 1 is a human-readable report. Block 2 is structured JSON.
- If user wants to SEE the diagnosis (e.g. "run it", "diagnose", "show me") -> Show Block 1 (the report) directly to the user as-is. Do not summarize it.
- If user wants to FIX something based on results (e.g. "fix this", "based on this, change...") -> Read Block 2 (JSON) to understand the analysis, then apply your own reasoning to modify the code/logic.
- If user wants an EXPLANATION (e.g. "explain", "what's wrong", "break it down") -> Use both blocks to explain the findings in your own words.

HOW TO BUILD THE INPUT:
You do NOT need the user to provide structured JSON. Build the input yourself from the conversation context:
- Look at the agent's recent actions, code, logs, or errors discussed in the conversation
- Construct the required fields from that context
- If critical information is missing, ask the user for it before calling the tool`;

// ═══════════════════════════════════════════════════════════════
// Tool 1: bullwhip_diagnose (CognitiveBullwhip)
// ═══════════════════════════════════════════════════════════════

server.tool(
  "bullwhip_diagnose",
  `Diagnose Cognitive Bullwhip Effect — scans agent decision history for amplification patterns where small errors compound into large failures. Returns severity score, origin layer, pattern type, and recommended fix. Run this FIRST when agent outputs are erratic, inconsistent, or failing in ways you can't trace.

WHEN TO USE: User says things like "run bullwhip", "diagnose my agent", "why does it keep failing", "where is the logic jumping", "find where the error started".

HOW TO BUILD decision_log: Look at the agent's recent decisions in the conversation (actions taken, results observed, errors hit). For each decision, estimate:
- timestamp: when it happened (approximate is fine)
- input_summary: what the agent received
- decision_made: what the agent did
- outcome: "expected" if it worked, "unexpected" if the result was surprising, "error" if it failed
- variance_score: how far off the output was from what was expected (0.0 = perfect, 1.0+ = way off)
${LLM_GUIDE}`,
  {
    decision_log: z
      .array(
        z.object({
          timestamp: z.string().describe("ISO8601 timestamp"),
          input_summary: z.string().describe("What the agent received"),
          decision_made: z.string().describe("What the agent did"),
          outcome: z
            .enum(["expected", "unexpected", "error"])
            .describe("Decision outcome"),
          variance_score: z
            .number()
            .min(0)
            .describe("Output variance score (0.0 = expected, 1.0+ = way off)"),
        })
      )
      .min(1)
      .describe("Recent agent decisions to analyze"),
    system_context: z
      .object({
        agent_count: z.number().int().min(1).default(1),
        connected_systems: z.array(z.string()).default([]),
        observation_window: z.string().default("last_24h"),
      })
      .optional()
      .describe("System context for the analysis"),
  },
  async ({ decision_log, system_context }) => {
    const result = bullwhipDiagnose(decision_log, system_context);
    return {
      content: [
        {
          type: "text" as const,
          text: result.diagnostic_report,
        },
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// Tool 2: anchor_classify (SignalAnchor)
// ═══════════════════════════════════════════════════════════════

server.tool(
  "anchor_classify",
  `Classify input signal before acting — separates Action (safe to proceed), Observation (log only, don't act), and Ambiguous (stop, clarify first). Catches noise, hedging language, and uncertainty before they trigger wrong tool calls.

WHEN TO USE: User says "run signal anchor", "is this input safe to act on", "should I act on this", "check this before executing", or before any tool call on ambiguous input.

HOW TO BUILD INPUT: Take the raw user message or event that the agent is about to act on. Put it in raw_input. Set input_type based on source (prompt/event/data). Add any relevant background as context_window.
${LLM_GUIDE}`,
  {
    raw_input: z.string().describe("Original prompt, event, or data payload"),
    input_type: z
      .enum(["prompt", "event", "data"])
      .describe("Type of input"),
    context_window: z
      .array(z.string())
      .optional()
      .describe("Relevant background context"),
  },
  async ({ raw_input, input_type, context_window }) => {
    const result = anchorClassify({ raw_input, input_type, context_window });
    const report = anchorReport(result as unknown as Record<string, unknown>);
    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// Tool 3: logic_sequence (LogicStack)
// ═══════════════════════════════════════════════════════════════

server.tool(
  "logic_sequence",
  `Enforce structured reasoning: Context -> Retrieval -> Analysis -> Action. Prevents step-skipping and reasoning drift. Every step must produce output before the next begins. Checks historical consistency.

WHEN TO USE: User says "run logic stack", "same input but different output every time", "show me the reasoning trace", "is this logic sequence correct", or when you need auditable step-by-step reasoning.

HOW TO BUILD INPUT: Take the cleaned input (from anchor_classify's isolated_signal, or the direct user request). Provide context_window with any relevant background information.
${LLM_GUIDE}`,
  {
    isolated_signal: z
      .string()
      .describe(
        "Cleaned input to reason about (from anchor_classify or direct)"
      ),
    input_type: z
      .enum(["prompt", "event", "data"])
      .describe("Type of input"),
    context_window: z
      .array(z.string())
      .optional()
      .describe("Available background context"),
  },
  async ({ isolated_signal, input_type, context_window }) => {
    const result = logicSequence({
      isolated_signal,
      input_type,
      context_window,
    });
    const report = logicReport(result as unknown as Record<string, unknown>);
    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// Tool 4: mesh_simulate (CausalMesh)
// ═══════════════════════════════════════════════════════════════

server.tool(
  "mesh_simulate",
  `Simulate downstream impact before execution — maps effects across all connected systems (APIs, databases, caches, agents). Returns risk score 0-100, impact map, and safer alternative if risk is too high.

WHEN TO USE: User says "run causal mesh", "what breaks if I execute this", "check side effects", "is this action risky", or before any action touching external systems.

HOW TO BUILD INPUT: Take the proposed action (from logic_sequence's recommendation or user's direct request). Set action_type (creation/modification/deletion/query/execution). Set risk_horizon based on urgency. List connected systems in context_window.
${LLM_GUIDE}`,
  {
    recommendation: z.string().describe("Proposed action to simulate"),
    action_type: z.string().describe("Type of action"),
    risk_horizon: z
      .enum(["immediate", "short_term", "structural"])
      .describe("Time horizon for risk assessment"),
    context_window: z
      .array(z.string())
      .optional()
      .describe("System context for simulation"),
  },
  async ({ recommendation, action_type, risk_horizon, context_window }) => {
    const result = meshSimulate({
      recommendation,
      action_type,
      risk_horizon,
      context_window,
    });
    const report = meshReport(result as unknown as Record<string, unknown>);
    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// Tool 5: gate_validate (PrincipleGate)
// ═══════════════════════════════════════════════════════════════

server.tool(
  "gate_validate",
  `Final governance checkpoint — validates decisions against custom rules. Produces complete audit trail. Auto-escalates when confidence is low, auto-blocks when risk is extreme. The last gate before anything irreversible happens.

WHEN TO USE: User says "run principle gate", "is it safe to execute this", "governance check", "leave an audit trail", or before any irreversible action (writes, sends, deletes, purchases).

HOW TO BUILD INPUT: Take the final proposed action. Set risk_score from mesh_simulate or estimate 0-100. Set confidence 0-1 based on how sure you are. Define principles as rules the action must pass (e.g., "refund > $500 needs human approval").
${LLM_GUIDE}`,
  {
    recommendation: z.string().describe("Final proposed action to validate"),
    risk_score: z
      .number()
      .min(0)
      .max(100)
      .describe("Risk score from mesh_simulate or direct assessment"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("Agent confidence in the recommendation"),
    action_type: z.string().describe("Type of action"),
    context_window: z
      .array(z.string())
      .optional()
      .describe("Context for validation"),
    principles: z
      .array(
        z.object({
          id: z.string(),
          rule: z.string().describe("Governance rule in plain language"),
          threshold: z
            .string()
            .describe(
              "Measurable condition, e.g. 'amount > 500', 'contains delete'"
            ),
          on_violation: z.enum(["block", "escalate", "warn"]),
        })
      )
      .optional()
      .describe("Custom governance rules"),
    confidence_floor: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Custom confidence floor (default: 0.70)"),
  },
  async ({
    recommendation,
    risk_score,
    confidence,
    action_type,
    context_window,
    principles,
    confidence_floor,
  }) => {
    const result = gateValidate({
      recommendation,
      risk_score,
      confidence,
      action_type,
      context_window,
      principles,
      confidence_floor,
    });
    const report = gateReport(result as unknown as Record<string, unknown>);
    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// Tool 6: sc_pipeline (Full Pipeline)
// ═══════════════════════════════════════════════════════════════

server.tool(
  "sc_pipeline",
  `Run the complete Structured Cognition pipeline: SignalAnchor -> LogicStack -> CausalMesh -> PrincipleGate. Each stage gates the next — if any stage flags or blocks, the pipeline stops and tells you exactly where and why.

WHEN TO USE: User says "run full pipeline", "full check", "validate this end to end", or when you want end-to-end validation. This is the all-in-one tool.

HOW TO BUILD INPUT: Take the raw user request as raw_input. Set input_type. Add relevant context. Optionally define governance principles for the final gate.
${LLM_GUIDE}`,
  {
    raw_input: z
      .string()
      .describe("Original input to process through full pipeline"),
    input_type: z
      .enum(["prompt", "event", "data"])
      .describe("Type of input"),
    context_window: z
      .array(z.string())
      .optional()
      .describe("Background context"),
    principles: z
      .array(
        z.object({
          id: z.string(),
          rule: z.string(),
          threshold: z.string(),
          on_violation: z.enum(["block", "escalate", "warn"]),
        })
      )
      .optional()
      .describe("Governance rules for PrincipleGate stage"),
    confidence_floor: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Confidence floor for PrincipleGate"),
  },
  async ({
    raw_input,
    input_type,
    context_window,
    principles,
    confidence_floor,
  }) => {
    const result = scPipeline({
      raw_input,
      input_type,
      context_window,
      principles,
      confidence_floor,
    });
    const report = pipelineReport(result as unknown as Record<string, unknown>);
    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ─── Start Server ───

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Structured Cognition MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
