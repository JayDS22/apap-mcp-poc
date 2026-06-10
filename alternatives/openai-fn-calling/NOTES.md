# Comparison memo: OpenAI function-calling vs MCP

Working notes for the W3 decision memo. Will be promoted to a clean
memo and shared with Niall and Dan once the spike runs end-to-end.

## Methodology

Both surfaces wrap the same APAP REST operations (six tools). The MCP
side is `apap-mcp-poc/src/handlers/mcp.ts` (~370 lines). The function-
calling side is `src/tools.ts` (~95 lines) plus `src/chat.ts` (~110
lines).

Each canned prompt in `src/smoke.ts` is run against both surfaces with
matching system instructions. Metrics captured per run: turns, tool
calls, prompt + completion + total tokens.

## Surface ergonomics

| | MCP server (`apap-mcp-poc`) | OpenAI function-calling (this spike) |
|---|---|---|
| Lines of code (handler) | ~370 | ~205 |
| Tool registration | `server.registerTool(name, schema, handler)` | Static array of tool definitions |
| Transport machinery | SSE + StreamableHTTP, session lifecycle | None, plain HTTPS to OpenAI |
| Client-side support | Claude Desktop, Inspector, custom MCP clients | Any OpenAI-compatible LLM |
| Tool discovery for the model | Loaded into context once per session | Loaded into context once per request |

## Type system handling

(To be filled after running.)

Notes to capture:
- How OpenAI handles Concerto `$class` discriminators in nested objects.
- Whether `additionalProperties: true` on `trigger_agreement.body` is
  enough, or whether explicit type-name hints in the description help.
- How errors surface back to the model (raw JSON vs structured).

## Context window usage

(To be filled after running.)

Notes to capture:
- Token cost of the tool definitions themselves (per request, not
  per session like MCP).
- Whether the per-request token tax outweighs the simplicity gains
  at higher tool counts.

## Auth model

| | MCP server | OpenAI function-calling |
|---|---|---|
| User auth | OAuth2 (Auth0) | Whatever the host app does |
| API key | Server-to-server token if needed | OpenAI key in env |
| Per-tool scoping | Resource templates with claims | None native, would have to wrap |

## Dev experience

(To be filled after running.)

Notes to capture:
- Iteration loop (edit tool def, rerun) speed.
- Debug visibility (logs are clearer in which direction).
- Error feedback quality from each.

## Provisional verdict (pre-data)

Function-calling is meaningfully simpler to set up: no transport
session, no SDK to learn, no inspector to debug. The cost is that
every request pays the tool-definition token tax, and you lose the
explicit tool-discovery / resource-template surface that MCP offers.

MCP wins for long-lived sessions with rich resources. Function-calling
wins for short, request-scoped tool use embedded in an LLM-driven
workflow. APAP arguably wants both, with MCP as the primary surface
and function-calling as a thin alternative for workflows where the
agent host does not speak MCP.

## Next

1. Run the smoke set and fill the empty sections.
2. Open the W2 second spike (LangGraph or CrewAI per Niall's preference).
3. Promote to a clean memo and share for the W3 deadline.
