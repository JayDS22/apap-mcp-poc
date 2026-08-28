---
title: "Rewiring APAP for Agents: MCP, A2A, and a Shared Service Layer"
subtitle: "GSoC 2026 end-to-end · Accord Project · The Linux Foundation"
author: Jay Guwalani
affiliation: GSoC 2026 contributor · Accord Project · Linux Foundation
project: Idea #4 · APAP and MCP Server
mentors: Niall Roche, Dan Selman
window: June 2 to August 25, 2026 (12 weeks)
---

<p>
  <img src="diagrams/icons/brands/GSoC.png" alt="GSoC 2026" width="90" align="left">
  <img src="diagrams/icons/brands/AccordProject.png" alt="Accord Project" width="220" align="right">
</p>
<br clear="all"><br clear="all">

# Rewiring APAP for Agents: MCP, A2A, and a Shared Service Layer

*Twelve weeks contributing to the Accord Project: 28 upstream PRs to `accordproject/apap`, a shared service layer, an A2A design of record, and a first-pass typed-context evaluation.*

> **TL;DR.** <strong style="color: #1565c0;">28 PRs</strong> into `accordproject/apap` <strong style="color: #2e7d32;">removed the MCP handler's internal HTTP loop</strong>, <strong style="color: #2e7d32;">unified REST + MCP under a shared service layer with typed errors</strong>, <strong style="color: #2e7d32;">migrated the RI to MCP SDK 2.0 in a single reviewable PR</strong>, and ratified a sidecar architecture for A2A as <strong style="color: #ef6c00;">design-of-record</strong>. Typed context lifts frontier-model agent performance by <strong style="color: #2e7d32;">+20pp on Claude Sonnet 4.6</strong> and <strong style="color: #2e7d32;">+38pp on GPT-4o</strong> in a first-pass three-arm A/B (rerun pending).

---

## Contents

- `01`: Why hardening APAP mattered
- `02`: The MCP surface was calling itself over HTTP
- `03`: Errors that agents can act on
- `04`: One source of truth, no localhost round-trip
- `05`: Three surfaces, same six operations
- `06`: MCP SDK 2.0, no flag day
- `07`: A2A: a design, not a build
- `08`: Proposed vs shipped
- `09`: Two things did not ship, on purpose
- `10`: Run it locally in about a minute

*10 sections · ~10 min read*

---

## `01`: Why hardening APAP mattered

Integrating with a legal-contracts platform used to mean hand-writing glue code: read the OpenAPI spec, wire up handlers, map response schemas into your own types, figure out what to do with the vague error strings when things broke. Standard integration work.

More of that integration is now being done by AI agents instead. Tools like Claude, ChatGPT, and Cursor call APIs directly on the developer's behalf, from natural-language prompts. Those APIs were built for humans on the other end, people who could read a confusing error message and decide whether to retry, repair the input, or bail out. An AI agent needs the same three options, but a bare `500` doesn't tell it which one to pick.

### What APAP is

The **Accord Project's Agreement Protocol** (APAP) is an open protocol for the agreement lifecycle: templates, running instances, and the events that drive them. The underlying data model is Concerto, the project's typed data-modeling language for business objects.

| Concept | Example |
|:---|:---|
| **Template** | A reusable NDA, service agreement, or employment contract |
| **Running instance** | An executed NDA between Company A and Contractor B, held as state |
| **Event** | An invoice received, a shipment scanned, a deadline reached, inputs that drive state transitions per the template's clauses |

Its Reference Implementation ships with two ways to talk to it:

- A traditional REST API for human developers
- A newer surface based on MCP. MCP (Model Context Protocol) is an open protocol Anthropic introduced for AI agents to call server-side tools directly.

Through MCP, an agent can browse templates, create agreements, trigger clauses, and inspect the data model.

### The three problems this cycle set out to fix

When *"Hardening the APAP/MCP Server"* was published as **Idea #4** on the 2026 GSoC ideas list, the Reference Implementation had three problems that made it hard for AI agents to work with reliably:

1. **Bare-string errors** the agent couldn't branch on to choose retry, repair, or bail
2. **An internal HTTP loop:** MCP handlers called `fetch('http://localhost:9000/...')` back into the same Express app (a Node.js web framework) they were running in. Middleware ran twice, the payload serialized twice, and MCP errors were translations of REST errors instead of what actually failed.
3. **No automated test coverage** on the MCP surface at all

