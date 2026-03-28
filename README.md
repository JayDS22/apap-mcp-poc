# APAP/MCP Server POC - Service Layer Refactor

> GSoC 2026 POC for [Accord Project](https://accordproject.org) Idea #4: Hardening the APAP/MCP Server

**Jay Guwalani** | Research Scientist, UMD | [GitHub](https://github.com/JayDS22) | jguwalan@umd.edu

Prior APAP work: [#152](https://github.com/accordproject/apap/issues/152), [PR #153](https://github.com/accordproject/apap/pull/153), [PR #154](https://github.com/accordproject/apap/pull/154), [PR #155](https://github.com/accordproject/apap/pull/155), [#143 comment](https://github.com/accordproject/apap/issues/143)

---

## What this is

The APAP RI has a weird architectural quirk: every MCP tool call goes through `makeApiRequest()`, which fires off an HTTP `fetch()` to `localhost:9000` -- the same Express server running in the same process. So when Claude calls `getAgreement`, the request travels through the full network stack, JSON serialization, Express routing, and auth middleware just to hit a database that's right there in memory.

```
Current flow:  MCP Tool -> fetch('http://localhost:9000/...') -> Express -> route handler -> Drizzle -> Postgres
This POC:      MCP Tool -> agreementService.getById(db, id) -> Drizzle -> Postgres
```

On top of that, every error path throws generic strings (`throw new Error('Failed to load template')`) so there's no way to tell a 404 from a 500 on the client side.

This POC rips out the HTTP loop and replaces it with a shared service layer. Both MCP tools and REST routes call the same functions. Errors are typed. Tests exist.

## Quick start

```bash
git clone https://github.com/JayDS22/apap-mcp-poc.git
cd apap-mcp-poc

# Option A: Docker (just works)
docker compose up

# Option B: Local (needs Postgres running)
cp .env_example .env    # edit credentials if yours differ
npm install
npx drizzle-kit push
npm run dev
```

Server comes up on `http://localhost:9000`. Hit `/healthz` to verify.

## Try it out

Seed some data and poke at it:

```bash
# create a template
curl -s -X POST http://localhost:9000/templates \
  -H 'Content-Type: application/json' \
  -d '{
    "uri": "resource:org.accordproject.protocol@1.0.0.Template#latedelivery",
    "author": "dan",
    "displayName": "Late Delivery and Penalty",
    "version": "1.0.0",
    "description": "Penalties for late delivery of goods",
    "license": "Apache-2.0",
    "keywords": ["late", "delivery", "penalty"],
    "metadata": {"$class": "org.accordproject.protocol@1.0.0.TemplateMetadata", "runtime": "typescript", "template": "clause", "cicero": "0.25.x"},
    "templateModel": {"$class": "org.accordproject.protocol@1.0.0.TemplateModel", "typeName": "LatePenaltyClause", "model": {"ctoFiles": []}},
    "text": {"templateMark": "Late Delivery and Penalty clause text..."}
  }'

# create an agreement against that template
curl -s -X POST http://localhost:9000/agreements \
  -H 'Content-Type: application/json' \
  -d '{
    "uri": "apap://agreement-demo1",
    "data": {"$class": "io.clause.latedeliveryandpenalty@0.1.0.TemplateModel", "forceMajeure": false, "penaltyPercentage": 10.5, "capPercentage": 55, "clauseId": "demo-1"},
    "template": "resource:org.accordproject.protocol@1.0.0.Template#latedelivery",
    "agreementStatus": "DRAFT"
  }'

# convert to markdown
curl http://localhost:9000/agreements/1/convert/markdown

# convert to HTML and open it
curl http://localhost:9000/agreements/1/convert/html -o /tmp/agreement.html
open /tmp/agreement.html

# trigger agreement logic
curl -s -X POST http://localhost:9000/agreements/1/trigger \
  -H 'Content-Type: application/json' \
  -d '{"$class": "io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenaltyRequest", "forceMajeure": false, "goodsValue": 1000}'

# hit a nonexistent agreement -- typed error, not a generic 500
curl http://localhost:9000/agreements/9999
# -> {"error":{"code":"AGREEMENT_NOT_FOUND","message":"Agreement not found: 9999","details":{"identifier":9999}}}
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Open `http://127.0.0.1:6274`, pick SSE transport, point it at `http://localhost:9000/sse`. You'll see 4 tools and 2 resources, same as the upstream RI.

## Project structure

```
src/
  config.ts              # zod-validated env, fails fast on boot
  index.ts               # wires express + mcp + services together

  db/
    schema.ts            # drizzle schema, mirrors the RI exactly
    client.ts            # pg pool factory, injectable for tests

  services/
    errors.ts            # typed error classes (not generic strings)
    templateService.ts   # template CRUD, direct drizzle calls
    agreementService.ts  # agreement CRUD + convert + trigger
    index.ts             # barrel

  handlers/
    mcp.ts               # MCP tools + resources (SSE + StreamableHTTP)

  routes/
    api.ts               # REST endpoints, same service layer

  middleware/
    logging.ts           # pino, structured json, request-id correlation
    healthz.ts           # readiness probe for docker/k8s
```

The important bit: `services/` has zero imports from Express or the MCP SDK. It doesn't know or care who's calling it. The handlers and routes are thin wrappers that translate between their respective protocols and the service layer.

## How the service layer works

Every function takes a `db` handle as the first argument. That's the whole dependency injection story -- no containers, no decorators, just a function parameter. Tests pass a mock, production passes the real pool.

```typescript
// this is what getAgreement looks like now. no fetch(), no makeApiRequest().
export async function getAgreementById(db: Database, id: number): Promise<AgreementRow> {
  const rows = await db.select().from(Agreement).where(eq(Agreement.id, id)).limit(1);
  if (rows.length === 0) {
    throw new AgreementNotFoundError(id);  // not throw new Error('Failed to load agreement')
  }
  return rows[0];
}
```

The MCP handler and the REST route both call this same function. Fix a bug here, it's fixed everywhere. Add pagination, both consumers get it.

### Error types

Instead of `throw new Error('Failed to load template')` everywhere, errors carry context:

| Error | Status | When |
|---|---|---|
| `TemplateNotFoundError` | 404 | ID/URI doesn't match any row |
| `AgreementNotFoundError` | 404 | same |
| `AgreementConversionError` | 500 | template engine blew up during render |
| `InvalidPayloadError` | 400 | trigger payload isn't valid JSON or isn't an object |
| `TemplateDuplicateError` | 409 | URI unique constraint violation |
| `ValidationError` | 422 | general schema validation failure |

The MCP handler catches these and returns structured MCP errors. The REST router maps them to the right HTTP status code. Anything that isn't a `ServiceError` gets logged with full stack trace server-side, and the client gets a generic "something went wrong" -- no leaking internals.

## Tests

```bash
npm test          # all 53 tests + coverage
npm run test:unit # just unit tests (no db, fast)
```

Coverage on the service layer is at ~99%. Unit tests mock the db parameter directly -- no test database needed, they run in under a second.

Integration tests spin up real Express instances on random ports, exercise the full MCP handshake (initialize -> list tools -> call tool), and verify error propagation end to end through both SSE and StreamableHTTP transports.

## How this maps to the GSoC timeline

This POC covers Phase 1 and the start of Phase 2 from my proposal:

| Weeks | Phase | What's here |
|---|---|---|
| 1-4 | Service layer + errors | `src/services/` -- the core refactor |
| 5-8 | Testing | `__tests__/` -- unit + integration, both transports |
| 9-10 | CI/CD | `.github/workflows/ci.yml` + Docker Compose |

The remaining phases (OpenAPI validation, observability, load testing) build on this foundation.

## Why this architecture

I've done this exact refactor twice in production.

At Bridgestone, the fleet analytics chatbot had 5 LangChain agents all routing through an internal REST gateway to reach the same Postgres. Ripping that out and giving them direct service access cut p95 latency by 40% and made the system unit-testable for the first time in its life.

At Aya Healthcare, the LangGraph talent matching system had the same issue with its specialized agents. Same fix, same results -- typed service layer over Postgres, agents import directly, internal HTTP gone.

The APAP `makeApiRequest` pattern is the same anti-pattern. This POC proves the fix works here too.

## Links

- [APAP repo](https://github.com/accordproject/apap) -- the upstream codebase
- [Accord Project](https://accordproject.org)
- [GSoC 2026 Ideas](https://wiki.hyperledger.org/display/INTERN/Accord+Project+GSoC+2026+Ideas) -- Idea #4
- [MCP spec](https://modelcontextprotocol.io)

## License

Apache-2.0
