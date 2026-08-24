# GSoC 2026 final demo video script

Ten-minute end-to-end walkthrough for the GSoC final work-product submission. Five beats: (1) cold open on the pre-GSoC HTTP loop, (2) live 8-probe run against the POC, (3) three sub-beats on what shipped upstream beyond the proposal, (4) A2A design of record, (5) open questions + close. Companion to `demo-runbook.md` (which carries the per-probe narration for beat 2).

Blog referenced throughout: `docs/blog/final-2026.md`.

---

## Beat 1: intro + the pre-GSoC HTTP loop (0:50)

**Screen 1 (first 20s):** blog header (icons + title) as a static background, with a small face-cam overlay in the bottom-right corner (~25% width). See the Recording setup section below for OBS scene configuration.

**Narration (~20s):**

> "Hi, I'm Jay Guwalani, GSoC 2026 contributor at Accord Project working on Idea #4, Hardening the APAP/MCP Server. This is the end-to-end walkthrough of what shipped over twelve weeks, mentored by Niall Roche and Dan Selman."

**Screen 2 (next 30s):** browser tab or file snippet. **Hide the face-cam overlay now** (click the eye icon on the webcam source in OBS, or switch scenes). Terminal + browser only for the rest of the video.

Show the blog `§02` code block or the pre-GSoC `mcp.ts` blame view:

```typescript
const response = await makeApiRequest('http://localhost:9000/templates');
```

**Narration (~30s):**

> "This is the MCP handler for `templates.list` before this GSoC cycle. Same process, same request. Server calling itself over HTTP. That's the seam this project set out to fix."

Cut to Terminal 1.

---

## Beat 2: live 8-probe run on the POC + test suite (3:20)

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

**Narration per probe** (plain-English line for anyone in the room, technical line for the mentor-audience). Delivered as each probe prints:

### PROBE 1 (typed-context hint)

> Plain: "So the server just told the client, in plain terms, my responses are typed objects and here is where the type definitions live. That is how an AI on the other end knows to treat what it gets back as agreements or templates, not raw JSON blobs."

> Technical: "The instructions string is from PR 199. Every MCP client sees it on the initialize handshake, one time. 357 characters, static, no per-request cost."

### PROBE 2 (resources)

> Plain: "Client just asked what have you got. It gets back templates and agreements, which you would expect. The new thing here is the third entry: the server is offering the AI a copy of its own dictionary."

> Technical: "That new resource is `apap://schema/protocol.cto`, added in 199. Templates and agreements were already there."

### PROBE 3 (Concerto schema)

> Plain: "And the client just fetched that dictionary. About seven thousand characters of the protocol model. Any AI reading this can now match every type marker it sees in later responses to a real definition, without needing to look it up somewhere else or guess."

> Technical: "7,202 bytes, mime type `text/x-concerto`. That is the canonical Concerto model, served from the bundled file in the container. Cached on first read."

### PROBE 4 (typed error)

> Plain: "Flip the same server to the failure mode. Client asks for an agreement that does not exist. Instead of a text blob with the error string jammed inside, the AI gets a structured error with a code it can read directly, so it can tell that record does not exist apart from the server is broken and act on it."

> Technical: "On the wire, the payload carries `code: AGREEMENT_NOT_FOUND`, a human message, and `details.identifier: 999999`. Same pattern extends across every ServiceError subclass in the shared layer. PR 200 upstream."

### PROBE 5 (shared service layer)

> Plain: "Same server, same database, two different ways to ask. A normal HTTP client hits `/templates` over REST. An AI agent asks over MCP through a resource read. Both come back with the exact same rows because they call the same service function under the hood. That is the whole refactor in one screen."

> Technical: "REST route and MCP resource both go through `listTemplates` in `src/services/templateService.ts`. No `makeApiRequest` loop, no localhost round-trip. Slices 1 through 5 upstream, PR 211 through PR 225, landed the same pattern in the RI."

### PROBE 6 (subscriptions/listen)

> Plain: "The AI just asked the server, let me know when things change. The server said yes and handed back a subscription id. From this point on, if anyone modifies a template or an agreement, the AI hears about it in real time. It does not have to poll."

> Technical: "SEP-2575 preview handler wired via the underlying server request handler, registered against the URIs the client asked for. The 2026-07-28 MCP RC formalises the same shape natively. Tracking issue for the SDK 2.0 native version is 232."

### PROBE 7 (service layer purity)

> Plain: "This next one is a boundary check. The rule is that the service layer files, the ones that actually talk to the database, are not allowed to know anything about HTTP or MCP. A quick grep across those files finds zero imports from either. That means the boundary the refactor set up is actually holding today, not aspirationally."

> Technical: "Zero hits for `from 'express'` or `from '@modelcontextprotocol'` across `src/services/`. Any leak here defeats the whole point of the refactor and gets caught in review. Same rule enforced upstream."

