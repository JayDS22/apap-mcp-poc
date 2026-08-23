# Typed-context demo runbook

Idea #4, Hardening the APAP/MCP Server. Originally scripted for the Accord tech WG mid-eval call on Jul 14 2026 (10-minute slot). The commands still work end to end against POC main; the narration below reflects the mid-eval framing (PRs referenced were in-flight at the time; PRs `#184`, `#199`, `#200` have since merged upstream). For the August 2026 final demo, use this as a probe script and update the framing to past tense as needed.

Each section: the command on top, one or two lines to say underneath. Copy the command, say the line, move on.

---

## Before recording / dialing in (5 min prep)

**1. Bring up the POC clean.** Run from the repo root:

```bash
docker compose down
docker compose up -d --build
```

Wait for `Container apap-mcp-poc-server-1 Started`. Takes about 30 seconds.

**2. Confirm it's healthy.**

```bash
curl -s http://localhost:9000/healthz
```

Expect `{"status":"ok","timestamp":"..."}`. If not, do not roll tape / do not join the call yet.

**3. Dry-run the demo script.** Run from the repo root:

```bash
./demo-runner.sh
```

Bottom line must read `4/4 probes green - demo ready`. If any probe is red, fix before recording.

**4. Optional: server logs pane.** Second terminal, keep it visible next to the demo pane:

```bash
docker compose logs -f apap-mcp-poc-server-1
```

Viewers see the JSON-RPC traffic hit the server in real time as the script runs. Nice touch, not required.

---

## During recording / on the call

### Frame the demo (30 seconds, no command yet)

Say the plain-English part first, then the technical bridge. The plain part is for anyone in the room who is not deep in APAP or MCP.

> "Quick context first. APAP is Accord's Agreement Protocol, and the RI is a server that speaks it. My GSoC work is on how AI and LLM clients talk to that server through the Model Context Protocol. So what you're about to see is one server answering four questions an AI client would ask, and how the answers now carry the type information the AI needs to actually work with them."

Then bridge into the technical framing:

> "One script, four probes against the MCP surface. Same shape I brought upstream through PRs 184, 199, and 200."

### Run the script

```bash
./demo-runner.sh
```

Then narrate as each probe fires. The runner paces itself, so you have time.

---

### While PROBE 1 prints (typed-context hint)

Plain first:

> "So the server just told the client, in plain terms, 'my responses are typed objects and here is where the type definitions live.' That is how an AI on the other end knows to treat what it gets back as agreements or templates, not raw JSON blobs."

Then the technical bit:

> "The instructions string is from PR 199. Every MCP client sees it on the initialize handshake, one time. 357 characters, static, no per-request cost."

### While PROBE 2 prints (resources)

Plain first:

> "Client just asked 'what have you got?' It gets back templates and agreements, which you would expect. The new thing here is the third entry: the server is offering the AI a copy of its own dictionary."

Then the technical bit:

> "That new resource is `apap://schema/protocol.cto`, added in 199. Templates and agreements were already there."

### While PROBE 3 prints (Concerto schema)

Plain first:

> "And the client just fetched that dictionary. About seven thousand characters of the protocol model. Any AI reading this can now match every type marker it sees in later responses to a real definition, without needing to look it up somewhere else or guess."

Then the technical bit:

> "7,202 bytes, mime type `text/x-concerto`. That is the canonical Concerto model, served from the bundled file in the container. Cached on first read."

### While PROBE 4 prints (typed error)

Plain first:

> "Last one. This is the failure mode. Client asked for an agreement that does not exist. Before this work, the AI on the other end would get back a text blob with the error jammed into it, and it could not do anything programmatic with that. Now it gets a structured error with a code the AI can read directly, so it can tell 'that record does not exist' apart from 'the server is broken' and react accordingly."

Then the technical bit:

> "Payload is `code: AGREEMENT_NOT_FOUND`, human message, and `details.identifier: 999999`. That is PR 200 wired end to end. On the RI today you still get a stringified concatenation the client cannot branch on."

### When `4/4 probes green - demo ready` prints

Plain first:

> "So in aggregate: same server, same code, whether the caller is a normal HTTP client or an AI agent going through MCP. One consistent contract for both sides."

Then the technical bit:

> "That is the shared service layer direction from the 143 RFC. Slice 3 in 200 is the incremental step that closes the mcp.ts side of it upstream."

---

## If something goes red

Any probe fails, do not scramble. Say this and move on:

> "The runner's flagging that one. Let me screenshare the dry-run capture from my prep notes and we can debug after."

Have a screenshot of a successful `./demo-runner.sh` run open in a second window as backup, so you can drop it into the recording / screenshare without leaving the demo screen.

---

## If someone asks to poke around in a browser

These render fine, point them at whichever they ask about:

- `http://localhost:9000/healthz`
- `http://localhost:9000/capabilities`
- `http://localhost:9000/agreements`
- `http://localhost:9000/templates`

Do not point them at `http://localhost:9000/` itself. There's no HTML index; it returns "Cannot GET /" and that reads like a broken server.

For the MCP surface specifically, if someone wants to click through it visually rather than watch the script, launch MCP Inspector in a third terminal:

```bash
npx @modelcontextprotocol/inspector --transport streamable-http --url http://localhost:9000/mcp
```

The inspector opens at `http://localhost:6274/` and prints an auth token on stdout to paste into the URL. Not started by `docker compose up`; only run it if a viewer explicitly asks for a visual walkthrough.

---

## After recording / call

From the repo root:

```bash
docker compose down
```

Docker Desktop can stay running. Compose stack is gone.
