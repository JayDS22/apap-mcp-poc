/**
 * Single-prompt entry point that exercises the LangGraph agent.
 *
 * Usage:
 *   npm run chat -- "list all templates"
 *   echo "trigger agreement 1 with goods value 140" | npm run chat
 *
 * Mirrors the openai-fn-calling spike's chat.ts intentionally; the only
 * differences are (1) how tools/loops are expressed (graph vs hand-rolled),
 * (2) how usage metadata surfaces (per-message vs per-completion).
 */

import 'dotenv/config';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { apapAgent, SYSTEM_PROMPT } from './agent.js';

const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS ?? '10');

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
    if (!process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY not set. Copy .env.example to .env and fill it in.');
        process.exit(2);
    }

    const initialState = {
        messages: [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(prompt)],
    };

    const result = await apapAgent.invoke(initialState, {
        recursionLimit: MAX_ITERATIONS * 2,
    });

    // Walk the final transcript, logging tool calls and tally token usage.
    let totalTokens = { input: 0, output: 0, total: 0 };
    let toolCallCount = 0;
    let aiTurns = 0;

    for (const msg of result.messages) {
        if (msg instanceof AIMessage) {
            aiTurns++;
            const usage = msg.usage_metadata;
            if (usage) {
                totalTokens.input += usage.input_tokens ?? 0;
                totalTokens.output += usage.output_tokens ?? 0;
                totalTokens.total += usage.total_tokens ?? 0;
            }
            for (const tc of msg.tool_calls ?? []) {
                toolCallCount++;
                console.log(`[tool] -> ${tc.name}(${JSON.stringify(tc.args)})`);
            }
        } else if (msg instanceof ToolMessage) {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            console.log(`[tool] <- ${msg.name} (${content.length} bytes)`);
        }
    }

    const finalAi = [...result.messages].reverse().find((m) => m instanceof AIMessage) as AIMessage | undefined;
    console.log('\n--- assistant ---');
    console.log(finalAi?.content ?? '(no content)');

    console.log('\n--- usage ---');
    console.log(`agent turns: ${aiTurns}`);
    console.log(`tool calls:  ${toolCallCount}`);
    console.log(`tokens:      input=${totalTokens.input}, output=${totalTokens.output}, total=${totalTokens.total}`);
    console.log(`model:       ${process.env.OPENAI_MODEL ?? 'gpt-4o-mini'}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