### PROBE 8 (SEP-2549 cache hints)

> Plain: "Last piece. Every response now tells the client how long it can cache the answer and whether the answer is public or private. Lists are volatile and per-client so the cache is short. The schema file is stable and shared, so it can be cached for a day. Removes a lot of redundant round-trips agents would otherwise make."

> Technical: "Wire shape from SEP-2549 in the MCP 2026-07-28 RC. `ttlMs` plus `cacheScope` on every `contents[]` entry. Landed as PR 201 upstream."

### When `8/8 probes green - demo ready` prints

> Plain: "So end to end: typed context on the way in, structured errors on the way out, one shared service layer under both REST and MCP, real-time notifications wired up, cache hints on every response, and a clean boundary keeping the whole thing honest. Same architecture is now on the upstream Reference Implementation across twenty-eight merged PRs."

> Technical: "This is the twelve-week arc. Blog and design of record for what comes next, issue 247 for A2A and issue 232 for SDK 2.0 native subscriptions, are linked in the repo README."

Bottom line must read: **`8/8 probes green - demo ready`**

**Optional Terminal 2** (side by side): `docker compose logs -f apap-mcp-poc-server-1` shows JSON-RPC traffic hitting the server in real time. Visual bonus, not required.

### Test suite proof (~20s, at end of beat 2)

Right after `8/8 probes green`, run the full test suite to prove the safety net the blog claims:

```bash
npm test 2>&1 | tail -10
```

Shows 65 tests passing with a coverage summary. `src/services/` should read at least `97%` statement coverage.

**Narration:**

> "Full test suite: 65 tests, service layer at 98.55% statement coverage, thresholds enforced in vitest. Any regression fails the run."

Transition: cut to browser.

---

## Beat 3: beyond the proposal (3:40)

Opens with a scale visual in the terminal, then three ~60s sub-beats in the browser. Pre-stage 3 browser tabs.

### Scale visual (10s, at start of beat 3)

Terminal (still the one from beat 2):

```bash
gh pr list --repo accordproject/apap --author @me --state merged --limit 50 | wc -l
```

Expected output: `28`

**Narration:**

> "Twenty-eight PRs into the upstream repo over the twelve weeks. Here's what they cover."

Cut to browser.

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

## Beat 5: what's next + close (1:10)

**Tab:** blog `§09` three open questions block.

Scroll and read:

- MCP tool contract versioning when the protocol schema changes
- Right auth model for a public agent endpoint on a contract protocol
- MCP tool or A2A skill: unresolved for capabilities exposed on both surfaces

**Narration:**

> "These are the questions this GSoC cycle did not resolve. The next contributor who does shapes the pattern the ecosystem picks up."

**Just before closing shot, narration (~10s):**

> "Twelve weeks of review and architectural sparring from Niall Roche and Dan Selman shaped every decision. Full acknowledgments in the blog."

**Closing shot:** blog header (icons + title).

**Narration:**

> "Blog, repo, and the design of record are all linked. Twelve weeks, contributed to Accord Project, hosted by the Linux Foundation."

Fade.

---

## Pre-recording checklist

- [ ] `docker compose down && docker compose up -d --build` succeeds
- [ ] `curl http://localhost:9000/healthz` returns `{"status":"ok",...}`
- [ ] `./demo-runner.sh` dry-run prints **`8/8 probes green - demo ready`**
- [ ] `npm test 2>&1 | tail -10` prints all tests green with coverage summary
- [ ] `gh pr list --repo accordproject/apap --author @me --state merged --limit 50 | wc -l` returns exactly `28`
- [ ] `gh auth status` shows authenticated (needed for the scale-visual command on-camera)
- [ ] Optional: seed a few extra templates via `POST /templates` before recording so PROBE 5 shows "3 records = 3 records" instead of "1 = 1"; punchier visual
- [ ] Title-card slide ready for the first 20s of beat 1 (name, project, mentors) OR blog header pulled up in a browser tab as the intro screen
- [ ] Six browser tabs pre-loaded and pinned in a private window (blocks notifications):
  1. Pre-GSoC `mcp.ts` snippet or blog `§02`
  2. PR **#227** diff (SDK 2.0)
  3. Blog `§05` (A/B eval numbers)
  4. `build.yml` RLS smoke section
  5. Issue **#247** (A2A design of record)
  6. Blog `§09` (open questions)
- [ ] macOS Do Not Disturb ON, Discord + Mail closed
- [ ] Terminal font at least 16pt so text reads at 720p on YouTube
- [ ] OBS Studio scene configured (see Recording setup below): Display Capture + Video Capture Device overlay + Audio Input Capture
- [ ] Test OBS recording for 30 seconds first; verify audio, screen, and face cam all capture cleanly

## Recording setup

