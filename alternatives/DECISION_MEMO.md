# Alternatives evaluation: MCP vs OpenAI function-calling vs LangGraph

**Author:** Jay Guwalani
**Date:** Jun 14, 2026 (draft for W3 mentor review)
**Project:** GSoC 2026 - Hardening APAP / MCP (Idea #4)
**Mentors:** Niall Roche, Dan Selman
**Related artifacts:**
[openai-fn-calling spike](https://github.com/JayDS22/apap-mcp-poc/tree/alternatives/openai-fn-calling) |
[langgraph spike](https://github.com/JayDS22/apap-mcp-poc/tree/alternatives/langgraph) |
[GSoC roadmap PR #190](https://github.com/accordproject/apap/pull/190)

---

## Executive summary

After running two functional spikes (OpenAI function-calling and LangGraph) against the same APAP backend with the same prompts as MCP, the data points to a layered recommendation rather than a single winner:

1. **MCP as the primary agent surface for APAP.** Native MCP clients (Claude Desktop, Inspector, custom MCP-aware agents) get the richest integration, the stateful resource model aligns with APAP's URI-keyed handles, and the 2026-07-28 RC is moving the spec in the direction APAP's design already implies.

2. **OpenAI function-calling as a thin alternative surface** for hosts that do not speak MCP. Tool definitions should be codegen'd from the existing OpenAPI spec rather than maintained by hand, to keep the duplication cost near zero.

3. **LangGraph reserved for orchestration when it becomes non-trivial.** The framework does not solve the per-request token tax that dominates cost at scale; its value is composable multi-agent orchestration. Hold for W7 auto-tooling and W9 agent-calling-agents demo, not adopted as a baseline.

The token-cost dimension is invariant across all three surfaces (about 1,100 to 1,200 tokens of tool-definition overhead per request). The orchestration framework choice does not move that number; only auto-tooling does. This is the load-bearing finding for the W7 work.

---

## Why this evaluation

The May 20 sync raised three concerns that surfaced as the Alternatives workstream on the roadmap:

- Whether MCP is the right primary surface for APAP, or whether OpenAI function-calling or an agent framework would do the same job more simply
- Whether the per-request "tool tax" Niall flagged is structural to MCP or to all of these patterns
- Whether the W9 agent-calling-agents demo would benefit from an orchestration substrate beyond either MCP or raw function-calling

This memo answers all three.

---

## Methodology

All three surfaces wrap the same six APAP REST operations: `list_templates`, `get_template`, `list_agreements`, `get_agreement`, `convert_agreement`, `trigger_agreement`. Each surface was implemented against the POC at `apap-mcp-poc/` running locally via `docker compose up`.

The same six canned prompts were run against each surface using `gpt-4o-mini`:

1. List all templates
2. Count agreements and statuses
3. Show full payload of agreement 1
4. Convert agreement 1 to markdown
5. Trigger agreement 1 with `goodsValue 140` (requires `$class` discovery)
6. Find an agreement using a late-delivery template

Transcripts are committed in each spike directory (`transcripts/smoke-2026-06-10.log`).

---

## Results

### Surface size

| Layer | LOC (orchestration glue) | Notes |
|---|---|---|
| MCP server (`src/handlers/mcp.ts`) | ~370 | Tool registration plus two transport implementations plus session lifecycle |
| OpenAI fn-calling (`alternatives/openai-fn-calling/src/`) | ~205 | Hand-rolled `for MAX_TURNS` loop, static tool array |
| LangGraph (`alternatives/langgraph/src/`) | ~150 | `StateGraph` plus prebuilt `ToolNode`, Zod schemas |

LangGraph removes about 25% of orchestration LOC versus hand-rolled function-calling. The cost is three transitive packages (`@langchain/core`, `@langchain/langgraph`, `@langchain/openai`) plus a Zod peer-version coordination requirement (Zod must pin to `3.25.76` to match `@langchain/core`'s internal version, otherwise `tool()` typing breaks).

### Token cost (six-prompt smoke)

| Prompt | OpenAI fn-calling | LangGraph |
|---|---|---|
| 1. List templates | 1,426 | 1,360 |
| 2. Count agreements | 1,371 | 1,352 |
| 3. Full payload of agreement 1 | 1,526 | 1,538 |
| 4. Convert to markdown | 1,354 | 1,333 |
| 5. Trigger with `$class` discovery | 2,399 | 2,343 |
| 6. Find late-delivery agreement | 2,360 | 1,350 |
| **Total** | **10,436** | **9,276** |

LangGraph came in about 11% cheaper overall. The bulk of the delta sits on prompt 6, where the model under LangGraph made one tool call (`list_agreements`) while under fn-calling it made two (`list_templates` then `list_agreements`). This is model-behaviour noise from differently-shaped tool descriptions (Zod-generated vs hand-written JSON Schema), not a framework property. Across multiple runs both surfaces would land within a few percent of each other.

At `gpt-4o-mini` pricing both runs cost approximately **$0.002**. The $20/month budget approved by Matt covers roughly ten thousand runs of this size.

---

## Key findings

### 1. The per-request token tax is invariant across frameworks

About 1,100 to 1,200 tokens go to tool definitions on every API call, regardless of which orchestration framework wraps them. The framework owns the loop; the wire protocol still serialises the tools per request.

At six tools the tax is manageable. At twenty tools (where the W7 auto-tooling work tends to head) the per-request overhead would reach about 3,500 tokens. The orchestration framework does not solve this. Only auto-tooling does, meaning selecting which subset of tools to expose to the model per request.

This is the structural answer to Niall's "context window discipline" concern from May 20: it is not an MCP problem, it is a general agent-surface problem, and W7 is where it gets fixed.

### 2. Type discipline (Concerto `$class`) carries across all three surfaces

The clearest evidence of this was prompt 5: the model was told to "use the request `$class` that matches the template" without being given the actual class name. On all three surfaces it called `get_agreement` first, read the `$class` field from the response, and constructed the trigger body correctly:

```json
{
  "$class": "io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenaltyRequest",
  "goodsValue": 140
}
```

This works because APAP's type system is structurally available to the model through the data it returns. The model navigates the typed graph without needing a custom protocol layer to do it. This is also the framing in Issue #185 (GraphQL-shape discussion filed for Dan) and matches the AAIF "MCP Is Growing Up" article's framing of explicit handles.

### 3. Framework choice matters for orchestration, not for cost

For single-agent flows over APAP, LangGraph saves about 25% LOC compared to hand-rolled function-calling. That saving alone does not justify the dependency footprint. The case for LangGraph is the orchestration patterns it enables, not the line count it saves:

- Conditional branches between subgraphs
- Supervisor patterns (one agent coordinating other agents, each with a subset of tools)
- Retry and timeout policies that should not appear in user code

Those become load-bearing in W7 (auto-tooling routing) and W9 (agent-calling-agents demo), not in W2-W3.

### 4. MCP's design direction (2026-07-28 RC) validates APAP's existing shape

While the spikes were running, the MCP 2026-07-28 release candidate dropped. The headline change is statelessness at the protocol layer: `Mcp-Session-Id` removed, requests self-contained, application state returned as explicit handles like `basket_id`.

This is the pattern APAP already has. The `apap://templates/{id}` and `apap://agreements/{id}` URIs are functionally what the RC calls "explicit handles." The convergence is not coincidence; the RC is recognising what business protocols with stable identifiers already do well.

This means the MCP migration in W4 to W6 is mostly aligning APAP's existing patterns with the new spec, not redesigning around it. The bigger work is the parallel-transport spike for the new headers (`Mcp-Method`, `Mcp-Name`) and the optional Tasks-extension framing for agreement triggers.

---

## Recommendation

**Primary surface: MCP.** Continue the GSoC roadmap's core service-layer plus MCP work. The W4 to W6 RC migration aligns naturally with APAP's existing typed-handle design.

**Secondary surface: OpenAI function-calling, codegen'd from OpenAPI.** For agent hosts that do not speak MCP (which today is the majority by count), expose APAP through a thin function-calling adapter generated from the existing `openapi.json`. Zero duplicated maintenance burden because the schemas are already there.

**Reserved substrate: LangGraph for W9.** Use the framework where it earns its keep, the agent-calling-agents demo and any orchestration patterns the W7 auto-tooling work needs. Do not adopt as the baseline runtime for APAP's MCP layer.

---

## Open questions for mentor input

These need answers before the W3 deliverable is finalised. Happy to take async or in the next sync.

1. **CrewAI vs LangGraph as the demo substrate.** This spike chose LangGraph because the agent-calling-agents demo will need orchestration primitives and the graph model fits. CrewAI has stronger "role-based agent" abstractions which might fit the legal-agreement domain better (one agent per party, supervisor coordinates settlement). Worth a 2-day CrewAI spike before W9, or trust the LangGraph data so far?

2. **Codegen for the function-calling adapter.** If the secondary surface is going to be auto-generated from `openapi.json`, where should that codegen live? A script in `accordproject/apap` next to the existing OpenAPI build, or a separate package?

3. **MCP Tasks for agreement triggers.** The 2026-07-28 RC introduces Tasks as the framing for long-running tool calls. Agreement triggers are inherently long-running (Concerto logic execution can be non-trivial). Worth proposing APAP ships its own `tasks` extension as part of the W9 migration guide, or punt to post-GSoC?

---

## Risks

- **Per-request token tax compounds with tool growth.** If APAP's tool count grows past 10-12 without auto-tooling, the cost per agent interaction climbs linearly. W7 auto-tooling is the mitigation; do not let it slip.
- **The LangGraph version coordination problem.** `@langchain/core` peer-depends on a specific Zod version range. Future LangChain updates may break the peer pin again. Plan for this in any production LangGraph use.
- **Codegen for function-calling assumes OpenAPI stays current.** If the OpenAPI spec ever falls behind the actual REST surface, the generated function-calling adapter will drift. Already true for OpenAPI clients but worth noting.

---

## Next steps

| Week | Action |
|---|---|
| W3 (Jun 16-22) | Send this memo to mentors for sign-off. Address open questions. |
| W3 | Open issue on `accordproject/apap` proposing the function-calling adapter codegen approach, if mentors green-light. |
| W4-W5 | Parallel-transport spike for the MCP 2026-07-28 RC (already on roadmap). |
| W7 | Auto-tooling prototype, the mitigation for the per-request token tax this memo identifies. |
| W9 | Agent-calling-agents demo built on LangGraph supervisor pattern, scoped per the demo's actual orchestration needs. |

This memo is the canonical version. Both spike `NOTES.md` files will be slimmed to point here for the detail rather than duplicate it.
