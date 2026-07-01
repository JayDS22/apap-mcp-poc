# Mid-eval demo walkthrough

**Accord Project | GSoC 2026 Idea #4 | Hardening the APAP / MCP Server**

Contributor: Jay Guwalani | Mentors: Niall Roche, Dan Selman | Org: Sanket Shevkar

---

## How to use this doc

This is the narrative deck for the mid-eval demo. Read it top to bottom on the call while screen-sharing. Each section maps to a beat:

1. Frame the project (30 seconds)
2. Show the problem (current architecture diagram)
3. Show the fix (target architecture diagram)
4. Recap the first 4 weeks
5. Live demo of the running POC (see `demo-runbook.md`)
6. Roadmap and what is next (roadmap diagram)
7. Q&A

The four diagrams live in `demo-diagrams/`. Open each `.drawio.xml` file at [app.diagrams.net](https://app.diagrams.net) (drag and drop the file onto the browser) and export to PNG before the call so they screen-share cleanly.

- `architecture-current.drawio.xml` - the problem
- `architecture-target.drawio.xml` - the fix
- `alternatives-compared.drawio.xml` - three routes evaluated, MCP chosen
- `roadmap.drawio.xml` - 12-week timeline with today marked

---

## 1. What this project is

APAP is Accord's Agreement Protocol. The RI (Reference Implementation) is a server that speaks it. AI clients and LLMs talk to that server through MCP, the Model Context Protocol.

My GSoC work is on hardening how those AI clients talk to the server. Concretely: the internal architecture, the error contract, and the way the server tells clients what its types actually are.

> Think of it this way. The server has a lot of typed knowledge about agreements and templates. Today, an AI on the other end sees a lot of that as opaque JSON blobs and mystery error strings. The work is to give the AI a structured contract so it can act on what it gets back, not just parrot it.

---

## 2. The problem: current architecture

**Open `demo-diagrams/architecture-current.drawio.xml` (or its exported PNG) and screen-share.**

The upstream RI has an MCP handler that calls the same server's REST API over `http://localhost:9000` to reach code sitting in the same process. That is a full network round-trip inside one server.

Two consequences:

- Hidden coupling. If the REST route changes, MCP breaks. Every MCP tool call re-serializes through Express.
- Error handling is bare strings. `throw new Error('Failed to load template')`. An MCP client gets an opaque SDK-wrapped string, no code, no structure.

RFC issue [#143](https://github.com/accordproject/apap/issues/143) captured this. Thomas Sedhom opened it in March, and the direction converged on a shared service layer.

---

## 3. The fix: shared service layer

**Open `demo-diagrams/architecture-target.drawio.xml` (or its exported PNG) and screen-share.**

Same server, restructured. Business logic lives in `services/`. Both the MCP handler and the REST router call those services directly, no HTTP loop.

Three concrete changes that make this real:

1. **Typed error contract.** `ServiceError` base with six typed subclasses (`AgreementNotFoundError`, `TemplateNotFoundError`, `AgreementConversionError`, and so on). Each carries `code`, `message`, `details`. Both surfaces map it to their protocol shape.
2. **Concerto typed-context.** The server tells the MCP client on connect: my responses are Concerto-serialized, here is the schema. The client (and any LLM behind it) can now resolve `$class` discriminators without guessing.
3. **Services are transport-agnostic.** They take `db` as a parameter, return typed results, throw typed errors, and import nothing from Express or the MCP SDK. Bug fixes propagate to both protocols automatically.

The POC (`apap-mcp-poc`) is where the whole shape is running end-to-end. The upstream RI is being brought to parity through three incremental PRs.

---

## 3b. Alternatives compared before picking MCP

**Open `demo-diagrams/alternatives-compared.drawio.xml` (or its exported PNG) and screen-share.**

MCP wasn't the default choice, it was the outcome of a structured evaluation across three routes:

- **Route A: MCP (Anthropic protocol).** Vendor-neutral, typed resources, structured errors on the wire, cross-vendor via spec. Landing incrementally through PRs #184, #196, #199, #200, #201.
- **Route B: OpenAI function-calling.** Ran a real working spike on the POC (`alternatives/openai-fn-calling` branch, 6 tools, 6-prompt smoke run, 10,436 tokens). Stable and mature, but vendor-locked and no capability discovery.
- **Route C: LangGraph / CrewAI.** Not a substitute for a tool protocol; they orchestrate agents on top of one. Catalogued for the W9 agents-calling-agents demo.

Decision memo shipped as [POC PR #1](https://github.com/JayDS22/apap-mcp-poc/pull/1) (merged Jun 14). MCP chosen as the primary integration layer; the OpenAI spike stays on the branch as a working reference. LangGraph / CrewAI slot in on top of an MCP tool source rather than replacing it.

---

## 4. What shipped in the first 4 weeks

Grouped by workstream. Concrete PR references, not summaries.

### Proposal Core (workstream 1)

| Ref | State | What |
|---|---|---|
| [PR #184](https://github.com/accordproject/apap/pull/184) | Merged Jun 14 | Typed `ServiceError` hierarchy + agreements handler wired |
| [PR #196](https://github.com/accordproject/apap/pull/196) | **Merged Jul 1** | Contract tests for `buildApiErrorMessage` |
| [PR #200](https://github.com/accordproject/apap/pull/200) | Open, rebased Jul 1, CI green | Slice-3, migrates the eight `throw new Error` sites in `handlers/mcp.ts` |
| [PR #199](https://github.com/accordproject/apap/pull/199) | Open, rebased Jul 1, CI green | Concerto typed-context hint + `apap://schema/protocol.cto` resource |
| [PR #201](https://github.com/accordproject/apap/pull/201) | Open, rebased Jul 1, CI green | ttlMs + cacheScope on ReadResource contents (SEP-2549) |
| [PR #202](https://github.com/accordproject/apap/pull/202) | Open | CLAUDE.md doc follow-up split out of #199 |

### Alternatives Evaluation (workstream 4)

| Ref | What |
|---|---|
| [POC PR #1](https://github.com/JayDS22/apap-mcp-poc/pull/1) | Alternatives decision memo (OpenAI function-calling, LangGraph, CrewAI compared) |
| [POC PR #3](https://github.com/JayDS22/apap-mcp-poc/pull/3) | A/B bench harness for Concerto typed-context, multi-run + paired variance |

### Ops (workstream 5)

| Ref | State | What |
|---|---|---|
| [PR #190](https://github.com/accordproject/apap/pull/190) | Merged Jun 13 | GSoC 2026 roadmap doc (this is the shared source of truth mentors + maintainers can PR against) |
| [PR #198](https://github.com/accordproject/apap/pull/198) | Open | W3+W4 roadmap refresh (MCP RC migration sliced into per-week PRs) |

### Hardening bundle

Bug fixes and cleanup that were not the headline work but paid off:

| Ref | What |
|---|---|
| [PR #154](https://github.com/accordproject/apap/pull/154) | Fix template validation ordering (Concerto validation must precede `templateFromDatabase`) |
| [PR #155](https://github.com/accordproject/apap/pull/155) | Fix `Agreement.uri` overwriting the MCP resource URI in `getAgreements` |
| [PR #180](https://github.com/accordproject/apap/pull/180) | 404 on DELETE of non-existent resource + `validateBody` crash fix |
| [PR #181](https://github.com/accordproject/apap/pull/181) | JSDoc documentation pass for handler files |

Also: two typed error subclasses (`UpstreamApiError`, `AgreementTriggerError`) proposed on the #143 RFC and folded into PR #200 with Dan's ack.

---

## 5. Live demo

**Switch to your terminal. Read `demo-runbook.md` alongside this.**

One script, four checks against the running POC.

```bash
/Users/DELL/Documents/Github_Personal/GSoC-Accord/demo-runner.sh
```

- **Probe 1:** initialize handshake returns the 357-character Concerto typed-context string
- **Probe 2:** `resources/list` includes `apap://schema/protocol.cto`
- **Probe 3:** `resources/read` returns 7,202 bytes of `text/x-concerto`
- **Probe 4:** `getAgreement 999999` returns the structured `AGREEMENT_NOT_FOUND` payload

Full script cadence + narration blocks are in `demo-runbook.md`. Do not read them off this page.

---

## 6. Roadmap and what is next

**Open `demo-diagrams/roadmap.drawio.xml` (or its exported PNG) and screen-share.**

12 weeks, five parallel workstreams. Today (Jul 1) is early W5. Mid-eval is Jul 14 (W6).

### Currently (W5)

- **#196 merged Jul 1 morning.** Contract tests helper landed after Windows CI unblocked via rebase onto Matt's #195 fix.
- **#200, #199, #201 all rebased on post-#196 main same day, all three CI green** across the Node 20 + 22 matrix on macOS, Ubuntu, and Windows. All three sit `BLOCKED` on `REVIEW_REQUIRED`; one approval pass unblocks the whole chain in Niall's stated order.
- POC PR #2 for Concerto typed-context was updated Jul 1 with tighter test coverage on the wiring.
- W4 slice of the MCP 2026-07-28 RC starting on POC (`server/discover` + `Mcp-Method` / `Mcp-Name` headers).
- Headroom evaluation methodology stub (POC PR #5) waiting on Niall's ack + Tejas confirming the four open questions before the run kicks off.

### W6 and W7 (mid-eval week)

- Rigorous rerun of the Concerto typed-context A/B with the multi-run harness from POC PR #3
- Mid-eval delivery on Jul 14
- Docs pass: Claude tutorial, `ttlMs` / `cacheScope` / W3C `traceparent` on ReadResource

### W8 and W9

- ChatGPT + MCP Inspector tutorials
- Auto-tooling integration tests
- Agents-Calling-Agents joint demo with Niall (APAP as a service that agents consume, not APAP as an agent itself)

### W10 through W12

- Migration guide for the MCP 2026-07-28 RC
- Blog draft: alternatives evaluation + agents-with-Accord
- E2E in GH Actions, multi-version transport tests
- Final docs review, blog published, handoff prep

---

## 7. What is not shipped yet, in the open

Three things worth naming explicitly so mentors do not have to ask:

1. **RI `crud.ts` typed-error gap.** Plain `GET /agreements/:id` and `GET /templates/:id` still return `{"error":"Not found"}` because they are served by the generic `crud.ts` router. #184's wiring only covers POST/convert/trigger paths. Clean follow-up ticket.
2. **RI compose does not run migrations.** `docker compose up` from `apap/server/` leaves the DB empty and every query fails until `drizzle-kit push` is applied by hand. POC solves this with a `startup.js` hook; same pattern would land on the RI.
3. **First-pass A/B numbers held back from the PR body.** The initial harness was single-run + substring scoring, not statistically defensible on its own. Qualitative findings are the load-bearing evidence for #199 until the W6 rerun publishes.

---

## 8. Reference material

- **Roadmap doc (shared, PR-able):** `apap/docs/gsoc-2026-roadmap.md`
- **Weekly progress reports:** `weekly-sync/GSoC_2026_W1..W4_Progress_Report.docx`
- **RFC issue driving the direction:** [accordproject/apap#143](https://github.com/accordproject/apap/issues/143)
- **POC repo:** [github.com/JayDS22/apap-mcp-poc](https://github.com/JayDS22/apap-mcp-poc)
- **Demo assets in this workspace:**
  - `demo-runner.sh` (four-probe bash script)
  - `demo-runbook.md` (talk-track + commands for the live demo)
  - `mid-eval-demo-notes.md` (prep notes + captured wire outputs for fallback)
  - `demo-diagrams/` (three draw.io diagrams: current, target, roadmap)

---

## 9. Asks for the call

Keep to two. Anything more waters them down.

1. **Approval + merge on #200, #199, #201.** Chain is already rebased on post-#196 main, all three CI green as of Jul 1, sitting on `REVIEW_REQUIRED` only. Approvals in the stated order (#200 -> #199 -> #201) close the mcp.test.ts conflict story upstream.
2. **Direction check on the MCP 2026-07-28 RC transport strategy.** Roadmap default is "parallel from W4" behind an env var. Confirm or change before W5 build hardens.

---

## Presenter notes (not spoken on the call)

- Total budget is 10 minutes. Aim for 8 minutes of content, 2 minutes buffer.
- If the demo script goes red, do not panic. `mid-eval-demo-notes.md` has the wire outputs captured verbatim. Screenshare that instead and keep moving.
- The diagrams are the visual spine. Screen-share each one for 30 to 60 seconds max. Do not narrate every box; point at the two or three that matter.
- Skip the hardening bundle table if time runs short. It is nice-to-have, not the headline.
- Close on the two asks. Do not close on a "questions?" without a specific ask, or the room defaults to silence.
