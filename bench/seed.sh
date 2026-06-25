#!/usr/bin/env bash
# Seeds one template + one agreement against $BASE_URL, prints the agreement ID.
# Used by compare.sh; safe to call directly: BASE_URL=http://localhost:9000 bash seed.sh
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:9000}"

template_payload='{"uri":"resource:org.accordproject.protocol@1.0.0.Template#bench","author":"bench","displayName":"Bench Template","version":"1.0.0","description":"bench","license":"Apache-2.0","keywords":["bench"],"metadata":{"$class":"org.accordproject.protocol@1.0.0.TemplateMetadata","runtime":"typescript","template":"clause","cicero":"0.25.x"},"templateModel":{"$class":"org.accordproject.protocol@1.0.0.TemplateModel","typeName":"Bench","model":{"$class":"org.accordproject.protocol@1.0.0.CtoModel","ctoFiles":[]}},"text":{"$class":"org.accordproject.protocol@1.0.0.Text","templateText":"bench"}}'

agreement_payload='{"uri":"apap://bench-agreement","data":{"$class":"io.bench@1.0.0.TemplateModel","clauseId":"bench-1"},"template":"resource:org.accordproject.protocol@1.0.0.Template#bench","agreementStatus":"DRAFT"}'

# Template POST: ignore duplicate-URI failures (we want re-runnable seed).
curl -fsS -X POST "$BASE_URL/templates" -H 'content-type: application/json' -d "$template_payload" > /dev/null 2>&1 || true

# Agreement POST: capture the id from the response JSON.
node -e '
let body = "";
process.stdin.on("data", c => body += c).on("end", () => {
  try { console.log(JSON.parse(body).id); }
  catch { console.error("seed: agreement response was not JSON:", body); process.exit(1); }
});
' < <(curl -fsS -X POST "$BASE_URL/agreements" -H 'content-type: application/json' -d "$agreement_payload")
