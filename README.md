# APAP/MCP Server POC: Shared Service Layer Refactor

> **GSoC 2026 Proof of Concept for [Accord Project](https://accordproject.org) Idea #4**
> *Hardening the APAP/MCP Server: Testing, Error Handling, and CI/CD*

This repository is a working proof-of-concept that demonstrates the core architectural refactor proposed in my GSoC 2026 proposal. It replaces the internal HTTP loop in the APAP Reference Implementation's MCP handler with a shared service layer that both MCP tools and REST routes call directly.

**Author:** Jay Guwalani | Research Scientist, University of Maryland | [GitHub](https://github.com/JayDS22) | jguwalan@umd.edu

**Prior APAP contributions:** Issue [#152](https://github.com/accordproject/apap/issues/152), PR [#153](https://github.com/accordproject/apap/pull/153), PR [#154](https://github.com/accordproject/apap/pull/154), PR [#155](https://github.com/accordproject/apap/pull/155), Issue [#143](https://github.com/accordproject/apap/issues/143) comment

---

## The Problem

The current APAP Reference Implementation has a design bottleneck in `server/handlers/mcp.ts`. Every MCP tool call goes through a helper function called `makeApiRequest()` that wraps `fetch()` pointed at the same Express server:

```
MCP Tool Call
  -> makeApiRequest()
    -> fetch('http://localhost:9000/agreements/1')
      -> Express router
        -> handler
          -> Drizzle ORM
            -> Postgres
```

This means every MCP tool invocation takes a full HTTP round-trip through the network stack, auth middleware, JSON serialization, and Express routing just to reach the database that's sitting in the same process. Error handling suffers too because `makeApiRequest` throws bare strings like `throw new Error('Failed to load template')` regardless of whether the underlying issue is a 404, a 400, or a 500.

## The Solution

This POC implements the refactor: a shared service layer that both MCP tools and REST routes import directly.

```
MCP Tool Call                    REST API Request
  -> services/agreementService     -> services/agreementService
    -> Drizzle ORM                   -> Drizzle ORM
      -> Postgres                      -> Postgres
```

No internal HTTP loop. No duplicated logic. A bug fix in the service layer automatically fixes both the MCP tools and the REST API. Error handling uses a structured type hierarchy (`ServiceError`, `TemplateNotFoundError`, `AgreementConversionError`, etc.) that MCP handlers map to MCP error responses and REST routes map to the correct HTTP status codes.

## Architecture

```
src/
  config.ts              # Zod-validated env vars (fail-fast at startup)
  index.ts               # Server entry point, wires everything together

  db/
    schema.ts            # Drizzle ORM schema (matches APAP RI exactly)
    client.ts            # Connection factory with DI for testability

  services/
    errors.ts            # ServiceError hierarchy (6 typed error classes)
    templateService.ts   # Template CRUD via Drizzle (replaces makeApiRequest)
    agreementService.ts  # Agreement CRUD + convert + trigger via Drizzle
    index.ts             # Barrel export

  handlers/
    mcp.ts               # MCP handler (SSE + StreamableHTTP, imports services)

  routes/
    api.ts               # REST router (imports same services)

  middleware/
    logging.ts           # Pino structured logging with request-id correlation
    healthz.ts           # /healthz endpoint for Docker/k8s readiness probes
```

### Service Layer Rules

These are the invariants that make the architecture work:

1. Every service function takes a `db` instance as its first parameter (dependency injection)
2. Services return typed results, never raw HTTP responses
3. Services throw structured `ServiceError` subclasses, never generic strings
4. Services do NOT import Express, MCP SDK, or any transport-layer code
5. Service functions map 1:1 with existing MCP tools

### Error Mapping

| Service Error | HTTP Status | MCP Response |
|---|---|---|
| `TemplateNotFoundError` | 404 | `{ isError: true, content: [{type: "text", text: JSON.stringify(error)}] }` |
| `AgreementNotFoundError` | 404 | Same pattern |
| `AgreementConversionError` | 500 | Same pattern |
| `InvalidPayloadError` | 400 | Same pattern |
| `TemplateDuplicateError` | 409 | Same pattern |
| `ValidationError` | 422 | Same pattern |

## Quick Start

### With Docker (recommended)

```bash
git clone https://github.com/JayDS22/apap-mcp-poc.git
cd apap-mcp-poc
docker compose up
```

That's it. Docker pulls Postgres and Node.js, pushes the DB schema automatically, and starts the server. You'll see output like:

```
server  | APAP MCP POC server listening on http://0.0.0.0:9000
server  |   REST API:        http://0.0.0.0:9000/capabilities
server  |   MCP SSE:         http://0.0.0.0:9000/sse
server  |   MCP Streamable:  POST http://0.0.0.0:9000/mcp
server  |   Health:          http://0.0.0.0:9000/healthz
```

### Without Docker

```bash
# Make sure you have Postgres running locally
cp .env_example .env
# Edit .env with your Postgres credentials

npm install
npx drizzle-kit push
npm run dev
```

### Connect MCP Inspector

Once the server is running, open [MCP Inspector](https://inspector.mcp.run/) and connect to:
- **SSE:** `http://localhost:9000/sse`
- **StreamableHTTP:** `http://localhost:9000/mcp`

You should see the four registered tools: `getTemplate`, `getAgreement`, `convert-agreement-to-format`, and `trigger-agreement`.

## Running Tests

```bash
# Unit tests (mocked DB, no Postgres needed)
npm run test:unit

# Integration tests (uses a mock DB with real Express)
npm run test:integration

# All tests with coverage report
npm test
```

For integration tests against a real Postgres:

```bash
docker compose -f docker-compose.test.yml up -d
npm run test:integration
docker compose -f docker-compose.test.yml down
```

### Coverage Targets

| Layer | Target | What's measured |
|---|---|---|
| `src/services/` | 90% statements | Every service function + every error path |
| `src/handlers/` | 85% statements | MCP tool registrations, transport setup, error mapping |

## How This Maps to the GSoC Proposal

This POC implements **Phase 1** and the start of **Phase 2** from the proposed 12-week GSoC timeline:

| Week | Proposal Phase | What This POC Delivers |
|---|---|---|
| 1-2 | Phase 1: Service Layer | `src/services/` with full CRUD + convert + trigger |
| 3-4 | Phase 1: Error Handling | `src/services/errors.ts` with 6 typed error classes |
| 5-6 | Phase 2: Unit Tests | `__tests__/unit/` with mocked DB tests |
| 7-8 | Phase 2: Integration Tests | `__tests__/integration/` with SSE + StreamableHTTP |
| 9-10 | Phase 3: CI/CD | `.github/workflows/ci.yml` + Docker Compose |

The remaining GSoC phases (OpenAPI spec validation, observability, load testing) build on top of this foundation.

## Why This Architecture

I've built this exact pattern twice in production:

**At Bridgestone (2022-2024):** The enterprise AI chatbot had the same problem. Five specialized agents (analytics, trip data, driver safety, fleet performance, crash analysis) were all routing through an internal REST gateway. We refactored to a shared service layer and cut response times by 40% while making the system testable for the first time.

**At Aya Healthcare (2025):** The LangGraph-based talent matching system used 5+ agents that needed to share database access. Instead of each agent maintaining its own HTTP client, we built a typed service layer over Postgres (via SQLAlchemy/Drizzle equivalent) that all agents imported directly. Same pattern, same benefits.

## Links

- [APAP Repository](https://github.com/accordproject/apap) (the upstream codebase this POC refactors)
- [Accord Project](https://accordproject.org)
- [GSoC 2026 Idea #4](https://wiki.hyperledger.org/display/INTERN/Accord+Project+GSoC+2026+Ideas) - Hardening the APAP/MCP Server
- [MCP Protocol Spec](https://modelcontextprotocol.io)

## License

Apache-2.0, consistent with the Accord Project ecosystem.
