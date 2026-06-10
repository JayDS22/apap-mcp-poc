/**
 * LangGraph ReAct-style agent for APAP.
 *
 * Architecture: a StateGraph with two nodes.
 *   - "agent" calls the LLM with the message history and the bound tools.
 *   - "tools" is the prebuilt ToolNode that executes whatever tool calls
 *     the LLM returned.
 *
 * Edges:
 *   start -> agent
 *   agent -> tools  (if the last message has tool_calls)
 *   agent -> end    (otherwise)
 *   tools -> agent  (always, to feed results back)
 *
 * This is the textbook ReAct loop, the same shape OpenAI's raw
 * function-calling chat loop implements by hand. The difference is that
 * here the framework owns the loop, retries, and conditional edges.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { tools } from './tools.js';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const llm = new ChatOpenAI({
    model: MODEL,
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY,
}).bindTools(tools);

const toolNode = new ToolNode(tools);

function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    if (last.tool_calls && last.tool_calls.length > 0) return 'tools';
    return END;
}

async function callModel(state: typeof MessagesAnnotation.State): Promise<{ messages: AIMessage[] }> {
    const response = await llm.invoke(state.messages);
    return { messages: [response as AIMessage] };
}

export const apapAgent = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, ['tools', END])
    .addEdge('tools', 'agent')
    .compile();

export const SYSTEM_PROMPT = `You are an assistant that helps users work with the Accord Project Agreement Protocol (APAP).
APAP manages smart legal templates and agreements (template instances).

Always use the provided tools to query state. Do not invent template URIs or agreement ids.
For trigger_agreement, you must construct a request body with a $class field naming the
correct Concerto request type. If unsure, call get_template or get_agreement first to discover
the valid request types.

Keep responses brief. After taking tool actions, summarise what happened in one or two
sentences for the user.`;
