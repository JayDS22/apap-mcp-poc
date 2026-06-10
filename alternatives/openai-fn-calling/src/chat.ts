/**
 * Chat loop driving APAP through OpenAI function-calling.
 *
 * Reads a prompt from argv (or stdin if none), sends it to gpt-4o-mini with
 * the tool definitions from ./tools.ts, executes any tool calls against the
 * APAP REST server, and prints the final assistant message plus a token
 * usage summary that feeds the comparison memo.
 *
 * Usage:
 *   npm run chat -- "list all templates"
 *   echo "trigger agreement 1 with goods value 140" | npm run chat
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { tools, dispatch } from './tools.js';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const MAX_TURNS = Number(process.env.MAX_TURNS ?? '8');

const SYSTEM_PROMPT = `You are an assistant that helps users work with the Accord Project Agreement Protocol (APAP).
APAP manages smart legal templates and agreements (template instances).

Always use the provided tools to query state. Do not invent template URIs or agreement ids.
For trigger_agreement, you must construct a request body with a $class field naming the
correct Concerto request type. If unsure, call get_template or get_agreement first to discover
the valid request types.

Keep responses brief. After taking tool actions, summarise what happened in one or two
sentences for the user.`;

async function readStdinIfAny(): Promise<string> {
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks).toString().trim();
}

async function main(): Promise<void> {
    const argPrompt = process.argv.slice(2).join(' ').trim();
    const stdinPrompt = argPrompt ? '' : await readStdinIfAny();
    const prompt = argPrompt || stdinPrompt;
    if (!prompt) {
        console.error('Usage: npm run chat -- "your prompt here"');
        process.exit(2);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('OPENAI_API_KEY not set. Copy .env.example to .env and fill it in.');
        process.exit(2);
    }

    const client = new OpenAI({ apiKey });
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
    ];

    let totalTokens = { prompt: 0, completion: 0, total: 0 };
    let toolCallCount = 0;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
        const completion = await client.chat.completions.create({
            model: MODEL,
            messages,
            tools,
            tool_choice: 'auto',
        });

        const usage = completion.usage;
        if (usage) {
            totalTokens.prompt += usage.prompt_tokens;
            totalTokens.completion += usage.completion_tokens;
            totalTokens.total += usage.total_tokens;
        }

        const msg = completion.choices[0]?.message;
        if (!msg) {
            console.error('Empty response from model.');
            process.exit(1);
        }
        messages.push(msg);

        const calls = msg.tool_calls ?? [];
        if (calls.length === 0) {
            console.log('\n--- assistant ---');
            console.log(msg.content ?? '(no content)');
            break;
        }

        for (const call of calls) {
            toolCallCount++;
            if (call.type !== 'function') continue;
            const name = call.function.name;
            let args: Record<string, unknown> = {};
            try {
                args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            } catch (err) {
                console.error(`[tool] ${name}: bad JSON args: ${(err as Error).message}`);
            }
            console.log(`[tool] -> ${name}(${JSON.stringify(args)})`);
            let result: unknown;
            try {
                result = await dispatch(name, args);
            } catch (err) {
                result = { error: (err as Error).message };
            }
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            console.log(`[tool] <- ${name} (${resultStr.length} bytes)`);
            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: resultStr,
            });
        }
    }

    console.log('\n--- usage ---');
    console.log(`turns:       ${messages.filter((m) => m.role === 'assistant').length}`);
    console.log(`tool calls:  ${toolCallCount}`);
    console.log(`tokens:      prompt=${totalTokens.prompt}, completion=${totalTokens.completion}, total=${totalTokens.total}`);
    console.log(`model:       ${MODEL}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
