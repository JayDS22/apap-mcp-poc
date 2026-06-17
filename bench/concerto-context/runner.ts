/**
 * Concerto-context A/B harness runner.
 *
 * Connects to a running MCP server (the one with PR #2's `instructions`
 * field + `apap://schema/protocol.cto` resource), pulls the typed-context
 * material once, then runs the same query set twice through Claude: once
 * without that material in the system prompt (control), once with it
 * (treatment). Records tool calls + final text per query and scores them
 * against the rubric in queries.json.
 *
 * See README.md for the methodology and rationale.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MCP_BASE_URL = process.env.MCP_BASE_URL ?? 'http://localhost:9000';
const MODEL = process.env.BENCH_MODEL ?? 'claude-sonnet-4-6';
const QUERIES_PATH = process.env.BENCH_QUERIES ?? './queries.json';
const MAX_TURNS = 8;

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required.');
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
  toolCalls: string[];
  finalText: string;
  score: number;
  expectations: { tool: { hit: number; total: number }; keyword: { hit: number; total: number } };
}

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

async function setupMcp(): Promise<{
  client: Client;
  tools: AnthropicTool[];
  instructions: string;
  schemaText: string;
}> {
  const transport = new StreamableHTTPClientTransport(new URL(`${MCP_BASE_URL}/mcp`));
  const client = new Client({ name: 'bench-concerto-context', version: '1.0.0' });
  await client.connect(transport);

  const toolsResult = await client.listTools();
  const tools: AnthropicTool[] = toolsResult.tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema as Record<string, unknown>,
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
  tools: AnthropicTool[],
  systemPrompt: string | undefined,
  mcpClient: Client,
  anthropic: Anthropic,
): Promise<RunResult> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: query.prompt }];
  const toolCalls: string[] = [];
  let finalText = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      tools: tools as unknown as Anthropic.Tool[],
      messages,
    });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    if (textBlocks.length > 0) {
      finalText = textBlocks.map((b) => b.text).join('\n');
    }

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      toolCalls.push(toolUse.name);
      try {
        const result = await mcpClient.callTool({
          name: toolUse.name,
          arguments: toolUse.input as Record<string, unknown>,
        });
        const resultText = Array.isArray(result.content)
          ? result.content
              .map((c) => (typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : JSON.stringify(c)))
              .join('\n')
          : JSON.stringify(result);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: resultText,
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `error: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  const toolHits = query.expected.toolCalls.filter((name) => toolCalls.includes(name)).length;
  const kwHits = query.expected.keywords.filter((kw) => finalText.toLowerCase().includes(kw.toLowerCase())).length;
  const total = query.expected.toolCalls.length + query.expected.keywords.length;
  const score = total > 0 ? (toolHits + kwHits) / total : 0;

  return {
    queryId: query.id,
    category: query.category,
    variant,
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
  console.error(`Connected to ${MCP_BASE_URL}. Tools: ${tools.map((t) => t.name).join(', ')}`);
  console.error(`Instructions present: ${instructions.length > 0 ? `${instructions.length} chars` : 'NO'}`);
  console.error(`Schema resource: ${schemaText.length > 0 ? `${schemaText.length} chars` : 'NO'}`);
  console.error('');

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const controlSystem = buildSystemPrompt('control', instructions, schemaText);
  const treatmentSystem = buildSystemPrompt('treatment', instructions, schemaText);

  const results: RunResult[] = [];
  for (const query of queries) {
    console.error(`[control]   ${query.id}`);
    results.push(await runQuery(query, 'control', tools, controlSystem, client, anthropic));
    console.error(`[treatment] ${query.id}`);
    results.push(await runQuery(query, 'treatment', tools, treatmentSystem, client, anthropic));
  }

  await client.close();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = fileURLToPath(new URL(`./results-${timestamp}.json`, import.meta.url));
  writeFileSync(outPath, JSON.stringify({ model: MODEL, mcpBaseUrl: MCP_BASE_URL, timestamp, results }, null, 2));
  console.error(`\nWrote ${outPath}`);

  const controlMean = mean(results.filter((r) => r.variant === 'control').map((r) => r.score));
  const treatmentMean = mean(results.filter((r) => r.variant === 'treatment').map((r) => r.score));
  console.error(`\nSummary: control=${controlMean.toFixed(3)}  treatment=${treatmentMean.toFixed(3)}  delta=${(treatmentMean - controlMean).toFixed(3)}`);
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
