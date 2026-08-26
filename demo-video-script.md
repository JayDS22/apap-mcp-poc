# GSoC 2026 final demo video script

Ten-minute end-to-end walkthrough for the GSoC final work-product submission. Five beats: (1) cold open on the pre-GSoC HTTP loop, (2) live 8-probe run against the POC, (3) three sub-beats on what shipped upstream beyond the proposal, (4) A2A design of record, (5) open questions + close. Companion to `demo-runbook.md` (which carries the per-probe narration for beat 2).

Blog referenced throughout: **https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/** (the AP WordPress publication is the canonical URL for anything shown on-camera; the source markdown for the same content lives in this repo at `docs/blog/final-2026.md`).

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

**Bridge into Beat 2:**

> "Let me show what replaced it. Twelve weeks of work on the POC, running live now. Eight probes against it in the next three minutes."

Cut to Terminal 1. See the pre-stage command narrations in Beat 2 below.

---

## Beat 2: live 8-probe run on the POC + test suite (3:20)

**Screen:** Terminal 1 (iTerm2, 16pt+ font, black background).

Pre-stage commands (run in this order). Do not type these in silence; each command gets a brief one-line narration while you type it, so the camera hears a human voice throughout, not just keyboard clacks.

```bash
cd ~/Documents/Github_Personal/GSoC-Accord/apap-mcp-poc
```
> "Alright, let me pull up the POC. This is the codebase I built for the project. It's public on GitHub if you want to clone and follow along later."

```bash
docker compose down
```
> "Clean slate first. Let me tear down anything left from an earlier run."

```bash
docker compose up -d --build
```
> "And bring it back up fresh. Postgres, the Express server, and the MCP transport, all coming up together in one Compose stack."

**Cut the ~30s Docker boot in post-production.** Splice from the `docker compose up` command straight to the "Container Started" line so viewers do not sit through dead air.

```bash
curl -s http://localhost:9000/healthz
```
> "OK, quick health check to make sure it came up clean. Server says ok, so we're good to run the probes."

### MCP Inspector visual anchor (~40s, before running probes)

Before the terminal probes fire, quick browser-based view of what the server exposes.

**Setup (do BEFORE rolling tape).** In a second terminal, launch MCP Inspector bare (Inspector 2.x moved connection config into the UI; do NOT pass transport or URL flags on the command line):

```bash
npx @modelcontextprotocol/inspector
```

Inspector prints an auth-token URL to stdout, roughly `http://localhost:6274?MCP_INSPECTOR_API_TOKEN=<token>`. Open that URL in the browser. On the Inspector home page, click **Add Server** (or the equivalent) and fill in:

- Name: `APAP POC`
- Transport Type: `Streamable HTTP`
- URL: `http://localhost:9000/mcp`

Save + Connect. The server appears in the servers list. Click it to open its Tools/Resources/Server-Info tabs.

**Inspector UI cheat sheet:**

- Tabs (Tools / Resources / Prompts / Notifications / Server Info) → left sidebar OR top nav
- Click tab → list appears in main area
- Click item → expands or opens detail view
- **This demo:** show LIST view for Tools + Resources; click INTO only `apap://schema/protocol.cto`

**Pre-record view:** Connected server open, Tools tab selected so viewers see the 4 tools listed the instant the recording cuts to Inspector.

Cut to the Inspector browser tab. Then walk three views in sequence:

**Click 1: Tools tab (already visible from pre-record view) (~12s)**

The 4 tools are listed in the main content area, one per row:

- `getTemplate`
- `getAgreement`
- `convert-agreement-to-format`
- `trigger-agreement`

> "OK quick visual anchor before the probes. This is MCP Inspector, the standard browser tool for MCP servers. Point it at the POC and here's what shows up. Tools tab first: four registered tools. Each one's a real function an AI agent can call."

**Click 2: Resources tab (sidebar or top nav, next to Tools) (~12s)**

Five resources appear in the main content area:

- `apap://templates`
- `apap://agreements`
- `apap://templates/{templateId}`
- `apap://agreements/{agreementId}`
- `apap://schema/protocol.cto`

> "Resources tab: five entries. The two collections, two parameterized versions for single-item lookups, and this one, `apap://schema/protocol.cto`. That last one is the twelve-week refactor's key move."

**Click 3: click the `apap://schema/protocol.cto` row (~12s)**

Clicking the row opens the resource detail view. The Concerto protocol model (~7200 characters of `.cto` schema) renders in the response viewer / preview pane, starting with `@description("Accord Project Agreement Protocol")`.

> "Click into it and there's the Concerto protocol model rendered directly. About seven thousand characters of type definitions any AI can now read to interpret every response from this server. Same MCP surface, visual view. Now let me run the probes for the specifics."

Cut back to the main terminal.

**If the Inspector UI does not match** (Inspector 2.x has iterated on layout): the tabs/items you're looking for are always accessible from the connected-server view. If they're grouped under a single "Explorer" or "Overview" pane, scroll to find each section header (Tools, Resources) and the click sequence stays the same.

```bash
./demo-runner.sh
```
> "Running the demo script now. Eight probes end to end against the MCP surface, one per major thing the twelve-week refactor changed. Let's watch them go."

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

**Narration per probe.** Delivered as each probe prints. Each block is one flowing line that weaves the observation, what it means, and the technical detail together, so it reads as one person explaining, not two separate speech acts.

### PROBE 1 (typed-context hint)

> "Typed-context hint on initialize. Every MCP client gets a 357-character instructions string telling the model responses are Concerto-typed objects with `$class` discriminators. So the AI doesn't have to guess if it's a template or an agreement, it reads the type marker directly. Shipped as PR 199."

### PROBE 2 (resources)

> "Client asked what resources are available. Three come back: templates, agreements, and the new schema resource, `apap://schema/protocol.cto`. That third one is the key move, the server offering the AI a copy of its own protocol dictionary. Also PR 199."

### PROBE 3 (Concerto schema)

> "And there's the dictionary. About seven thousand characters of the Concerto protocol model. Any AI can now match every `$class` marker in later responses back to a real type definition, no external lookup, no guessing."

### PROBE 4 (typed error)

> "Flip to the failure mode. Client asks for an agreement that doesn't exist. Instead of a text blob with the error jammed inside, structured payload: `code: AGREEMENT_NOT_FOUND`, human message, `details.identifier: 999999`. Meaning the agent can tell the record's missing apart from the server being broken, and act on it. PR 200."

### PROBE 5 (shared service layer)

> "Same server, two ways to ask. REST hits `/templates`, MCP asks `resources/read apap://templates`. Both come back with the exact same rows because both call the same `listTemplates` function in the service layer. No HTTP loop, no localhost round-trip. This is the whole refactor in one screen. Slices 211 through 225 landed the pattern upstream."

### PROBE 6 (subscriptions/listen)

> "Client asked, let me know when things change. Server said yes and handed back a subscription ID. From here on, if anything modifies a template, the AI hears about it in real time, no polling. SEP-2575 preview handler. SDK 2.0 native version tracked at issue 232."

### PROBE 7 (service layer purity)

> "Next up, a boundary check. Rule: service-layer files aren't allowed to import from Express or the MCP SDK. Grep across `src/services/` finds zero hits. The boundary the refactor set up is holding today, not aspirationally."

### PROBE 8 (SEP-2549 cache hints)

> "Last one. Every resource read now carries `ttlMs` and `cacheScope` fields, so caching proxies and clients know how long each answer stays valid. Lists are sixty seconds private; the schema is twenty-four hours public. SEP-2549, shipped as PR 201."

### When `8/8 probes green - demo ready` prints

> "So that's the demo. Same server, same code, whether the caller is a plain HTTP client or an AI agent going through MCP. Same contract on both sides. And this exact architecture is running upstream now across twenty-eight merged PRs. Twelve weeks."

Bottom line must read: **`8/8 probes green - demo ready`**

**Optional Terminal 2** (side by side): `docker compose logs -f apap-mcp-poc-server-1` shows JSON-RPC traffic hitting the server in real time. Visual bonus, not required.

### Test suite proof (~20s, at end of beat 2)

Right after `8/8 probes green`, run the full test suite to prove the safety net the blog claims. Narrate while typing:

> "So that's the demo. The safety net that keeps all of this from silently regressing is the test suite. Let me run it real quick."

```bash
npm test 2>&1 | tail -10
```

Test suite takes ~10-15 seconds. Narrate WHILE it runs:

> "There we go, full suite: 65 tests, service layer at 98.55% statement coverage, thresholds enforced in vitest. Any regression on that layer fails the run."

**Bridge into Beat 3:**

> "That is the POC live. But the actual story is what shipped upstream in accordproject/apap over the twelve weeks. Let me pull that up."

Transition: cut to browser.

---

## Beat 3: beyond the proposal (3:40)

Opens with a scale visual in the terminal, then three ~60s sub-beats in the browser. Pre-stage 3 browser tabs.

### Scale visual (15s, at start of beat 3)

Cut from terminal to browser. Open the pre-staged blog tab scrolled to §08 (the proposal-vs-shipped roadmap):

**Tab:** `https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/` (scrolled to §08 "Proposed vs shipped", Figure 5 CombinedRoadmap.png visible)

The roadmap shows a colored calendar: top lane in blue for what was scoped in the May proposal, bottom lanes in green for what shipped as code, amber for design of record (A2A sidecar), grey for deferred (subscriptions on SDK 2.0 native). Pan across the image slowly while narrating:

> "Twelve weeks, twenty-eight PRs merged upstream. Top lane here is what the May proposal originally scoped. And that core work basically wrapped by around week eight, which meant the back half of the cycle was free to absorb everything else the ecosystem sent our way. So MCP SDK 2.0 landed mid-cycle. Postgres 18. Paged MCP URIs. The typed-context A/B eval. A2A as design of record. Green pills shipped as code, amber is design, grey is the one deferred item."

Then a quick 8-10s cut to the merged-PR filter tab as verification anchor:

**Tab:** `https://github.com/accordproject/apap/pulls?q=is%3Apr+author%3AJayDS22+is%3Amerged`

Pan the list of 28 rows briefly while saying:

> "And here are those twenty-eight as real merged commits. Click any of them if you want to verify."

Then cut to the next tab (PR #227 for sub-beat 3a).

### 3a: MCP SDK 2.0 migration (60s)

**Tab:** `https://github.com/accordproject/apap/pull/227/files`

Scroll the `package.json` split (`@modelcontextprotocol/sdk` -> `@modelcontextprotocol/{core,server,express,node,client}`) and the `.tool()` -> `.registerTool()` diff in `handlers/mcp.ts`.

**Narration:**

> "So here's the SDK 2.0 migration. Split-package rewrite, tool registrations ported, SSE dropped for Streamable HTTP. All in one PR, one review. Tests stayed green the whole way through."

### 3b: typed-context A/B eval (60s)

**Tab:** blog `§05` showing Figure 3 (`headroom-eval.png`) + the +20pp / +38pp table beneath.

Alternative tab: `https://github.com/JayDS22/apap-mcp-poc/pull/3` for the harness.

**Narration:**

> "Next up, the typed-context A/B eval. Three-arm bench. Baseline arm has just the JSON schema. Second arm adds the typed-context hint on top. Same server, same prompts, run against Sonnet 4.6 and GPT-4o. Both jumped. So the typed context isn't just nice-to-have, it actually moves the needle."

### 3c: PG18 + RLS smoke (60s)

**Tab:** `https://github.com/accordproject/apap/blob/main/.github/workflows/build.yml`

Scroll to the RLS smoke test block (`set_config('app.user_id', ...)` against a `ROW LEVEL SECURITY` policy).

**Narration:**

> "And PG18. Came with a smoke test that runs on every push. A non-superuser role tries to bypass row-level security, gets rejected. Tenant isolation checked end to end in CI."

**Bridge into Beat 4:**

> "So that's SDK 2.0, PG18, paged URIs, all shipped as code. A2A was different though. That one shipped as a design, not a build."

---

## Beat 4: A2A: a design, not a build (2:00)

**Tab:** `https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/` (scrolled to §07 "A2A: a design, not a build", Figure 4 A2ASidecarArchitecture.png visible)

Scroll to Figure 4 (A2ASidecarArchitecture.png) so it's in view. Keep it visual and high-level; the depth lives in the blog and in issue 247 for anyone who wants it.

**Opening + sidecar diagram (Figure 4), ~15s:**

> "A2A was scoped as design-of-record this cycle, not implementation. And the design is a sidecar. So you have a dedicated `/a2a` route sitting right alongside `/mcp`, and both call into the same service layer underneath. Auth adapter only lives on the A2A side. MCP and REST stay open by design."

**High-level close + pointer to the depth, ~10s:**

> "The full write-up is in section seven of the blog and at issue 247 upstream. That has the alternatives that got rejected, the auth-boundary reasoning, all the mentor back-and-forth. Both linked below."

**Bridge into Beat 5:**

> "So that's where the twelve weeks land. But not everything got resolved."

---

## Beat 5: what's next + close (1:10)

**Tab:** blog `§09` three open questions block.

Scroll and read:

- MCP tool contract versioning when the protocol schema changes
- Right auth model for a public agent endpoint on a contract protocol
- MCP tool or A2A skill: unresolved for capabilities exposed on both surfaces

**Narration:**

> "Three questions this cycle didn't answer. Whoever picks them up shapes the pattern the ecosystem lands on."

**Just before closing shot, narration (~10s):**

> "Twelve weeks of review and architectural sparring from Niall Roche and Dan Selman. Full thanks in the blog."

**Closing shot:** blog header (icons + title).

**Narration:**

> "Blog, repo, design of record, all linked below. Twelve weeks, contributed to Accord Project, hosted by the Linux Foundation."

Fade.

---

## Pre-recording checklist

- [ ] `docker compose down && docker compose up -d --build` succeeds
- [ ] `curl http://localhost:9000/healthz` returns `{"status":"ok",...}`
- [ ] `./demo-runner.sh` dry-run prints **`8/8 probes green - demo ready`**
- [ ] `npm test 2>&1 | tail -10` prints all tests green with coverage summary
- [ ] Optional: seed a few extra templates via `POST /templates` before recording so PROBE 5 shows "3 records = 3 records" instead of "1 = 1"; punchier visual
- [ ] Title-card slide ready for the first 20s of beat 1 (name, project, mentors) OR blog header pulled up in a browser tab as the intro screen
- [ ] Seven browser tabs pre-loaded and pinned in a private window (blocks notifications). Blog tabs point at the AP WordPress publication, not the GitHub markdown, so viewers landing from the video description see the same URL that was submitted to Google.
  1. **Blog scrolled to §02** (pre-GSoC HTTP loop): `https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/`
  2. **Blog scrolled to §08 roadmap** (scale visual, Figure 5 CombinedRoadmap.png): `https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/`
  3. PR **#227** diff (SDK 2.0): `https://github.com/accordproject/apap/pull/227/files`
  4. **Blog scrolled to §05** (A/B eval, Figure 3 + +20/+38pp table): `https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/`
  5. `build.yml` RLS smoke section: `https://github.com/accordproject/apap/blob/main/.github/workflows/build.yml`
  6. **Blog scrolled to §07** (A2A design, Figure 4 A2ASidecarArchitecture.png + R1/R2 + pull-quote): `https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/`
  7. **Blog scrolled to §09** (open questions): `https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/`

Note on the five blog tabs (1, 2, 4, 6, 7): they all point at the same AP URL. Two setup options:

- **Option A (recommended):** Open the URL five times in five separate tabs and pre-scroll each one to the right section before recording, so on-camera you switch tabs cleanly rather than scrolling the same page live. Verify pre-scroll positions after any browser refresh.
- **Option B (simpler setup, less polished on camera):** Open the URL once and scroll to each section live as the beat requires. Feasible if you're comfortable scrolling smoothly on camera.

If WordPress heading anchors are stable, you can also append fragment identifiers per tab so each tab lands at the right section on load; verify before recording.
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
  - The AP WordPress blog post via a DM to Sanket + Diana (they slot it into the published post)
  - `accordproject/apap` blog PR (**#250**) via a follow-up commit if the video should be embedded upstream too
  - `docs/blog/final-2026.md` source markdown (optional, if you want the in-repo copy to embed the video as well)

## YouTube description template

Paste this into the video description before flipping the upload from unlisted to public. Replace the video URL placeholders inline (chapters are timestamp anchors YouTube parses automatically from `0:00`-style lines).

```
GSoC 2026 final work-product walkthrough for Idea #4: Hardening the APAP/MCP Server.

Twelve weeks of upstream work on accordproject/apap: shared service layer with typed errors, MCP SDK 2.0 migration, PG18 with RLS smoke, paged MCP resource URIs, SEP-2549 cache hints, and A2A sidecar as design of record. Typed context lifts frontier-model agent performance by +20pp on Claude Sonnet 4.6 and +38pp on GPT-4o on a first-pass three-arm A/B.

Links:
- Blog on Accord Project: https://accordproject.org/news/gsoc-2026-rewiring-apap-for-agents/
- POC repo: https://github.com/JayDS22/apap-mcp-poc
- Upstream: https://github.com/accordproject/apap
- A2A design of record: https://github.com/accordproject/apap/issues/247
- Blog source in repo (upstream PR): https://github.com/accordproject/apap/pull/250

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