Use OBS Studio (free, macOS universal binary from https://obsproject.com/download). QuickTime cannot composite a face-cam overlay onto a screen recording; OBS can.

One-time setup (~15 min):

1. Install OBS from the URL above.
2. Grant three macOS permissions in System Settings, Privacy and Security: Screen Recording, Camera, Microphone. Restart OBS after each grant.
3. Create a scene. Add three sources:
   - Display Capture (main screen)
   - Video Capture Device (built-in FaceTime HD Camera or external webcam)
   - Audio Input Capture (built-in mic or external)
4. Position the webcam source: drag to bottom-right, resize to ~25% width, right-click and use Transform > Fit to bounding box.
5. Settings > Output > Recording Format: MP4. Recording Path: Desktop or Movies.

For the beat 1 to beat 2 transition, click the eye icon next to the webcam source in the Sources panel to hide it. Alternative: create two scenes (Intro-with-cam, Screen-only) and switch between them mid-recording.

Apple Silicon note: if the webcam preview stutters, drop the resolution in Video Capture Device Properties to 1280x720. 720p is fine for a corner overlay.

## Timing at a glance

| Beat | Duration | Running total |
|:---|:---:|:---:|
| 1: intro + cold open | 0:50 | 0:50 |
| 2: live 8-probe run + test suite | 3:20 | 4:10 |
| 3: scale visual + beyond the proposal (3 sub-beats) | 3:40 | 7:50 |
| 4: A2A design of record | 2:00 | 9:50 |
| 5: open questions + mentor thanks + close | 1:10 | 11:00 |

Video runs ~11 min. If a strict 10-min ceiling matters (some GSoC tracks prefer it), trim beat 4 by 30s (drop the R1/R2 walk, keep sidecar diagram + auth-adapter note only), or shave beat 3c PG18 walk to 30s.

## After recording

- Trim in iMovie or DaVinci Resolve free
- Aim for 8 to 11 min final length
- Upload to YouTube unlisted first, share URL for review, then flip to public
- Paste the YouTube description block below into the video description before flipping public
- Once URL is stable, patch it into:
  - `README.md` at the "Final GSoC demo video (August 2026)" slot
  - `docs/blog/final-2026.md` if the blog should embed it
  - `accordproject/apap` blog PR (**#250**) via a follow-up commit
  - The AP WordPress blog post via a DM to Sanket + Diana

## YouTube description template

Paste this into the video description before flipping the upload from unlisted to public. Replace the video URL placeholders inline (chapters are timestamp anchors YouTube parses automatically from `0:00`-style lines).

```
GSoC 2026 final work-product walkthrough for Idea #4: Hardening the APAP/MCP Server.

Twelve weeks of upstream work on accordproject/apap: shared service layer with typed errors, MCP SDK 2.0 migration, PG18 with RLS smoke, paged MCP resource URIs, SEP-2549 cache hints, and A2A sidecar as design of record. Typed context lifts frontier-model agent performance by +20pp on Claude Sonnet 4.6 and +38pp on GPT-4o on a first-pass three-arm A/B.

Links:
- Blog: https://github.com/JayDS22/apap-mcp-poc/blob/main/docs/blog/final-2026.md
- POC repo: https://github.com/JayDS22/apap-mcp-poc
- Upstream: https://github.com/accordproject/apap
- A2A design of record: https://github.com/accordproject/apap/issues/247
- Blog PR upstream: https://github.com/accordproject/apap/pull/250

Chapters:
0:00 Intro
0:20 The pre-GSoC HTTP loop
0:50 Live 8-probe demo on POC (typed context, service layer, subscriptions, cache hints)
4:10 Twenty-eight upstream PRs + beyond the proposal (SDK 2.0, A/B eval, PG18 + RLS)
7:50 A2A sidecar as design of record
9:50 Open questions + close

Mentors: Niall Roche, Dan Selman
Community: Sanket Shevkar, Matt Roberts, Steven Obiajulu, Sonia Duma
Hosted by the Linux Foundation.
```

## What this script does NOT try to demo on the POC

Five capabilities require the MCP SDK 2.0 line and are not on the POC main (which stays on SDK 1.x). All five are demoed via browser tabs in Beat 3 instead:

- Split-package imports (`@modelcontextprotocol/{core,server,express,node,client}@2.0.0`)
- `NodeStreamableHTTPServerTransport` natively (POC 1.x still supports SSE alongside)
- `ProtocolError` hierarchy (POC 1.x still uses `McpError`)
- `.registerTool()` API (POC 1.x uses `.tool()`)
- Paged MCP URIs with RFC 6570 form-style expansion (POC 1.x lacks the `ResourceTemplate` variable-substitution shape)

Rationale: POC is the seed that demonstrated the shared-service-layer pattern. Upstream shipped the SDK 2.0 migration atomically as PR **#227**. Beat 2 shows the architecture live on POC; Beat 3a shows the migration diff in the browser. Different beats, different scopes.
