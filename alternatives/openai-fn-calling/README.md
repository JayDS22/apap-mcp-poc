# Alternative: OpenAI function-calling against APAP

Spike for the GSoC 2026 W1-W3 alternatives evaluation. Drives the same
APAP operations the MCP server exposes, but via OpenAI's
function-calling API instead of MCP. Output feeds the W3 decision memo
in `NOTES.md`.

## What's here

```
alternatives/openai-fn-calling/
├── package.json          openai + dotenv + tsx
├── tsconfig.json         strict ESM
├── .env.example          OPENAI_API_KEY, APAP_BASE_URL, OPENAI_MODEL
├── src/
│   ├── apap-client.ts    fetch-based wrapper around APAP REST
│   ├── tools.ts          OpenAI tool defs + dispatch table
│   ├── chat.ts           single-prompt chat loop with tool execution
│   └── smoke.ts          canned multi-prompt smoke run
├── README.md             this file
└── NOTES.md              comparison memo (filled in after running)
```

## Setup

```bash
cd alternatives/openai-fn-calling
npm install
cp .env.example .env
# edit .env, set OPENAI_API_KEY
```

The APAP server has to be running and reachable at `APAP_BASE_URL`. From
the POC repo root:

```bash
docker compose up      # spins up Postgres + the POC server at :9000
```

## Run

Single prompt:

```bash
npm run chat -- "list all templates"
```

Pipe a prompt in:

```bash
echo "trigger agreement 1 with goods value 140" | npm run chat
```

Full canned smoke run (six prompts exercising every tool):

```bash
npm run smoke
```

Or a subset:

```bash
npm run smoke -- 0 4
```

## What the chat loop does

1. Loads `OPENAI_API_KEY` from `.env`.
2. Sends the prompt + tool definitions to `gpt-4o-mini` (or whatever
   `OPENAI_MODEL` is set to).
3. If the model returns tool calls, executes each against the APAP REST
   client and feeds results back into the conversation.
4. Loops up to `MAX_TURNS` (default 8) until the model returns a
   tool-free response.
5. Prints the final assistant message plus a usage summary (turns, tool
   calls, prompt/completion/total tokens). The usage summary is the
   primary input for the comparison memo.

## Tools exposed

Six tools, mirroring the same operations the MCP handler exposes:

| Tool | Wraps |
|---|---|
| `list_templates` | `GET /templates` |
| `get_template` | `GET /templates/{uri}` |
| `list_agreements` | `GET /agreements` |
| `get_agreement` | `GET /agreements/{id}` |
| `convert_agreement` | `GET /agreements/{id}/convert/{format}` |
| `trigger_agreement` | `POST /agreements/{id}/trigger` |

Concerto `$class` wrapping is the caller's responsibility for
`trigger_agreement`, the same way MCP handles it. The tool description
tells the model to discover valid request types via `get_agreement` if
not provided.

## Cost notes

Per the GSoC budget approval ($20/month for OpenAI), gpt-4o-mini at
current pricing means a single canned-prompt run is roughly $0.001 to
$0.005. Full smoke run across six prompts: well under $0.05. The full
$20 lasts for thousands of runs.

## Status

- [x] Scaffolded
- [ ] First successful run against local APAP
- [ ] Smoke transcript captured for the comparison memo
- [ ] Comparison memo (NOTES.md) drafted
- [ ] Comparison memo reviewed with Niall / Dan

## See also

- `NOTES.md` for the comparison memo (in progress)
- `../../src/handlers/mcp.ts` for the MCP-side equivalent in the POC
- `docs/gsoc-2026-roadmap.md` in accordproject/apap PR #190 for the
  surrounding W1-W3 workstream
