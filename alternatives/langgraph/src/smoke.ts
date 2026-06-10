/**
 * Smoke runner: same canned prompts as the openai-fn-calling spike, so
 * the comparison between the two frameworks is direct.
 *
 * Each prompt exercises a different tool surface so the spike has
 * concrete evidence on (a) tool selection behaviour under LangGraph,
 * (b) multi-step orchestration via the StateGraph, (c) recursion
 * limits and how the framework signals failure.
 *
 * Usage:
 *   npm run smoke                 # all prompts
 *   npm run smoke -- 0 4          # just prompts 0 and 4
 */

import 'dotenv/config';
import { spawn } from 'node:child_process';

export const SAMPLE_PROMPTS = [
    'List all templates available in this APAP server.',
    'How many agreements are currently in the system, and what statuses are they in?',
    'Show me the full payload of agreement 1, including its state.',
    'Convert agreement 1 to markdown.',
    'Trigger agreement 1 with goodsValue 140. Use the request $class that matches the template.',
    'Find any agreement that uses a late-delivery template, and tell me its current status.',
];

function run(prompt: string): Promise<void> {
    return new Promise((resolve) => {
        console.log('='.repeat(72));
        console.log(`PROMPT: ${prompt}`);
        console.log('-'.repeat(72));
        const proc = spawn('npx', ['tsx', 'src/chat.ts', prompt], {
            stdio: 'inherit',
            env: process.env,
        });
        proc.on('close', () => {
            console.log('');
            resolve();
        });
    });
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const indices = args.length
        ? args.map((a) => Number.parseInt(a, 10)).filter((n) => Number.isInteger(n))
        : SAMPLE_PROMPTS.map((_, i) => i);

    for (const i of indices) {
        const prompt = SAMPLE_PROMPTS[i];
        if (!prompt) {
            console.warn(`No prompt at index ${i}, skipping.`);
            continue;
        }
        await run(prompt);
    }
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
