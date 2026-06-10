# Comparison memo: OpenAI function-calling vs MCP

Working notes for the W3 decision memo. First-pass data captured from a
six-prompt smoke run against a fresh local APAP (`docker compose up`,
single seeded template + one seeded agreement).

**Status:** First smoke run complete (Jun 10, 2026). Memo populated with
real numbers; ready for sharing with mentors after one polish pass.

## Methodology

Both surfaces wrap the same six APAP REST operations. The MCP side is
`apap-mcp-poc/src/handlers/mcp.ts` (~370 lines). The function-calling
side is `src/tools.ts` (~95 lines) plus `src/chat.ts` (~110 lines). The
canned smoke set lives in `src/smoke.ts` and the captured transcript is
in `transcripts/smoke-2026-06-10.log`.

Model: `gpt-4o-mini`. APAP_BASE_URL: `http://localhost:9000`.

## Smoke results (Jun 10, 2026)

| # | Prompt | Turns | Tool calls | Tokens (p/c/total) |
|---|---|---|---|---|
| 1 | List all templates available in this APAP server. | 2 | 1 (`list_templates`) | 1322 / 104 / 1426 |
| 2 | How many agreements are currently in the system, and what statuses are they in? | 2 | 1 (`list_agreements`) | 1339 / 32 / 1371 |
| 3 | Show me the full payload of agreement 1, including its state. | 2 | 1 (`get_agreement`) | 1331 / 195 / 1526 |
| 4 | Convert agreement 1 to markdown. | 2 | 1 (`convert_agreement`) | 1225 / 129 / 1354 |
| 5 | Trigger agreement 1 with goodsValue 140. Use the request $class that matches the template. | 3 | 2 (`get_agreement` → `trigger_agreement`) | 2297 / 102 / 2399 |
| 6 | Find any agreement that uses a late-delivery template, and tell me its current status. | 3 | 2 (`list_templates` + `list_agreements`) | 2317 / 43 / 2360 |
| | **Totals** | | | **9831 / 605 / 10436** |

At gpt-4o-mini pricing ($0.15/MTok input, $0.60/MTok output) the entire
six-prompt smoke run cost approximately **$0.0019**. The $20/month
budget covers approximately ten thousand runs of this size.

## Surface ergonomics

| | MCP server (`apap-mcp-poc`) | OpenAI function-calling (this spike) |
|---|---|---|
| Lines of code (handler) | ~370 | ~205 |
| Tool registration | `server.registerTool(name, schema, handler)` runtime calls | Static array of tool definitions |
| Transport machinery | SSE + StreamableHTTP, session lifecycle | None (plain HTTPS to OpenAI) |
| Client-side support | Claude Desktop, Inspector, custom MCP clients | Any OpenAI-compatible LLM |
| Tool discovery for the model | Loaded into context once per session | Loaded into context once per request |
| Auth ergonomics | OAuth/JWT through transport headers | API key in env |
| Iteration loop (edit + retest) | Restart server, reconnect client | `npm run chat -- "..."` |

The function-calling surface is meaningfully smaller, ~205 lines vs
~370. Most of the MCP overhead is transport plumbing (session ID
handling, the two transport implementations, McpServer wiring) that
function-calling does not need because each request is stateless.

## Type system handling

The Concerto `$class` discriminator round-trips cleanly. The most
interesting case was prompt 5: the model was told to "use the request
$class that matches the template" without being given the exact class
name. It correctly chained `get_agreement` → `trigger_agreement` and
constructed:

```json
{
  "$class": "io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenaltyRequest",
  "forceMajeure": false,
  "goodsValue": 140
}
```

discovered from the agreement payload returned by `get_agreement`.

