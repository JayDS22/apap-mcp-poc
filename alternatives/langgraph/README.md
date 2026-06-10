# Alternative: LangGraph against APAP

Second spike for the GSoC 2026 W1-W3 alternatives evaluation. Drives the
same six APAP operations as the OpenAI fn-calling spike, but through a
LangGraph ReAct-style StateGraph instead of a hand-rolled chat loop.
Feeds the W3 decision memo alongside the fn-calling NOTES.md.

Compare to the first spike at `../openai-fn-calling/`.

## What's here

```
alternatives/langgraph/
├── package.json          @langchain/langgraph + @langchain/openai + @langchain/core
├── tsconfig.json         strict ESM (same as fn-calling spike)
├── .env.example          OPENAI_API_KEY, APAP_BASE_URL, OPENAI_MODEL
├── src/
│   ├── apap-client.ts    REST wrapper (verbatim copy of fn-calling spike)
│   ├── tools.ts          LangChain tool() defs + Zod schemas
│   ├── agent.ts          StateGraph: agent <-> ToolNode loop
│   ├── chat.ts           single-prompt entry point
│   └── smoke.ts          same six canned prompts as fn-calling spike
├── README.md             this file
└── NOTES.md              comparison memo (filled in after running)
```

## Setup

```bash
cd alternatives/langgraph
npm install
cp .env.example .env
# edit .env, set OPENAI_API_KEY (same key as the fn-calling spike)
```

APAP must be running on `APAP_BASE_URL`. From the POC repo root:

```bash
docker compose up
```

## Run

```bash
# single prompt
npm run chat -- "list all templates"

# full canned smoke run (same six prompts as fn-calling)
npm run smoke

# subset
npm run smoke -- 0 4
```

## Architecture in one paragraph

LangGraph treats the agent loop as a state graph. Two nodes: `agent`
(LLM call with bound tools) and `tools` (prebuilt ToolNode that
executes any tool_calls the LLM returned). Two edges: agent goes to
tools if there were tool calls, else to END; tools always goes back to
agent. The recursion limit caps the loop. State is the message history,
which the framework threads through automatically.

Compare to the fn-calling spike's `chat.ts` which implements the same
loop by hand with an explicit `for` over `MAX_TURNS`. Both end up doing
the same thing; LangGraph wins on (a) graph composability if the flow
gets more complex (multi-agent, conditional branches, retries), and
loses on (b) the dependency footprint and another framework to learn.

## What the comparison memo will cover

Same axes as the fn-calling spike, so they line up side by side:

- Surface ergonomics (LOC, tool def shape)
- Type system support (Zod schemas instead of raw JSON schemas)
- Context window usage (token tax per turn vs per request)
- Auth model (delegated, same as fn-calling)
- Multi-step orchestration (this is where LangGraph should win)
- Dev experience (graph inspection, retry/timeout knobs)
- Agent-calling-agents fit (W9 demo prep)

The agent-calling-agents row is the load-bearing one: that's the W9
GSoC deliverable. If LangGraph makes that pattern materially easier,
this spike justifies its dependency footprint.

## Status

- [x] Scaffolded
- [ ] First successful run against local APAP
- [ ] Smoke transcript captured
- [ ] NOTES.md filled with real numbers
- [ ] Side-by-side comparison block added to fn-calling NOTES.md too

## See also

- `../openai-fn-calling/` for the first alternatives spike
- `../openai-fn-calling/NOTES.md` for the populated comparison data
- `docs/gsoc-2026-roadmap.md` in accordproject/apap PR #190 for the
  surrounding W1-W3 workstream
