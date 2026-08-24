# GSoC 2026 final demo video script

Ten-minute end-to-end walkthrough for the GSoC final work-product submission. Five beats: (1) cold open on the pre-GSoC HTTP loop, (2) live 8-probe run against the POC, (3) three sub-beats on what shipped upstream beyond the proposal, (4) A2A design of record, (5) open questions + close. Companion to `demo-runbook.md` (which carries the per-probe narration for beat 2).

Blog referenced throughout: `docs/blog/final-2026.md`.

---

## Beat 1: the pre-GSoC HTTP loop (0:30)

**Screen:** browser tab or file snippet.

Show the blog `§02` code block or the pre-GSoC `mcp.ts` blame view:

```typescript
const response = await makeApiRequest('http://localhost:9000/templates');
```

**Narration (~30s):**

> "This is the MCP handler for `templates.list` before this GSoC cycle. Same process, same request. Server calling itself over HTTP. That's the seam this project set out to fix."

Cut to Terminal 1.

---

## Beat 2: live 8-probe run on the POC (3:00)

**Screen:** Terminal 1 (iTerm2, 16pt+ font, black background).

Pre-stage commands (run in this order):

```bash
cd ~/Documents/Github_Personal/GSoC-Accord/apap-mcp-poc
docker compose down
docker compose up -d --build       # ~30s to boot
curl -s http://localhost:9000/healthz    # expect {"status":"ok",...}
./demo-runner.sh                         # runs 8 probes with paced output
```

**What each probe demonstrates:**

| # | Probe | Blog claim it backs |
|:---:|:---|:---|
| 1 | Typed-context hint on `initialize.instructions` | `§05` typed context |
| 2 | Resources list (templates, agreements, schema) | `§04` shared context |
| 3 | Concerto schema fetch (7202 bytes) | `§04` `$class` grounding |
| 4 | Typed error (`AGREEMENT_NOT_FOUND` code) | `§03` errors agents can act on |
| 5 | Shared service layer (REST + MCP see same rows) | `§04` core thesis |
| 6 | `subscriptions/listen` returns a `subscriptionId` | `§09` deferred SDK 2.0 native |
| 7 | Service layer purity (0 forbidden imports) | `§04` boundary enforcement |
| 8 | SEP-2549 cache hints (`ttlMs` + `cacheScope`) | `§06` via **#201** |

**Narration:** use the plain-English + technical lines from `demo-runbook.md` per probe. Each probe has both a lay-audience line and a mentor-audience line.

Bottom line must read: **`8/8 probes green - demo ready`**

**Optional Terminal 2** (side by side): `docker compose logs -f apap-mcp-poc-server-1` shows JSON-RPC traffic hitting the server in real time. Visual bonus, not required.

Transition: at `8/8 probes green`, cut to browser.

---

## Beat 3: beyond the proposal (3:30)

Three ~60s sub-beats. Pre-stage 3 browser tabs.

### 3a: MCP SDK 2.0 migration (60s)

**Tab:** `https://github.com/accordproject/apap/pull/227/files`

Scroll the `package.json` split (`@modelcontextprotocol/sdk` -> `@modelcontextprotocol/{core,server,express,node,client}`) and the `.tool()` -> `.registerTool()` diff in `handlers/mcp.ts`.

**Narration:**

> "One atomic PR, one review, one rollback point. Split-package rewrite plus the tool-registration port plus SSE-to-Streamable-HTTP transition in a single diff. Tests stayed green throughout."

### 3b: typed-context A/B eval (60s)

**Tab:** blog `§05` showing Figure 3 (`headroom-eval.png`) + the +20pp / +38pp table beneath.

Alternative tab: `https://github.com/JayDS22/apap-mcp-poc/pull/3` for the harness.

**Narration:**

> "Three-arm bench. Arm 1 baseline is JSON schema only. Arm 2 adds typed context via `InitializeResult.instructions`. Two frontier models, same server, same prompts. Both moved in the same direction. Typed context is not cosmetic."

### 3c: PG18 + RLS smoke (60s)

**Tab:** `https://github.com/accordproject/apap/blob/main/.github/workflows/build.yml`

Scroll to the RLS smoke test block (`set_config('app.user_id', ...)` against a `ROW LEVEL SECURITY` policy).

**Narration:**

