#!/usr/bin/env node
// Latency probe: measures REST GET /agreements/:id and MCP getAgreement tool call.
// Outputs JSON to stdout. Args: --server-label, --base-url, --agreement-id, --count.
//
// The interesting comparison is the MCP path: RI loops back through internal HTTP,
// POC calls the shared service directly. REST is the parity check.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a, true];
  }),
);

const baseUrl = args['base-url'] || 'http://localhost:9000';
const agreementId = String(args['agreement-id'] || '1');
const count = parseInt(args.count || '200', 10);
const label = args['server-label'] || 'unknown';
const warmup = 10;

function stats(samples) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const sum = sorted.reduce((s, x) => s + x, 0);
  return {
    count: sorted.length,
    mean: +(sum / sorted.length).toFixed(2),
    p50: +pct(0.5).toFixed(2),
    p95: +pct(0.95).toFixed(2),
    p99: +pct(0.99).toFixed(2),
  };
}

async function probeRest() {
  for (let i = 0; i < warmup; i++) {
    const r = await fetch(`${baseUrl}/agreements/${agreementId}`);
    await r.text();
  }
  const samples = [];
  for (let i = 0; i < count; i++) {
    const t = performance.now();
    const r = await fetch(`${baseUrl}/agreements/${agreementId}`);
    await r.text();
    samples.push(performance.now() - t);
  }
  return stats(samples);
}

async function probeMcp() {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  const client = new Client({ name: 'bench-probe', version: '1.0.0' });
  await client.connect(transport);

  try {
    for (let i = 0; i < warmup; i++) {
      await client.callTool({ name: 'getAgreement', arguments: { agreementId } });
    }
    const samples = [];
    for (let i = 0; i < count; i++) {
      const t = performance.now();
      await client.callTool({ name: 'getAgreement', arguments: { agreementId } });
      samples.push(performance.now() - t);
    }
    return stats(samples);
  } finally {
    await client.close();
  }
}

const out = { server: label, baseUrl, agreementId, count };
try {
  out.rest = await probeRest();
} catch (e) {
  out.restError = e.message;
}
try {
  out.mcp = await probeMcp();
} catch (e) {
  out.mcpError = e.message;
}
console.log(JSON.stringify(out, null, 2));
