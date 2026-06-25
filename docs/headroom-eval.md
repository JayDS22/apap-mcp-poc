# Headroom evaluation: methodology + status

**Status as of 2026-06-24 (W4 day 2):** plan drafted, run not yet executed. This document is the methodology stub Niall asked for on the Jun 18 sync, with no measurements yet. Numbers land after the W4 run.

**Owner:** Jay Guwalani, with Tejas Chopra (Headroom) and Niall Roche (mentor).

## What we are evaluating

[Headroom](https://github.com/chopratejas/headroom) (Apache 2.0) is a local context-compression layer that runs as a library, a proxy, or an MCP server. It compresses tool outputs, RAG chunks, and conversation history with type-specific strategies (SmartCrusher for JSON, CodeCompressor for AST, Kompress for prose), keeps the originals locally, and lets the model request the uncompressed payload on demand. Public benchmarks on the project claim 60–95% token reduction.

The evaluation question is narrow: **for APAP MCP tool outputs specifically (Concerto-serialized `$class`-tagged JSON), does Headroom reduce input tokens without unacceptable fidelity loss or latency overhead?**

## What we will measure

| Metric | Definition | Why it matters |
|---|---|---|
| Input-token reduction % | input_tokens per turn pre- vs. post-Headroom, per tool | Direct cost / context-pressure signal |
| p50 / p95 added latency | wall-clock added per request from compression + any retrieval round-trip | A compression win that doubles latency may not be a win |
| Answer fidelity | pass-rate on the Concerto A/B query set (same rubric as `bench/concerto-context`) | A compression win that drops fidelity is a loss |
| Reversibility hit-rate | % of turns where the model issues an "expand" call to recover the original | High expand-rate = over-compression |
| Cost delta | input-token $ saved minus Headroom-side compute or hosted-tier cost | Net economic verdict |

## Methodology

Reuse the existing `bench/concerto-context` harness. Add a third arm to the runners (`baseline` / `typed-context` / `typed-context+headroom`) so we control for the Concerto typed-context that already ships in PR accordproject/apap#199.

Wire Headroom as the MCP-server-side proxy: `headroom serve --upstream http://localhost:9000/mcp`. The LLM client points at Headroom; Headroom points at the APAP MCP server. No changes to `src/handlers/mcp.ts` are required.

`bench/concerto-context/runner.ts` and `runner-openai.ts` already capture `usage.input_tokens` and `usage.output_tokens` via the SDK response objects (after the W4 bench-rigor commit `5466b8d`). One new column in `report.ts` for `headroom_compression_ratio` exposed by the proxy's metrics endpoint.

## Dataset

The same fixed 10-query set already in `bench/concerto-context/queries.json`, for apples-to-apples comparability with the typed-context A/B. Two providers (Claude Sonnet 4.6, OpenAI gpt-4o), `BENCH_RUNS=5` per arm per query (same as the bench-rigor default).

## Success criteria

Recommend Headroom for upstream APAP integration if **all** of the following hold:

- Median input-token reduction **>= 50%** on the bulkiest tools (`getAgreement`, `convertAgreement`).
- Answer fidelity stays **within 2 percentage points** of the typed-context arm on the same query set.
- Added **p50 latency < 200 ms** end-to-end.
- Expand-call rate **< 30%** (i.e. model rarely needs to ask for the uncompressed payload).

Recommend against if fidelity drops **> 5 pp**, expand-rate **> 30%**, or token reduction is **< 20%** after accounting for the proxy's own overhead.

## Time estimate

6–8 hours total to execute:

| Step | Time |
|---|---|
| Deploy Headroom locally, smoke test against POC MCP | 1 h |
| Wire third bench arm + metrics column | 2 h |
| Run matrix (2 models × 3 arms × 5 runs × 10 queries) | 2 h wall-clock |
| Writeup + numbers + recommendation | 1–2 h |

Cost: estimated **$5–10** in LLM API spend (Anthropic + OpenAI, paid via the GSoC API-credit grant).

## Open questions for Tejas and Niall

1. **Hosting:** is there a hosted Headroom tier we should test, or self-host only (local proxy)? What is the pricing model if hosted?
2. **Concerto preservation:** which compression strategy fires by default for our `$class`-tagged Concerto JSON (SmartCrusher?), and is the `$class` discriminator preserved on round-trip? If it is stripped, fidelity tanks for free.
3. **Expand-call accounting:** is the reversible-expand call counted against MCP's per-session tool-call budget, or does Headroom hide it from the model?
4. **Scope:** is this eval APAP-only, or should the harness be generic enough that other Accord Project MCP servers can reuse it?

## What this document is **not**

- Not a recommendation yet (no data).
- Not a comparison to other compression tools (CARS, Sumi, etc.) — out of scope unless the W4 numbers surface a reason to broaden.
- Not a blocker for any other GSoC workstream — runs on the side of the W4 proposal-core + RC migration work.

## Status checklist

- [x] Plan circulated (this document)
- [ ] Headroom deployed locally
- [ ] Third bench arm wired
- [ ] Matrix run complete
- [ ] Report back to Niall on the W5 sync (2026-06-26 or 2026-07-03)

## References

- [github.com/chopratejas/headroom](https://github.com/chopratejas/headroom)
- [Stop Feeding Junk Tokens to Your LLM (Tejas Chopra, dev.to)](https://dev.to/tejas_chopra/stop-feeding-junk-tokens-to-your-llm-i-built-a-proxy-to-fix-it-1hg9)
- Existing typed-context A/B harness: `bench/concerto-context/`
- Existing latency comparison harness: `bench/compare.sh` + `bench/probe.mjs`
