# @agdp/structured-cognition

MCP server that provides deterministic reasoning middleware for AI agent systems. Six tools that catch reasoning failures — drift, noise, cascading risk, principle violations — before they compound.

## Tools

| Tool | What it does |
|------|-------------|
| `signal_anchor` | Classifies input noise level and flags context-dependent signals |
| `logic_sequence` | Enforces Context → Retrieval → Analysis → Action sequence |
| `mesh_simulate` | Simulates downstream impact before action execution |
| `gate_validate` | Checks actions against configurable principles |
| `bullwhip_diagnose` | Detects amplification patterns across decision history |
| `sc_pipeline` | Runs all four core tools in sequence with auto-gating |

## Install

```bash
npm install @agdp/structured-cognition
```

Or directly from GitHub:

```bash
npm install jkc3080/structured-cognition-server
```

## Usage

### As MCP Server

Add to your MCP config (Claude Desktop, OpenClaw, etc.):

```json
{
  "mcpServers": {
    "structured-cognition": {
      "command": "npx",
      "args": ["@agdp/structured-cognition"]
    }
  }
}
```

### Run directly

```bash
npx @agdp/structured-cognition
```

## How it works

Every tool returns **dual-block output**:

- **Block 1**: Human-readable report with status, findings, and recommendations
- **Block 2**: Structured JSON for downstream agent consumption

All scoring is **deterministic** — same input always produces same output. No LLM calls inside the tools. The server provides the scaffolding; your agent provides the reasoning.

## Tool Details

### signal_anchor

```
Input:  raw_input (string), input_type, context_window[]
Output: noise_floor (0-1), anchor_type, context_flags[]
```

Classifies whether input is actionable signal or noise. Detects hedging language, vague references, and missing context.

### logic_sequence

```
Input:  isolated_signal (string), input_type, context_window[]
Output: status (pass/flag/block), confidence, sequence trace
```

Forces 4-step reasoning: Context → Retrieval → Analysis → Action. Blocks if steps are skipped.

### mesh_simulate

```
Input:  recommendation (string), action_type, risk_horizon, context_window[]
Output: risk_score (0-100), impact_map, adjusted_recommendation
```

Maps system nodes affected by a proposed action. Scores risk across API, database, cache, cost, and storage dimensions.

### gate_validate

```
Input:  recommendation (string), principles[], context_window[]
Output: decision (execute/escalate/block), violations[], confidence
```

Checks actions against user-defined principles. Supports keyword matching (with English morphology — handles deletion, expired, overwritten, etc.) and numeric thresholds.

### bullwhip_diagnose

```
Input:  decision_log[] (entries with input, reasoning, action, outcome)
Output: bullwhip_active (bool), severity_score, amplification layers
```

Detects cognitive bullwhip — when small input variations produce disproportionate action swings. Analyzes volatility, flip-flop patterns, and confidence-action gaps.

### sc_pipeline

```
Input:  raw_input (string), input_type, principles[], context_window[]
Output: 4-stage trace with auto-gating between stages
```

Chains SignalAnchor → LogicStack → CausalMesh → PrincipleGate. Each stage gates the next — if one blocks, the pipeline stops.

## Development

```bash
git clone https://github.com/jkc3080/structured-cognition-server.git
cd structured-cognition-server
npm install
npm run build
npm start
```

## License

MIT
