# Concerto-context A/B harness

Empirically tests whether telling the LLM "responses are Concerto-serialized
objects" measurably improves its behavior on a fixed query set, per the
discussion on [accordproject/apap#185](https://github.com/accordproject/apap/issues/185).

Two variants of the same prompt are sent to Claude:

- **control** — only the MCP tool definitions, no system prompt
- **treatment** — same tools, plus the server's `InitializeResult.instructions`
  string and the contents of `apap://schema/protocol.cto` injected as a system
  prompt

Both variants connect to the **same** running MCP server (the one with PR #2's
changes already in place). The A/B happens at the prompt-construction layer
inside the harness, not by spinning two server processes. This mirrors what a
real MCP host does: read the server's instructions, fetch advertised schema
resources, pass them through to the model.

## What it measures

Per query, the harness records:

- Tool calls the model made (in order)
- The model's final text answer
- A scalar score in `[0, 1]` from a rubric of expected tool names + expected
  keywords in the final text

Aggregate: mean score per variant, plus per-query deltas. The interesting
signal is **whether the treatment beats control on the schema-knowledge queries
where the Concerto context should help most**.

## What it does not measure

- Production latency. (See `bench/probe.mjs` for the latency benchmark; that
  one is a different methodology.)
- Multi-turn conversation quality. Each query is one user turn that may
  include tool-use rounds before the model emits final text.
- Cross-provider behavior. First pass is Claude only. Adding GPT or others is
  a straightforward extension; the harness already isolates the model call.

## How to run

```bash
# 1. Start the MCP server (with PR #2's changes on the branch)
docker compose up                       # from the repo root

# 2. In another shell, export your Anthropic key
export ANTHROPIC_API_KEY=sk-ant-...

# 3. Run the harness
npx tsx bench/concerto-context/runner.ts

# 4. Build the markdown report from the JSON output
npx tsx bench/concerto-context/report.ts \
  bench/concerto-context/results-*.json \
  > bench/concerto-context/results.md
```

Environment variables:

| Var                 | Default                  | Purpose                                  |
| ------------------- | ------------------------ | ---------------------------------------- |
| `ANTHROPIC_API_KEY` | (required)               | Auth for the Anthropic SDK               |
| `MCP_BASE_URL`      | `http://localhost:9000`  | Where to reach the running MCP server    |
| `BENCH_MODEL`       | `claude-sonnet-4-6`      | Anthropic model id                       |
| `BENCH_QUERIES`     | `./queries.json`         | Path to the query set (relative to runner)|

## Scoring rubric

Each query in `queries.json` carries an `expected` block:

```json
{
  "id": "schema-q1",
  "prompt": "What `$class` discriminator identifies a Template?",
  "expected": {
    "toolCalls": [],
    "keywords": ["org.accordproject.protocol", "Template"]
  }
}
```

Scoring is binary per expectation: each expected tool name found in the
recorded `toolCalls` scores 1, each expected keyword found (case-insensitive)
in the final text scores 1. The query's score is `hits / total_expectations`.

Keyword matching is deliberately simple. The point is to detect whether the
model can talk about Concerto types fluently when given the context, not to
grade prose quality.

## Reproducibility notes

- Each run includes a timestamped JSON file with raw results (tool calls,
  final text, score) so re-running and diffing is straightforward.
- The harness uses `temperature: 0` to reduce per-run variance. Some variance
  remains; rerun a few times if a query result looks borderline.
- The schema text and instructions are pulled live from the server on each
  run via the MCP client SDK (`Client.readResource()` and
  `Client.getInstructions()`). If those change in the server, the bench
  picks up the new values automatically.
