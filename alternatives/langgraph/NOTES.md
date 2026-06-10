# Comparison memo: LangGraph vs OpenAI fn-calling vs MCP

Working notes for the W3 decision memo. Compares this LangGraph spike
against `../openai-fn-calling/NOTES.md` and (by extension) MCP.

**Status:** First smoke run complete (Jun 10, 2026). Memo populated
with real numbers from a side-by-side run against the same APAP
instance, same model, same prompts.

## Methodology

All three surfaces wrap the same six APAP REST operations. Both
alternatives spikes use `gpt-4o-mini` and the same six canned prompts
in `src/smoke.ts`. The only thing that differs between the two
alternatives is the orchestration layer.

| Layer | LOC (src only) | Notes |
|---|---|---|
| MCP server (`apap-mcp-poc/src/handlers/mcp.ts`) | ~370 | tool registration, two transports, session lifecycle |
| OpenAI fn-calling (`../openai-fn-calling/src/`) | ~205 | hand-rolled `for MAX_TURNS` loop, raw JSON Schema |
| LangGraph (`./src/`) | ~150 | StateGraph + prebuilt ToolNode, Zod schemas |

## Smoke results (Jun 10, 2026)

Direct side-by-side with the fn-calling spike. Same APAP instance,
same prompts, same model.

| # | Prompt | LangGraph turns / calls / total tok | fn-calling turns / calls / total tok |
|---|---|---|---|
| 1 | List all templates | 2 / 1 / 1360 | 2 / 1 / 1426 |
| 2 | How many agreements + statuses | 2 / 1 / 1352 | 2 / 1 / 1371 |
| 3 | Full payload of agreement 1 | 2 / 1 / 1538 | 2 / 1 / 1526 |
| 4 | Convert agreement 1 to markdown | 2 / 1 / 1333 | 2 / 1 / 1354 |
| 5 | Trigger agreement 1, infer $class | 3 / 2 / 2343 | 3 / 2 / 2399 |
| 6 | Find agreement using late-delivery template | 2 / 1 / 1350 | 3 / 2 / 2360 |
| | **Totals** | **9276** | **10436** |

LangGraph came in **~11% cheaper** across the six prompts. The bulk of
the difference is prompt 6 (1350 vs 2360 tokens). On that prompt the
fn-calling spike chose to call `list_templates` then `list_agreements`;
LangGraph went straight to `list_agreements` because the response
already contains the template URI. This is **model behaviour** under
slightly different tool ordering / descriptions (Zod-generated vs
hand-written JSON Schema), not a framework property. Across multiple
runs you would expect both to land within a few percent of each other.

At gpt-4o-mini pricing both runs cost approximately $0.002.

## Surface ergonomics

| | LangGraph | OpenAI fn-calling |
|---|---|---|
| Tool registration | `tool(impl, { name, description, schema: z.object(...) })` | static `ChatCompletionTool[]` array |
| Loop structure | `StateGraph + ToolNode`, conditional edges | explicit `for` over `MAX_TURNS` |
| Tool execution | prebuilt `ToolNode` dispatches by name | hand-rolled `dispatch(name, args)` switch |
| Recursion limit | `recursionLimit` on `.invoke()` | `MAX_TURNS` in code |
| Token usage surfacing | per-AIMessage `usage_metadata` | per-completion `usage` object |
| LOC (orchestration) | ~150 | ~205 |

LangGraph removes ~55 LOC of hand-rolled loop machinery. Most of the
savings is the explicit `for` loop and the `dispatch` switch which the
framework handles via `ToolNode`. The cost is ~120 KB of transitive
dependencies (`@langchain/core`, `@langchain/langgraph`,
`@langchain/openai`) plus a Zod peer-version coordination problem
(had to align to `zod@3.25.76` to match `@langchain/core`'s internal
version, otherwise the `tool()` typing breaks).

## Type system handling

LangGraph uses Zod schemas for tool inputs which compose cleanly with
APAP's `drizzle-zod` schemas, in theory. In practice the Zod schemas
are converted to JSON Schema at the LLM boundary via
`zod-to-json-schema`, so the wire format the model sees is identical
to the fn-calling spike. The Zod layer is a developer-ergonomics win,
not a model-side capability difference.

