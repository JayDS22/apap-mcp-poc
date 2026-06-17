/**
 * Build a Markdown comparison report from one or more results-*.json files.
 *
 * Usage:
 *   npx tsx bench/concerto-context/report.ts results-2026-06-17T...json
 *   npx tsx bench/concerto-context/report.ts results-*.json > results.md
 */
import { readFileSync } from 'node:fs';

interface RunResult {
  queryId: string;
  category: string;
  variant: 'control' | 'treatment';
  toolCalls: string[];
  finalText: string;
  score: number;
  expectations: { tool: { hit: number; total: number }; keyword: { hit: number; total: number } };
}

interface ResultsFile {
  model: string;
  mcpBaseUrl: string;
  timestamp: string;
  results: RunResult[];
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmt(x: number): string {
  return x.toFixed(3);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: npx tsx report.ts <results-*.json> [more.json...]');
  process.exit(1);
}

const runs: ResultsFile[] = files.map((f) => JSON.parse(readFileSync(f, 'utf-8')));

console.log('# Concerto-context A/B results');
console.log('');
console.log(`Model: \`${runs[0].model}\``);
console.log(`Runs aggregated: ${runs.length}`);
console.log('');

const allResults = runs.flatMap((r) => r.results);

const control = allResults.filter((r) => r.variant === 'control');
const treatment = allResults.filter((r) => r.variant === 'treatment');

console.log('## Aggregate');
console.log('');
console.log('| Variant   | Mean score | N  |');
console.log('| --------- | ---------- | -- |');
console.log(`| control   | ${fmt(mean(control.map((r) => r.score)))}      | ${control.length} |`);
console.log(`| treatment | ${fmt(mean(treatment.map((r) => r.score)))}      | ${treatment.length} |`);
console.log('');

console.log('## By category');
console.log('');
console.log('| Category         | Control | Treatment | Delta  |');
console.log('| ---------------- | ------- | --------- | ------ |');
const categories = Array.from(new Set(allResults.map((r) => r.category)));
for (const cat of categories) {
  const c = mean(control.filter((r) => r.category === cat).map((r) => r.score));
  const t = mean(treatment.filter((r) => r.category === cat).map((r) => r.score));
  console.log(`| ${cat.padEnd(16)} | ${fmt(c)}   | ${fmt(t)}     | ${(t - c >= 0 ? '+' : '') + fmt(t - c)} |`);
}
console.log('');

console.log('## Per query');
console.log('');
console.log('| Query                       | Control | Treatment | Delta  |');
console.log('| --------------------------- | ------- | --------- | ------ |');
const queryIds = Array.from(new Set(allResults.map((r) => r.queryId)));
for (const qid of queryIds) {
  const c = mean(control.filter((r) => r.queryId === qid).map((r) => r.score));
  const t = mean(treatment.filter((r) => r.queryId === qid).map((r) => r.score));
  console.log(`| ${qid.padEnd(27)} | ${fmt(c)}   | ${fmt(t)}     | ${(t - c >= 0 ? '+' : '') + fmt(t - c)} |`);
}
console.log('');

console.log('## Sample outputs');
console.log('');
for (const qid of queryIds) {
  const cRun = control.find((r) => r.queryId === qid);
  const tRun = treatment.find((r) => r.queryId === qid);
  if (!cRun || !tRun) continue;
  console.log(`### ${qid}`);
  console.log('');
  console.log(`**control** (score ${fmt(cRun.score)}, tools: \`[${cRun.toolCalls.join(', ')}]\`)`);
  console.log('');
  console.log('> ' + cRun.finalText.replace(/\n/g, '\n> '));
  console.log('');
  console.log(`**treatment** (score ${fmt(tRun.score)}, tools: \`[${tRun.toolCalls.join(', ')}]\`)`);
  console.log('');
  console.log('> ' + tRun.finalText.replace(/\n/g, '\n> '));
  console.log('');
}