> "PG18 landed with a CI-enforced tenant-isolation smoke that walks the RLS boundary end to end. Non-superuser role cannot bypass. Runs on every push."

---

## Beat 4: A2A: a design, not a build (2:00)

**Tab:** `https://github.com/accordproject/apap/issues/247`

Scroll top-level TL;DR -> sidecar figure (Figure 4 in the blog) -> R1/R2 rejection reasoning.

**Narration:**

> "A2A was scoped to a design-of-record deliverable for this cycle, not an implementation slice. The failure modes worth caring about live in the design, not the code."

Point at sidecar diagram:

> "Dedicated `POST /a2a` alongside `POST /mcp` on the same Express process. Shared service layer beneath both. Auth adapter on the A2A route only, MCP and REST stay open by design."

Point at R1/R2:

> "Two alternatives evaluated and rejected. R1 registered A2A skills as MCP tools, which fails the wire spec. R2 multiplexed both protocols on `/mcp`, which neither SDK supports. Sidecar is the choice with reasons, not a menu."

**Optional:** cut to blog `§07` pull-quote block:

> "Auth is table stakes. The harder work sits above the adapter."

---

## Beat 5: what's next + close (1:00)

**Tab:** blog `§09` three open questions block.

Scroll and read:

- MCP tool contract versioning when the protocol schema changes
- Right auth model for a public agent endpoint on a contract protocol
- MCP tool or A2A skill: unresolved for capabilities exposed on both surfaces

**Narration:**

> "These are the questions this GSoC cycle did not resolve. The next contributor who does shapes the pattern the ecosystem picks up."

**Closing shot:** blog header (icons + title).

**Narration:**

> "Blog, repo, and the design of record are all linked. Twelve weeks, contributed to Accord Project, hosted by the Linux Foundation."

Fade.

---

## Pre-recording checklist

- [ ] `docker compose down && docker compose up -d --build` succeeds
- [ ] `curl http://localhost:9000/healthz` returns `{"status":"ok",...}`
- [ ] `./demo-runner.sh` dry-run prints **`8/8 probes green - demo ready`**
- [ ] Optional: seed a few extra templates via `POST /templates` before recording so PROBE 5 shows "3 records = 3 records" instead of "1 = 1"; punchier visual
- [ ] Six browser tabs pre-loaded and pinned in a private window (blocks notifications):
  1. Pre-GSoC `mcp.ts` snippet or blog `§02`
  2. PR **#227** diff (SDK 2.0)
  3. Blog `§05` (A/B eval numbers)
  4. `build.yml` RLS smoke section
  5. Issue **#247** (A2A design of record)
  6. Blog `§09` (open questions)
- [ ] macOS Do Not Disturb ON, Discord + Mail closed
- [ ] Terminal font at least 16pt so text reads at 720p on YouTube
- [ ] Test QuickTime recording for 30 seconds first; verify audio + screen both capture

## After recording

- Trim in iMovie or DaVinci Resolve free
- Aim for 8 to 10 min final length
- Upload to YouTube unlisted first, share URL for review, then flip to public
- Once URL is stable, patch it into:
  - `README.md` at the "Final GSoC demo video (August 2026)" slot
  - `docs/blog/final-2026.md` if you want it embedded in the blog
  - `accordproject/apap` blog PR (**#250**) via a follow-up commit
  - The AP WordPress blog post via a DM to Sanket + Diana

## What this script does NOT try to demo on the POC

Five capabilities require the MCP SDK 2.0 line and are not on the POC main (which stays on SDK 1.x). All five are demoed via browser tabs in Beat 3 instead:

- Split-package imports (`@modelcontextprotocol/{core,server,express,node,client}@2.0.0`)
- `NodeStreamableHTTPServerTransport` natively (POC 1.x still supports SSE alongside)
- `ProtocolError` hierarchy (POC 1.x still uses `McpError`)
- `.registerTool()` API (POC 1.x uses `.tool()`)
- Paged MCP URIs with RFC 6570 form-style expansion (POC 1.x lacks the `ResourceTemplate` variable-substitution shape)

Rationale: POC is the seed that demonstrated the shared-service-layer pattern. Upstream shipped the SDK 2.0 migration atomically as PR **#227**. Beat 2 shows the architecture live on POC; Beat 3a shows the migration diff in the browser. Different beats, different scopes.
