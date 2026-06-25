/**
 * Concerto-context A/B harness runner — OpenAI variant.
 *
 * Same methodology as runner.ts (the Anthropic variant): connect to the
 * running MCP server, pull instructions + schema once, run each query through
 * control (no system prompt) and treatment (system prompt with the typed-
 * context material). The provider-specific differences live in `runQuery`.
 */
import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MCP_BASE_URL = process.env.MCP_BASE_URL ?? 'http://localhost:9000';
const MODEL = process.env.BENCH_OPENAI_MODEL ?? 'gpt-4o';
const QUERIES_PATH = process.env.BENCH_QUERIES ?? './queries.json';
const MAX_TURNS = 8;
const RUNS = Math.max(1, parseInt(process.env.BENCH_RUNS ?? '5', 10));
const TEMPERATURE = 0;
const MAX_TOKENS = 1024;
const SEED = parseInt(process.env.BENCH_SEED ?? '42', 10);

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required.');
  process.exit(1);
}

interface QueryExpectation {
  toolCalls: string[];
  keywords: string[];
}

interface Query {
  id: string;
  category: 'schema-knowledge' | 'tool-use' | 'mixed';
  prompt: string;
  expected: QueryExpectation;
}

interface RunResult {
  queryId: string;
  category: string;
  variant: 'control' | 'treatment';
  provider: 'openai';
  runIndex: number;
  toolCalls: string[];
  finalText: string;
  score: number;
  expectations: { tool: { hit: number; total: number }; keyword: { hit: number; total: number } };
}

type OpenAITool = OpenAI.Chat.Completions.ChatCompletionTool;

async function setupMcp(): Promise<{
  client: Client;
  tools: OpenAITool[];
  instructions: string;
  schemaText: string;
}> {
  const transport = new StreamableHTTPClientTransport(new URL(`${MCP_BASE_URL}/mcp`));
  const client = new Client({ name: 'bench-concerto-context-openai', version: '1.0.0' });
  await client.connect(transport);

  const toolsResult = await client.listTools();
  const tools: OpenAITool[] = toolsResult.tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));

  const instructions = client.getInstructions() ?? '';

  let schemaText = '';
  try {
    const schemaRes = await client.readResource({ uri: 'apap://schema/protocol.cto' });
    schemaText = schemaRes.contents
      .map((c) => (typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .join('\n');
  } catch (err) {
    console.error('Warning: could not read apap://schema/protocol.cto resource:', (err as Error).message);
  }

  return { client, tools, instructions, schemaText };
}

function buildSystemPrompt(variant: 'control' | 'treatment', instructions: string, schemaText: string): string | undefined {
  if (variant === 'control') return undefined;
  const parts: string[] = [];
  if (instructions) parts.push(instructions);
  if (schemaText) parts.push(`Concerto protocol model:\n\n${schemaText}`);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

async function runQuery(
  query: Query,
  variant: 'control' | 'treatment',
  runIndex: number,
  tools: OpenAITool[],
  systemPrompt: string | undefined,
  mcpClient: Client,
  openai: OpenAI,
): Promise<RunResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: query.prompt });

  const toolCalls: string[] = [];
  let finalText = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      seed: SEED,
      tools,
      messages,
    });

    const choice = response.choices[0];
    const message = choice.message;

    if (message.content) {
      finalText = message.content;
    }

    if (!message.tool_calls || message.tool_calls.length === 0 || choice.finish_reason === 'stop') {
      break;
    }

    messages.push(message);

    for (const tc of message.tool_calls) {
      if (tc.type !== 'function') continue;
      toolCalls.push(tc.function.name);
      let resultText: string;
      let isError = false;
      try {
        const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        const result = await mcpClient.callTool({
          name: tc.function.name,
          arguments: args as Record<string, unknown>,
        });
        resultText = Array.isArray(result.content)
          ? result.content
              .map((c) => (typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : JSON.stringify(c)))
              .join('\n')
          : JSON.stringify(result);
      } catch (err) {
        resultText = `error: ${(err as Error).message}`;
        isError = true;
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: isError ? `[error] ${resultText}` : resultText,
      });
    }
  }

  const toolHits = query.expected.toolCalls.filter((name) => toolCalls.includes(name)).length;
  const kwHits = query.expected.keywords.filter((kw) => finalText.toLowerCase().includes(kw.toLowerCase())).length;
  const total = query.expected.toolCalls.length + query.expected.keywords.length;
  const score = total > 0 ? (toolHits + kwHits) / total : 0;

  return {
    queryId: query.id,
    category: query.category,
    variant,
    provider: 'openai',
    runIndex,
    toolCalls,
    finalText: finalText.slice(0, 800),
    score,
    expectations: {
      tool: { hit: toolHits, total: query.expected.toolCalls.length },
      keyword: { hit: kwHits, total: query.expected.keywords.length },
    },
  };
}

async function main() {
  const queriesUrl = new URL(QUERIES_PATH, import.meta.url);
  const queries: Query[] = JSON.parse(readFileSync(fileURLToPath(queriesUrl), 'utf-8'));

  const { client, tools, instructions, schemaText } = await setupMcp();
  console.error(`Connected to ${MCP_BASE_URL}. Tools: ${tools.map((t) => t.function.name).join(', ')}`);
  console.error(`Instructions present: ${instructions.length > 0 ? `${instructions.length} chars` : 'NO'}`);
  console.error(`Schema resource: ${schemaText.length > 0 ? `${schemaText.length} chars` : 'NO'}`);
  console.error('');

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const controlSystem = buildSystemPrompt('control', instructions, schemaText);
  const treatmentSystem = buildSystemPrompt('treatment', instructions, schemaText);

  console.error(`Runs per variant per query: ${RUNS}, seed: ${SEED}`);

  const results: RunResult[] = [];
  for (let run = 0; run < RUNS; run++) {
    console.error(`\n=== Run ${run + 1} of ${RUNS} ===`);
    for (const query of queries) {
      console.error(`[control]   ${query.id}`);
      results.push(await runQuery(query, 'control', run, tools, controlSystem, client, openai));
      console.error(`[treatment] ${query.id}`);
      results.push(await runQuery(query, 'treatment', run, tools, treatmentSystem, client, openai));
    }
  }

  await client.close();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = fileURLToPath(new URL(`./results-openai-${timestamp}.json`, import.meta.url));
  const modelParams = { temperature: TEMPERATURE, max_tokens: MAX_TOKENS, runs: RUNS, seed: SEED };
  writeFileSync(outPath, JSON.stringify({ provider: 'openai', model: MODEL, mcpBaseUrl: MCP_BASE_URL, modelParams, timestamp, results }, null, 2));
  console.error(`\nWrote ${outPath}`);

  const controlScores = results.filter((r) => r.variant === 'control').map((r) => r.score);
  const treatmentScores = results.filter((r) => r.variant === 'treatment').map((r) => r.score);
  const cMean = mean(controlScores);
  const tMean = mean(treatmentScores);
  console.error(`\nSummary [openai]: control=${cMean.toFixed(3)} (sd ${stdev(controlScores).toFixed(3)}, n=${controlScores.length})  treatment=${tMean.toFixed(3)} (sd ${stdev(treatmentScores).toFixed(3)}, n=${treatmentScores.length})  delta=${(tMean - cMean).toFixed(3)}`);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