### Twelve weeks later

28 pull requests merged into `accordproject/apap`, delivering:

- **Shared service layer** with typed errors, ending the internal HTTP loop
- **MCP SDK 2.0 migration** on the Reference Implementation ([#227](https://github.com/accordproject/apap/pull/227))
- **Typed-context evaluation:** task-completion rate rose 20pp on Claude Sonnet 4.6 and 38pp on GPT-4o in a three-condition comparison ([#199](https://github.com/accordproject/apap/pull/199))
- **A2A sidecar architecture** ratified as design of record ([#247](https://github.com/accordproject/apap/issues/247))
- **PG18 support** with a row-level-security smoke test in CI ([#245](https://github.com/accordproject/apap/pull/245))
- **Paged MCP resource URIs** using RFC 6570 URL-template syntax ([#243](https://github.com/accordproject/apap/pull/243))

A2A is the emerging agent-to-agent protocol for cross-server orchestration; more in §07.

---

## `02`: The MCP surface was calling itself over HTTP

To ground that first problem in code, here is what the pre-GSoC MCP handler for `templates.list` actually looked like. Most of it was HTTP request and response marshaling for a call to another route on the same server:

```typescript
// pre-GSoC: handlers/mcp.ts
const response = await makeApiRequest('http://localhost:9000/templates');
```

Same process, same request lifetime, but every MCP call added a full serialization round-trip, ran the routing middleware twice, and duplicated business logic between the handler and the route it was calling.

<figure style="margin: 1.5em 0;">
  <img src="diagrams/InitialArch.png" alt="Figure 1. Initial architecture" style="width: 100%; max-width: 1400px; display: block; margin: 0 auto;">
  <figcaption style="font-size: 0.9em; color: #555555; margin-top: 0.5em; text-align: center;">
    <em>Figure 1. Initial architecture. Every MCP tool call is a full HTTP round-trip inside the same Express process: <code>mcp.ts</code> calls <code>makeApiRequest()</code> which fetches <code>localhost:9000/...</code>, hits the router, then runs the handler that was going to run anyway. Two JSON serialisations. Same event loop. No shared types.</em>
  </figcaption>
</figure>

The proposal called out three concrete gaps at submission time:

- The internal HTTP loop in the MCP handlers
- Zero automated tests on the MCP layer
- Missing client documentation for common agent runtimes

This post follows those threads.

---

## `03`: Errors that agents can act on

Back to the first of the three problems: bare-string errors. The pre-GSoC Reference Implementation threw plain `Error("template not found")` strings from handlers, and Express mapped everything to `500`. An agent staring at that response had no way to tell a missing record from a validation failure from a duplicate primary key from a database outage.

The fix was a typed `ServiceError` hierarchy in the shared service layer. Each subclass carries:

- A machine-readable code (`NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`)
- An appropriate HTTP status (`404`, `422`, `409`)
- A structured `details` payload the caller can branch on

```typescript
// BEFORE
throw new Error(`Template ${id} not found`);
// -> HTTP 500, opaque body, agent has to string-match

// AFTER
throw new NotFoundError('template', id);
// -> HTTP 404, { code: 'NOT_FOUND', entity: 'template', id }, agent branches
```

The MCP handler and the REST router each own a small catch block that maps `ServiceError` to a protocol-appropriate response. Anything that is *not* a `ServiceError` is a real 500 and pages someone.

For a contract protocol, this matters beyond developer ergonomics. When the same error codes show up in an audit log, a `TEMPLATE_NOT_FOUND` on an agreement instantiation, an `AGREEMENT_CONVERSION_FAILED` on a state transition, and a `VALIDATION_FAILED` on a Concerto-typed payload are all distinguishable events. A dispute-resolution process can read them. Opaque 500s cannot be read that way.

---

## `04`: One source of truth, no localhost round-trip

The service-layer refactor was the biggest change of the cycle, and it addressed the second of the three problems. Business logic moved out of the HTTP handlers and into `src/services/`, where every function takes the database as its first argument and knows nothing about Express or the MCP SDK.

The rules the refactor enforces:

- Every service takes `db` as its first parameter
- Every service returns typed results and throws `ServiceError` subclasses
- No service file imports from Express or from the MCP SDK
- Both transports call the same functions; a bug fix in a service propagates to both protocols in a single commit

A service function in its post-refactor form:

```typescript
// src/services/templateService.ts
export async function getTemplateById(
  db: Database,
  id: number,
): Promise<TemplateRow> {
  const rows = await db.select().from(Template).where(eq(Template.id, id)).limit(1);
  if (rows.length === 0) throw new TemplateNotFoundError(id);
  return rows[0];
}
```

The MCP tool handler and the REST route both call `getTemplateById(db, id)` directly. Neither speaks HTTP to the other. `TemplateNotFoundError` is a `ServiceError` subclass that carries the code `TEMPLATE_NOT_FOUND`, HTTP status `404`, and a structured `identifier` field in its details. The REST router catches it and returns `404 { error: { code, message, details } }`. The MCP handler catches the same class and emits a JSON-RPC error with the same code and details. The service throws once; each transport shapes its own response.

Successful responses carry the same shared context. Every row round-trips its Concerto `$class` discriminator intact, and MCP resource URIs (`apap://templates/{id}`, `apap://agreements/{id}`) give an agent a stable citation back to the source object. When an agent needs to point at "the template this answer came from," it can do a URI lookup instead of a full-text search.

The change landed as five upstream slices across the middle of the cycle. Each slice ported one entity family (templates, agreements, shared models, capabilities, health), and the final slice removed the last `makeApiRequest` call site. Anyone who tries to add `import express from 'express'` to a service file gets caught in code review.

<figure style="margin: 1.5em 0;">
  <img src="diagrams/TargetArch.png" alt="Figure 2. Target architecture" style="width: 100%; max-width: 1400px; display: block; margin: 0 auto;">
  <figcaption style="font-size: 0.9em; color: #555555; margin-top: 0.5em; text-align: center;">
    <em>Figure 2. Target architecture. Both transports call the same functions. <code>ServiceError</code> is the only thing they interpret differently.</em>
  </figcaption>
</figure>

The safety net that keeps the boundary honest: 53 tests in the POC (44 unit, 9 integration) hit `98.55%` statement, `92.3%` branch, and `100%` function coverage against `src/services/`. Coverage thresholds fail the `vitest` run on regression. Upstream `apap/server` carries 10 jest suites (200 assertions) covering REST handlers, MCP handlers, and the service layer end-to-end.

Once the shared layer existed, REST and MCP stopped needing to know about each other.

---

## `05`: Three surfaces, same six operations

APAP targets three surfaces for the same six template + agreement operations (templates: list, get, upload, deploy; agreements: instantiate, trigger + convert). REST and MCP are live; A2A is design-done with implementation deferred. Different protocols, same domain, outputs equivalent across all three:

| Surface | Discovery | Auth model (v1) | Best fit |
|:---|:---|:---|:---|
| **REST** | OpenAPI at `/openapi.json` | Session / API key | Humans, CI, existing integrations |
| **MCP** | `initialize` handshake | None (auth surface is on A2A) | Any MCP-native client |
| **A2A** *(design)* | `/.well-known/agent-card.json` | HS256 shared-secret JWT | Agent-to-agent orchestration |

A `templates.list` request over REST (`GET /templates`), over MCP (`tools/call` on `templates.list`), or over A2A once the endpoint ships (`POST /a2a` with `skill.templates.list`) each traces back to the same `listTemplates(db)` call. The response envelope differs; the row set does not.

A fair question at this point is whether any of this actually helps the model, or whether it just makes life easier for the server author. To answer it, a typed-context evaluation ran alongside the refactor. Three conditions, two frontier models.

<figure style="margin: 1.5em 0;">
  <img src="diagrams/headroom-eval.png" alt="Figure 3. Three-arm headroom bench" style="width: 100%; max-width: 1400px; display: block; margin: 0 auto;">
  <figcaption style="font-size: 0.9em; color: #555555; margin-top: 0.5em; text-align: center;">
    <em>Figure 3. Three-arm headroom bench. Arm 1 baseline: JSON schema only, <code>$class</code> stripped, no schema instructions. Arm 2 typed-context: same server and prompts, <code>InitializeResult.instructions</code> populated with the Concerto schema. Arm 3 typed-context + headroom compression proxy: measures the marginal headroom lift.</em>
  </figcaption>
</figure>

Arm 2 minus Arm 1 isolates the lift from typed context alone. Arm 3 minus Arm 2 isolates the marginal lift from headroom compression, controlling for typed context. First-pass results on the shared task set:

| Model | Arm 1 (baseline) | Arm 2 (typed context) | Lift |
|:---|---:|---:|---:|
| Claude Sonnet 4.6 | baseline | **+20pp** | typed context alone |
| GPT-4o | baseline | **+38pp** | typed context alone |

Same server, same prompts, same evaluation rubric. Both models moved in the same direction and by more than the noise floor of the first-pass run. A statistically defensible rerun with confidence intervals and pre-registered arms is in progress. The honest reading of these first-pass numbers is that typed context helps, and helps more for the model with a weaker prior over the domain. The harness and rerun methodology live at [`JayDS22/apap-mcp-poc#3`](https://github.com/JayDS22/apap-mcp-poc/pull/3); [#199](https://github.com/accordproject/apap/pull/199) tracks the upstream version.

The takeaway matters for the rest of the cycle: typed errors and typed context are not cosmetic. They change agent behaviour in measurable ways, and the size of the change depends on the model.

---

## `06`: MCP SDK 2.0, no flag day

The MCP SDK cut its 2.0 line during this cycle. It is a split-package rewrite, not a semver bump. Packages moved to `@modelcontextprotocol/{core,server,express,node,client}`. SSE was dropped in favour of `NodeStreamableHTTPServerTransport`. `McpError` became a `ProtocolError` hierarchy. Tool registration moved from `.tool()` to `.registerTool()`.

Migration landed as [#227](https://github.com/accordproject/apap/pull/227): the full package swap, tool-registration port, and SSE-to-Streamable-HTTP transition in one reviewable PR. One review, one rollback point. Tests stayed green throughout.

Not everything was clean. #227 shipped with a stray `undefined@0.1.0` in `server/package.json` (a junk package from a bad `npm install`) and a coverage-config regression that Niall caught after merge. [#231](https://github.com/accordproject/apap/pull/231) was the follow-up that fixed both, and [#245](https://github.com/accordproject/apap/pull/245) later restored the same dep pins after a subsequent rebase silently dropped them. Ideally both would have been caught before merge; when they aren't, the fix belongs in a cleanup PR the same week rather than being deferred.

For integrators: any MCP client on the pre-2.0 line needs to update its import paths (`@modelcontextprotocol/sdk` to `@modelcontextprotocol/{core,server,express,node,client}`), swap `.tool()` for `.registerTool()`, and replace `McpError` handling with the new `ProtocolError` hierarchy. SSE clients need to move to Streamable HTTP.

Paged resource URIs followed in [#243](https://github.com/accordproject/apap/pull/243) using RFC 6570 form-style expansion (`apap://templates{?limit,offset}` and `apap://agreements{?limit,offset}`). Bare URIs stay registered statically for backwards compatibility, defaulting to page 1. Stable `orderBy(asc(id))` on the un-paged variants prevents row repetition between pages.

Alongside the SDK migration:

- **SEP-2549 cache hints** shipped via [#201](https://github.com/accordproject/apap/pull/201)
- **PG18** support landed via [#245](https://github.com/accordproject/apap/pull/245), with a smoke test in `build.yml` that walks a `set_config('app.user_id', ...)` cycle against a `ROW LEVEL SECURITY` policy so a non-superuser role cannot bypass the tenant boundary
- **Exact-pin** on `@modelcontextprotocol/*@2.0.0` matches APAP's existing convention

---

## `07`: A2A: a design, not a build

A2A (the agent-to-agent protocol) was scoped as a design-of-record deliverable for this GSoC cycle, not an implementation slice. By week 11 the reason was clear: the parts of A2A that would either work or break down the line live in the design decisions (auth boundary, discovery semantics, how the new transport composes with the existing MCP one), not in the code. Week 12 went to the design. Sidecar was ratified 2026-08-18 by Dan and Niall. The implementation is a follow-on workstream against [#247](https://github.com/accordproject/apap/issues/247), separate from the GSoC deliverable.

<figure style="margin: 1.5em 0;">
  <img src="diagrams/A2ASidecarArchitecture.png" alt="Figure 4. A2A sidecar architecture" style="width: 100%; max-width: 1400px; display: block; margin: 0 auto;">
  <figcaption style="font-size: 0.9em; color: #555555; margin-top: 0.5em; text-align: center;">
    <em>Figure 4. A2A sidecar architecture. <code>POST /a2a</code> runs alongside <code>POST /mcp</code> on the same Express process. <code>/a2a</code> is auth-gated via the shared <code>AuthAdapter</code>; <code>/mcp</code> and REST stay open by design. All three handlers call the same transport-agnostic service layer. Discovery lives at <code>/.well-known/agent-card.json</code>.</em>
  </figcaption>
</figure>

The chosen shape:

- A dedicated `POST /a2a` endpoint mounted on the same Express app via `jsonRpcHandler` from `@a2a-js/sdk/server/express`
- A shared `AuthAdapter` utility on the `/a2a` route; `/mcp` and REST stay unauthed by design (scoping call ratified with mentors in week 12)
- The same service layer under both `ApapAgentExecutor` and the existing MCP handler
- Discovery served at `/.well-known/agent-card.json`

Two alternative shapes were considered and rejected before the sidecar landed. The reasoning is worth showing because it generalizes to any team weighing "add a new protocol" against "multiplex on an existing one":

- **R1 registered A2A skills as MCP tools inside the existing MCP transport.** Zero new routes, zero new dependencies, one obvious problem: no `POST /a2a` endpoint would exist. Anything hitting the A2A wire spec (agent cards, JSON-RPC method names, discovery semantics) simply cannot succeed against R1. It fails the spec, not just the details.
- **R2 multiplexed A2A and MCP methods on `/mcp` via a custom JSON-RPC dispatch middleware.** Neither SDK ships that glue, so it would have to be written in-house. A single dispatcher failure would take down both protocols at once. That kind of coupling is a bet that Anthropic and the A2A working group will keep their JSON-RPC surfaces compatible with each other forever, and the safer assumption is that they will not.

Sidecar keeps the two protocols independent at the routing layer, at the SDK layer, and at the failure-isolation layer, while still sharing the one thing worth sharing: the service layer underneath. Full analysis at [#247](https://github.com/accordproject/apap/issues/247).

Auth for v1 is a shared-secret JWT (HS256) via a bundled `JwtAdapter` reference. The `AuthAdapter` interface itself stays extensible, so future adapters can add RS256 with JWKS, mTLS, or OIDC without breaking existing consumers.

Auth on its own is only the entry gate. The harder work sits above the adapter: retention policy, jurisdictional data residency, and how PII is handled on agreement payloads. `AuthAdapter` keeps its scope narrow on purpose so integrators can slot that middleware in above `extractUser` without touching the transport at all.

---

## `08`: Proposed vs shipped

<figure style="margin: 1.5em 0;">
  <img src="diagrams/CombinedRoadmap.png" alt="Figure 5. Roadmap: proposal vs shipped" style="width: 100%; max-width: 1400px; display: block; margin: 0 auto;">
  <figcaption style="font-size: 0.9em; color: #555555; margin-top: 0.5em; text-align: center;">
    <em>Figure 5. Roadmap: proposal vs shipped. Top lane (blue) shows the five phases scoped in the May 2026 proposal. Bottom lanes show what actually ran: green pills shipped as code, amber is design of record only (A2A sidecar), grey is deferred to a post-GSoC follow-up (subscriptions + stateless).</em>
  </figcaption>
</figure>

The proposal on June 2 scoped four deliverables: a shared service layer with structured errors, four-tier testing at 90%+ CI coverage, client-specific tutorials, and Docker Compose + Pino + `/healthz`. By August 25, five additional workstreams had joined that list. The MCP SDK cut its 2.0 line mid-cycle. The Concerto ecosystem bumped through PG18 and cicero-core 2.x. The A2A wire spec matured enough to warrant a design of record. And the typed-context evaluation grew out of the question "does any of this actually help the model." The cycle absorbed all of them.

| Workstream | In proposal? | Final state |
|:---|:---|:---|
| Service layer + typed errors | Yes | <strong style="color: #2e7d32;">Done</strong> |
| Four-tier testing + 90%+ CI coverage | Yes | <strong style="color: #2e7d32;">Done</strong> (E2E tier thinner than proposed, folded into integration) |
| Client tutorials (Claude / ChatGPT / MCP Inspector) | Yes | <strong style="color: #ef6c00;">Partial</strong>, folded into `docs/` + hosted sample |
| Docker Compose + Pino + `/healthz` | Yes | <strong style="color: #2e7d32;">Done</strong> |
| MCP SDK 2.0 migration ([#227](https://github.com/accordproject/apap/pull/227)) | No | <strong style="color: #2e7d32;">Done</strong> |
| PG18 support + RLS smoke ([#229](https://github.com/accordproject/apap/pull/229), [#245](https://github.com/accordproject/apap/pull/245)) | No | <strong style="color: #2e7d32;">Done</strong> |
| Paged MCP resource URIs ([#243](https://github.com/accordproject/apap/pull/243)) | No | <strong style="color: #2e7d32;">Done</strong> |
| Typed-context A/B eval ([#199](https://github.com/accordproject/apap/pull/199)) | No | <strong style="color: #2e7d32;">Done</strong> |
| A2A wrapper (sidecar design) | No | <strong style="color: #ef6c00;">Design done</strong>, impl deferred |
| Subscriptions + stateless (SDK 2.0 native) | No | <strong style="color: #546e7a;">Deferred</strong> to [#232](https://github.com/accordproject/apap/issues/232) |

Five workstreams shipped as code, one shipped as design of record, one deferred to a follow-up branch. The one gap worth naming openly is the E2E test tier: it stayed thinner than proposed and folded into integration coverage rather than getting a dedicated harness. The reasoning behind A2A landing as design-only is in §07.

---

## `09`: Two things did not ship, on purpose

**A2A implementation** (route + shared `AuthAdapter` + reference JWT adapter + `ApapAgentExecutor` + discovery card + tests + `docs/auth.md`) was out of scope for the GSoC window by design. Design of record and one open decision (`AUTH_ADAPTER=none` in production: throw or warn) sit at [#247](https://github.com/accordproject/apap/issues/247) as the seed for a follow-on workstream.

**Subscriptions and listen** on the SDK 2.0 native transport is implemented on a follow-up branch and continues post-GSoC. Tracking issue [#232](https://github.com/accordproject/apap/issues/232).

### What continues post-GSoC

Concrete tickets, each claimable in one click:

- **A2A PR 1 implementation** (route + shared `AuthAdapter` + `JwtAdapter` reference + `ApapAgentExecutor` + discovery card + tests + `docs/auth.md`): [#247](https://github.com/accordproject/apap/issues/247), unblocks once the `AUTH_ADAPTER=none` decision lands
- **Subscriptions and `listen`** on the SDK 2.0 native `NodeStreamableHTTPServerTransport`: [#232](https://github.com/accordproject/apap/issues/232), follow-up branch already carries the plumbing
- **Typed-context A/B rerun** with pre-registered arms and confidence intervals: [`JayDS22/apap-mcp-poc#3`](https://github.com/JayDS22/apap-mcp-poc/pull/3), upstream [#199](https://github.com/accordproject/apap/pull/199)
- **Paged MCP resource completeness signal** (`hasMore`, `_meta.nextUri`, or both): [#244](https://github.com/accordproject/apap/issues/244)
- **Resource notification fan-out semantics** on unpaged variants: [#239](https://github.com/accordproject/apap/issues/239)
- **RS256 + JWKS `AuthAdapter`** reference implementation, extending the interface shipped in A2A PR 1

Three open questions for anyone building the next MCP or A2A server:

- **How should an MCP tool contract version when the protocol schema changes?** Concerto lets APAP evolve; MCP tool definitions are pinned by client-side caching once an agent has done `initialize`. No established pattern yet. Seeded at [#244](https://github.com/accordproject/apap/issues/244) and [#239](https://github.com/accordproject/apap/issues/239).
- **What is the right auth model for a public agent endpoint on a contract protocol?** HS256 for v1 A2A is a scoping call, not a recommendation. Whoever writes the first RS256-with-JWKS `AuthAdapter` against APAP shapes the pattern the ecosystem picks up.
- **MCP tool or A2A skill?** For any capability an owner exposes on both surfaces, the question is unresolved. Tentative rule: MCP tools for the agent's own reasoning loop, A2A skills for delegated tasks. Breaks the moment the same capability is both.

---

## `10`: Run it locally in about a minute

The POC boots a full APAP + Postgres stack in one command:

```bash
git clone https://github.com/JayDS22/apap-mcp-poc
cd apap-mcp-poc
docker compose up            # Postgres + server, ~30 seconds
```

Once the server logs `listening on 0.0.0.0:9000`, hit the three surfaces:

```bash
# Health
curl -s http://localhost:9000/healthz

# REST
curl -s http://localhost:9000/templates | jq

# MCP capabilities handshake
curl -s http://localhost:9000/capabilities | jq

# MCP tools (via the modelcontextprotocol inspector)
npx @modelcontextprotocol/inspector
# then in the browser UI: Transport = Streamable HTTP,
#                          URL = http://localhost:9000/mcp
```

The Reference Implementation upstream runs the same way from `accordproject/apap/server`:

```bash
git clone https://github.com/accordproject/apap
cd apap/server
docker compose up
```

A hosted sample lives on Railway; the one-click Deploy button in the repo README stands it up in a fresh Railway workspace in under a minute, no local Docker required.

### An end-to-end example

One agent call, in the shape it actually goes over the wire:

```jsonc
// tools/call
{
  "jsonrpc": "2.0", "id": 1,
  "method": "tools/call",
  "params": { "name": "templates.list", "arguments": { "limit": 10 } }
}

// -> success: resource_link back to the source, agent has a citation
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "content": [{
      "type": "resource_link",
      "uri": "apap://templates/42",
      "name": "mutual-nda@1.3.0",
      "mimeType": "application/vnd.accord-template+json"
    }]
  }
}
```

Chained end-to-end this becomes: natural language input, `templates.list` narrows to a candidate, `templates.get` pulls the Concerto schema, the agent instantiates fields against that schema, `agreements.create` persists and returns an `apap://agreements/{id}` URI for the audit trail. Steven Obiajulu's [OpenAgreements](https://github.com/openagreements) is one real integration built on exactly this shape: natural language, Concerto validation, filled Bonterms Mutual NDA, DocuSign envelope, all inside a single Claude Code conversation.

---

## Thanks

Twelve weeks of review and architectural sparring from Niall Roche and Dan Selman shaped every decision in this post. Niall's push to keep A2A spec-first through weeks 11 and 12 is the reason there is a design worth reviewing rather than a half-built adapter to throw away. Dan's line that the sidecar shape "needed a personal opinion, not a menu" reset [#247](https://github.com/accordproject/apap/issues/247) from an alternatives catalog into a design of record. Sanket Shevkar's verifiable-agreements context shaped the A2A auth boundary.

The work landed alongside active parallel contributions from the broader Accord Project community during the same window: Matt Roberts on the Railway deploy path, LCP discovery, template archive uploads, and the cicero-core 2.x / concerto-core 4.x upgrade chain; Steven Obiajulu on the MCP agreement-creation tool that seeded the workflow example above; Sonia Duma on the Concerto Playground; Rockaxorb13 on external shared-model retrieval and the obligations model.

---

**Links**

- Upstream repository: [`accordproject/apap`](https://github.com/accordproject/apap)
- POC that seeded this work: [`JayDS22/apap-mcp-poc`](https://github.com/JayDS22/apap-mcp-poc)
- Design of record for the A2A wrapper: [issue #247](https://github.com/accordproject/apap/issues/247)

---

<div style="text-align: center; margin: 2.5em 0 1em 0;">
  <img src="diagrams/icons/brands/LinuxFoundation.png" alt="The Linux Foundation" width="150" style="margin-bottom: 0.75em;">
  <p style="color: #555555; font-size: 0.85em; letter-spacing: 0.05em; margin: 0;">
    <strong>ACCORD PROJECT</strong> IS AN OPEN GOVERNANCE PROJECT HOSTED BY <strong>THE LINUX FOUNDATION</strong>
  </p>
  <p style="color: #888888; font-size: 0.8em; margin: 0.4em 0 0 0;">
    <a href="https://accordproject.org" style="color: #888888; text-decoration: none;">accordproject.org</a>
    &nbsp;·&nbsp;
    <a href="https://linuxfoundation.org" style="color: #888888; text-decoration: none;">linuxfoundation.org</a>
  </p>
</div>
