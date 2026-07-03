/**
 * Build a Markdown comparison report from one or more results-*.json files.
 * Provider-aware: if results span multiple providers, aggregate per provider.
 *
 * Usage:
 *   npx tsx bench/concerto-context/report.ts results-*.json > results.md
 */
import { readFileSync } from 'node:fs';

type Provider = 'anthropic' | 'openai';

interface RunResult {
  queryId: string;
  category: string;
  variant: 'control' | 'treatment';
  provider?: Provider;
  runIndex?: number;
  toolCalls: string[];
  finalText: string;
  score: number;
  expectations: { tool: { hit: number; total: number }; keyword: { hit: number; total: number } };
}

interface ResultsFile {
  provider?: Provider;
  model: string;
  mcpBaseUrl: string;
  modelParams?: { temperature: number; max_tokens: number; runs: number; seed: number | null };
  timestamp: string;
  results: RunResult[];
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function fmt(x: number): string {
  return x.toFixed(3);
}

function fmtPM(m: number, sd: number): string {
  return `${fmt(m)} ± ${fmt(sd)}`;
}

function deltaStr(d: number): string {
  return (d >= 0 ? '+' : '') + fmt(d);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: npx tsx report.ts <results-*.json> [more.json...]');
  process.exit(1);
}

const runs: ResultsFile[] = files.map((f) => {
  const parsed = JSON.parse(readFileSync(f, 'utf-8')) as ResultsFile;
  // Backfill provider on each result from file-level field if missing.
  parsed.results.forEach((r) => {
    if (!r.provider) r.provider = parsed.provider ?? 'anthropic';
  });
  return parsed;
});

const allResults = runs.flatMap((r) => r.results);
const providers = Array.from(new Set(allResults.map((r) => r.provider!))).sort();
const queryIds = Array.from(new Set(allResults.map((r) => r.queryId)));
const categories = Array.from(new Set(allResults.map((r) => r.category)));

const modelByProvider = new Map<Provider, string>();
for (const r of runs) {
  const p = r.provider ?? 'anthropic';
  if (!modelByProvider.has(p)) modelByProvider.set(p, r.model);
}

console.log('# Concerto-context A/B results');
console.log('');
console.log('Providers / models:');
for (const r of runs) {
  const p = r.provider ?? 'anthropic';
  const params = r.modelParams ? ` (temp=${r.modelParams.temperature}, max_tokens=${r.modelParams.max_tokens}, runs=${r.modelParams.runs}${r.modelParams.seed != null ? `, seed=${r.modelParams.seed}` : ''})` : '';
  console.log(`- **${p}**: \`${r.model}\`${params}`);
}
console.log('');
console.log(`Files aggregated: ${runs.length}.  Queries: ${queryIds.length}.`);
console.log('');

console.log('## Aggregate by provider');
console.log('');
console.log('| Provider  | Control (mean ± sd) | Treatment (mean ± sd) | Delta  | N (per variant) |');
console.log('| --------- | ------------------- | --------------------- | ------ | --------------- |');
for (const p of providers) {
  const c = allResults.filter((r) => r.provider === p && r.variant === 'control').map((r) => r.score);
  const t = allResults.filter((r) => r.provider === p && r.variant === 'treatment').map((r) => r.score);
  const cm = mean(c);
  const tm = mean(t);
  console.log(`| ${p.padEnd(9)} | ${fmtPM(cm, stdev(c))} | ${fmtPM(tm, stdev(t))} | ${deltaStr(tm - cm)} | ${c.length} |`);
}
console.log('');

console.log('## By category (per provider)');
console.log('');
for (const p of providers) {
  console.log(`### ${p}`);
  console.log('');
  console.log('| Category         | Control | Treatment | Delta  |');
  console.log('| ---------------- | ------- | --------- | ------ |');
  for (const cat of categories) {
    const c = allResults.filter((r) => r.provider === p && r.category === cat && r.variant === 'control');
    const t = allResults.filter((r) => r.provider === p && r.category === cat && r.variant === 'treatment');
    const cm = mean(c.map((r) => r.score));
    const tm = mean(t.map((r) => r.score));
    console.log(`| ${cat.padEnd(16)} | ${fmt(cm)}   | ${fmt(tm)}     | ${deltaStr(tm - cm)} |`);
  }
  console.log('');
}

console.log('## Per query (per provider)');
console.log('');
for (const p of providers) {
  console.log(`### ${p}`);
  console.log('');
  console.log('| Query                          | Control | Treatment | Delta  |');
  console.log('| ------------------------------ | ------- | --------- | ------ |');
  for (const qid of queryIds) {
    const c = allResults.filter((r) => r.provider === p && r.queryId === qid && r.variant === 'control');
    const t = allResults.filter((r) => r.provider === p && r.queryId === qid && r.variant === 'treatment');
    const cm = mean(c.map((r) => r.score));
    const tm = mean(t.map((r) => r.score));
    console.log(`| ${qid.padEnd(30)} | ${fmt(cm)}   | ${fmt(tm)}     | ${deltaStr(tm - cm)} |`);
  }
  console.log('');
}

console.log('## Sample outputs');
console.log('');
for (const qid of queryIds) {
  console.log(`### ${qid}`);
  console.log('');
  for (const p of providers) {
    const cRun = allResults.find((r) => r.provider === p && r.queryId === qid && r.variant === 'control');
    const tRun = allResults.find((r) => r.provider === p && r.queryId === qid && r.variant === 'treatment');
    if (!cRun || !tRun) continue;
    console.log(`**${p} control** (score ${fmt(cRun.score)}, tools: \`[${cRun.toolCalls.join(', ')}]\`)`);
    console.log('');
    console.log('> ' + cRun.finalText.replace(/\n/g, '\n> '));
    console.log('');
    console.log(`**${p} treatment** (score ${fmt(tRun.score)}, tools: \`[${tRun.toolCalls.join(', ')}]\`)`);
    console.log('');
    console.log('> ' + tRun.finalText.replace(/\n/g, '\n> '));
    console.log('');
  }
}
