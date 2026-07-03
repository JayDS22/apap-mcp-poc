#!/usr/bin/env node
// Reads two probe JSON files and emits a markdown comparison to stdout.
// Usage: node report.mjs results-poc.json results-ri.json > results.md

import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('Usage: report.mjs <poc.json> <ri.json>');
  process.exit(1);
}
const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const poc = runs.find((r) => r.server === 'poc') ?? runs[0];
const ri = runs.find((r) => r.server === 'ri') ?? runs[1];

const fmt = (n) => (n == null ? 'n/a' : `${n.toFixed(2)} ms`);
const delta = (p, r) => {
  if (p == null || r == null || r === 0) return 'n/a';
  const d = ((p - r) / r) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
};

function table(key, label) {
  const lines = [
    `### ${label}`,
    '',
    '| Metric | RI (baseline) | POC | Δ vs RI |',
    '|---|---|---|---|',
  ];
  for (const k of ['mean', 'p50', 'p95', 'p99']) {
    lines.push(`| ${k.toUpperCase()} | ${fmt(ri[key]?.[k])} | ${fmt(poc[key]?.[k])} | ${delta(poc[key]?.[k], ri[key]?.[k])} |`);
  }
  lines.push('');
  return lines.join('\n');
}

const errors = [];
if (poc.restError) errors.push(`- POC REST probe error: \`${poc.restError}\``);
if (poc.mcpError) errors.push(`- POC MCP probe error: \`${poc.mcpError}\``);
if (ri.restError) errors.push(`- RI REST probe error: \`${ri.restError}\``);
if (ri.mcpError) errors.push(`- RI MCP probe error: \`${ri.mcpError}\``);

process.stdout.write(`# APAP MCP POC vs RI: latency comparison

Sampling: **${poc.count ?? ri.count} requests per endpoint** against each server (sequential, single client, after a 10-request warm-up). Both servers run on \`localhost:9000\` via their own \`docker compose up\`. Fresh Postgres each run, holding the same single template + single agreement (id ${poc.agreementId ?? ri.agreementId}).

${table('rest', 'REST GET /agreements/:id')}
${table('mcp', 'MCP tool call: getAgreement')}

## Why the MCP delta is the headline number

The REST table is a parity check: both servers go straight through Express → Drizzle → Postgres on this path, so the numbers should be close. A material divergence here would mean the POC accidentally introduced overhead in the route handler.

The MCP table is where the POC's value lives. The RI's \`getAgreement\` tool issues \`makeApiRequest('http://localhost:9000/agreements/...')\`, an internal HTTP loop back through its own Express stack. The POC's tool calls the shared service function (\`getAgreementById(db, id)\`) directly. The delta on this row quantifies the cost of that loop end-to-end, as measured from an MCP client.
${errors.length ? `\n## Errors during this run\n\n${errors.join('\n')}\n` : ''}`);