Concerto `$class` round-tripping works identically. Prompt 5 (trigger
with $class discovery) produced the right `LateDeliveryAndPenaltyRequest`
class string in both spikes after a `get_agreement` call.

## Context window usage

**Hypothesis confirmed:** the per-request token tax is essentially
identical. LangGraph still serialises all tool definitions and sends
them with each LLM call; the framework owns the loop, not the wire
protocol. The 11% delta across the smoke set is model-behaviour noise
from differently-shaped tool descriptions, not a structural
difference.

This means **the LangGraph dependency does not solve the context
window discipline problem Niall flagged on May 20.** That problem
needs auto-tooling (W7), regardless of whether the surface is MCP,
fn-calling, or LangGraph.

## Multi-step orchestration

This is where LangGraph should justify itself. On prompt 5 (trigger
with $class discovery, two-step) both spikes handled the chain
correctly. LangGraph used the same number of turns (3) and tool calls
(2) as the fn-calling spike, with comparable token usage.

**At six tools, multi-step orchestration is a wash.** The win would
show up when the orchestration becomes non-trivial:

- Conditional branches (W7 auto-tooling: pick the right subset of
  tools per request).
- Multi-agent supervisor patterns (W9 agent-calling-agents demo).
- Retries and timeout policies that should not appear in user code.

For the W3 decision, the load-bearing claim is "LangGraph is the right
substrate for the W9 demo," not "LangGraph wins for single-agent
flows."

## Auth model

Identical to the fn-calling spike: delegated to whoever calls OpenAI.
No native scoping in LangGraph itself. Same trade-offs vs MCP's
session-bound auth.

## Dev experience

What worked well:

- `tool()` + Zod is more compact than the static JSON Schema array.
- `compile()` produces an introspectable graph
  (`graph.getGraph().drawMermaid()` for diagrams).
- Token usage surfaces per AIMessage which makes attribution easier.

What was less clean:

- Zod peer-version mismatch with `@langchain/core` requires explicit
  alignment in `package.json` (pinned to `zod@3.25.76`).
- The error messages for tool-typing failures are several screens of
  ZodObject overload mismatches; not friendly.
- `MessagesAnnotation` is opaque if you have not read the LangGraph
  documentation; the fn-calling spike's plain message array is
  self-documenting.

## Agent-calling-agents fit

This is the load-bearing row for the W9 demo. Not exercised in this
spike yet. LangGraph supports supervisor patterns via subgraphs and
the `interrupt()` / `Command` primitives. The fn-calling spike would
need a hand-rolled equivalent (a stack of conversations with a
top-level orchestrator).

**Plan:** in W7 build a tiny supervisor experiment on top of this
spike (one supervising agent, two worker agents, each with a subset
of APAP tools). If that experiment produces materially less
orchestration code than rolling it on raw fn-calling, the LangGraph
dependency is justified. If not, fn-calling wins on dependency
footprint.

## Provisional verdict (with data)

For **single-agent flows over APAP**:

- Token cost: essentially identical (~$0.002 per six-prompt smoke).
- LOC: LangGraph saves ~25%.
- Multi-step reasoning: parity.
- Dependency footprint: LangGraph adds 3 packages and a Zod-version
  coordination problem.

The LOC saving alone does not justify the dependencies. The case for
LangGraph is the W9 agent-calling-agents demo and the W7 auto-tooling
routing logic.

**Recommendation for the W3 memo (subject to mentor input):**

- MCP as the primary surface for native MCP clients.
- OpenAI fn-calling as the thin alternative for hosts that do not
  speak MCP; tool definitions ideally codegen'd from the OpenAPI
  spec.
- LangGraph reserved for orchestration when it becomes non-trivial
  (W7 auto-tooling, W9 agent-calling-agents demo).

## Next

- [x] First smoke run
- [x] Capture transcript (`transcripts/smoke-2026-06-10.log`)
- [x] Memo populated with real numbers
- [ ] Cross-link into `../openai-fn-calling/NOTES.md` so both memos
      reference each other
- [ ] Decide W7 supervisor experiment scope
- [ ] Promote both notes into the W3 decision memo for mentor review
