# Comparison memo: LangGraph vs OpenAI fn-calling vs MCP

Working notes for the W3 decision memo. Compares this LangGraph spike
against `../openai-fn-calling/NOTES.md` and (by extension) MCP.

**Status:** Scaffolded; awaiting first smoke run.

## Methodology

All three surfaces wrap the same six APAP REST operations. Both
alternatives spikes use `gpt-4o-mini` and the same six canned prompts
in `src/smoke.ts`, so the only difference is the orchestration layer.

| Layer | LOC | Notes |
|---|---|---|
| MCP server (`apap-mcp-poc/src/handlers/mcp.ts`) | ~370 | tool registration, two transports, session lifecycle |
| OpenAI fn-calling (`../openai-fn-calling/src/*`) | ~205 | hand-rolled chat loop, static tool array |
| LangGraph (`./src/*`) | ~150 | StateGraph + ToolNode, Zod schemas |

## Surface ergonomics

(To be filled after running.)

Items to capture:
- Lines of code for the orchestration glue itself (excluding the
  shared apap-client).
- How tools are defined (raw JSON schema vs Zod object).
- How the loop is expressed (explicit `for` vs graph edges).
- How errors propagate from a tool back to the model.

## Type system handling

LangGraph uses Zod for tool input schemas, which is closer to APAP's
own `drizzle-zod` schemas than the raw JSON Schema that the fn-calling
spike uses. Worth checking whether this composes with the Concerto
`$class` typing in the long run, or if it's just a syntactic
difference.

## Context window usage

(To be filled after running.)

Hypothesis: the per-request token tax is identical to the fn-calling
spike, because under the hood LangGraph still serialises the tool
definitions and sends them with each LLM call. The framework owns the
loop, not the wire protocol.

If confirmed, the LangGraph framework dependency does NOT solve the
token tax problem Niall flagged on May 20. That remains a job for the
W7 auto-tooling work.

## Multi-step orchestration

This is where LangGraph should differentiate. The state graph makes
multi-step flows like "discover template request type then trigger
with the right $class" first-class. The fn-calling spike does the same
thing but as an implicit consequence of the loop structure.

(To be filled after running.) Capture:
- Whether the model uses fewer turns to accomplish multi-step prompts
  under LangGraph (e.g. prompt 5 in the smoke set).
- Whether the graph composability is actually useful at six tools, or
  only pays off at the scale W7 auto-tooling would create.

## Dev experience

(To be filled.)

Items to capture:
- Graph visualisation (`graph.getGraph().drawMermaid()`) for the
  one-paragraph README diagram.
- Debug visibility: errors from inside a node bubble cleanly?
- Iteration speed vs the fn-calling spike.

## Agent-calling-agents fit

This is the load-bearing row for the W9 demo. The question: does
LangGraph make agent-calling-agents materially easier than rolling
it by hand on top of fn-calling?

Plausible answers:
- "Yes, supervisor pattern + subgraphs is exactly the shape we need."
- "No, both approaches end up writing roughly the same orchestration."

(To be filled after the smoke run plus a tiny supervisor experiment.)

## Provisional verdict (pre-data)

If the per-request token tax is the same and multi-step orchestration
is a similar amount of code in both, then the fn-calling approach wins
for the alternatives surface because it has zero dependency footprint.
LangGraph wins as soon as the orchestration gets non-trivial (W9 demo,
auto-tooling routing).

The likely final memo recommendation:
- MCP as the primary surface for native MCP clients.
- OpenAI fn-calling as the thin alternative for hosts that do not
  speak MCP.
- LangGraph as the orchestration substrate for the W9 agent-calling-
  agents demo, used alongside MCP rather than instead of it.

## Next

- [ ] Run smoke against local APAP
- [ ] Capture transcript at `transcripts/smoke-YYYY-MM-DD.log`
- [ ] Fill empty sections with actual numbers
- [ ] Cross-reference into the fn-calling NOTES.md
- [ ] Promote both notes into the W3 decision memo