The `additionalProperties: true` schema on `trigger_agreement.body` was
sufficient. The tool description ("you must construct a request body
with a $class field naming the correct Concerto request type, if
unsure call get_agreement first") was enough scaffolding without
embedding the actual Concerto types in the schema. This is the inverse
of what MCP does, where the JSON Schema is the contract; here, the
prose description is the contract and the model fills in the structure.

## Context window usage

This is the biggest finding of the spike. **The 6 tool definitions plus
the system prompt take roughly 1100-1200 tokens per request.** That
overhead is paid on every API call, not amortized across a session the
way MCP's loaded tool list is.

Implications:

- Short conversations: function-calling wastes tokens. A single round
  trip costs 1300-1500 tokens of which ~85% is tool/system overhead.
- Long conversations: amortizes well because the overhead is fixed
  while the conversation grows.
- Tool count scaling: adding more tools is linear in tokens. APAP has
  6 tools today; if it grows to 20 (per the auto-tooling W7 work), the
  per-request overhead climbs to ~3000-3500 tokens.
- This is precisely the "context window discipline" point Niall raised
  on May 20. Function-calling without auto-tooling hits the same ceiling
  as MCP without scoped reads.

## Auth model

| | MCP server | OpenAI function-calling |
|---|---|---|
| User auth | OAuth2 (Auth0 in POC) | Whatever the host app does |
| API key | Server-to-server token if needed | OpenAI key in env |
| Per-tool scoping | Resource templates with claims | Nothing native, would need wrapping |
| Audience for tool calls | The MCP server's auth boundary | The host application's auth boundary |

Function-calling delegates auth to whoever is calling OpenAI. Useful
when APAP is being accessed through an existing authenticated app; not
useful when APAP is exposed directly to LLM clients.

## Dev experience

What worked well:

- Tool definitions are colocated with their dispatch table. Adding a
  new tool is one entry in `tools.ts` and one case in `dispatch`.
- Errors from APAP propagate cleanly. The tool returns `{error: "..."}`
  and the model handles them in the next turn (observed when a tool
  call returned an empty list, the model said so and stopped instead of
  looping).
- `OPENAI_MODEL` env var lets us swap models for cost/quality
  comparison without code changes.

What was less clean:

- The trigger response in prompt 5 said "the last trigger now reflects
  the new goods value" but did not surface the actual penalty
  computation result. The tool returned the full trigger response JSON
  but the model summarised it weakly. With MCP the host can render the
  raw structured response; here the model is the renderer.
- Tool definitions live in static JSON shapes. Generating these from
  the existing OpenAPI spec would close the loop on the GraphQL-shape
  framing in Issue #185.

## Provisional verdict

Function-calling is meaningfully simpler to set up, especially for
existing app integrations that already speak the OpenAI API. The cost
is the per-request token tax for tool definitions, weak structured
output discipline, and no native auth scoping.

MCP wins for long-lived sessions with rich resources and per-tool
auth claims. Function-calling wins for short, request-scoped tool use
embedded in an LLM-driven workflow.

**APAP arguably wants both:** MCP as the primary surface for native MCP
clients (Claude Desktop, Inspector, custom agents), and a thin
function-calling surface for workflows where the host app does not
speak MCP. Code-generating the function-calling tool definitions from
the OpenAPI spec would mean zero duplicated maintenance burden.

## Open questions for the W3 memo

1. Worth doing the second spike (LangGraph or CrewAI) before deciding?
   Likely yes: agent-framework spike will reveal the orchestration
   needs that neither MCP nor raw function-calling solves natively.
2. Is the auto-tooling work (W7) the right answer to the per-request
   token tax, or do we want a "load tools by capability" mechanism on
   the model side?
3. Does the GraphQL-shape framing change either answer? (Issue #185,
   awaiting Dan's read.)

## Next

- [x] First smoke run
- [x] Capture transcript (`transcripts/smoke-2026-06-10.log`)
- [x] Memo populated with real numbers
- [ ] Confirm with Niall: second alternative (LangGraph likely)
- [ ] W2 second spike
- [ ] Polish memo for W3 deadline
