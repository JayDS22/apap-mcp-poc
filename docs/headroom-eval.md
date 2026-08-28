# Headroom evaluation: methodology

**Status (2026-06-24):** plan circulated, run not yet executed. Numbers land after the W4 run.
**Owner:** Jay Guwalani | with Tejas Chopra (Headroom) and Niall Roche (mentor).

[Headroom](https://github.com/chopratejas/headroom) is a local context-compression proxy for MCP tool outputs (Apache 2.0). Question: **for APAP's Concerto-serialized `$class` payloads, does it reduce input tokens without unacceptable fidelity loss or latency?**

## What we measure

| Metric | Threshold to recommend |
|---|---|
| Input-token reduction on `getAgreement` / `convertAgreement` | >= 50% |
| Answer fidelity vs typed-context arm | within 2 pp |
| Added p50 latency | < 200 ms |
| Expand-call rate (model asks for uncompressed) | < 30% |
| Net cost delta (tokens saved minus proxy overhead) | positive |

Reject if fidelity drops > 5 pp, expand-rate > 30%, or token reduction < 20%.

## How

Reuse `bench/concerto-context/` with a third arm: `baseline` / `typed-context` / `typed-context+headroom`. Wire Headroom as MCP-server-side proxy (`headroom serve --upstream http://localhost:9000/mcp`); no APAP code changes. Same 10-query set, `BENCH_RUNS=5`, both providers.

## Cost

~6-8h work, ~$5-10 in API spend (covered by the GSoC credit grant).

## Open questions before the run

1. Is there a hosted Headroom tier, or self-host only? Pricing?
2. Does the default compression strategy preserve `$class` discriminators on round-trip?
3. Are expand calls counted against the MCP per-session tool-call budget?
4. APAP-only, or build the harness reusable for other Accord Project MCP servers?

## Checklist

- [x] Plan circulated (this doc)
- [ ] Niall confirms methodology + thresholds
- [ ] Tejas answers the four questions above
- [ ] Run complete
- [ ] Report back at next W-sync
