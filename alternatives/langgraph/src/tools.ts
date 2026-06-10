/**
 * LangChain tool definitions for APAP.
 *
 * Same six operations as the openai-fn-calling spike, expressed through
 * LangChain's `tool()` helper. The schema is defined with Zod, which
 * LangGraph then translates to the function-calling shape internally.
 *
 * Key difference vs the raw OpenAI spike: tools are first-class objects
 * with their own runnable interface, can be bound to the LLM via
 * `.bindTools(...)`, and are invoked by LangGraph's prebuilt `ToolNode`.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { apap } from './apap-client.js';

export const listTemplatesTool = tool(
    async () => JSON.stringify(await apap.listTemplates()),
    {
        name: 'list_templates',
        description:
            'List all available APAP templates (smart legal templates). Returns each template URI, displayName, version, and author. Use when the user asks what templates exist.',
        schema: z.object({}),
    },
);

export const getTemplateTool = tool(
    async ({ uri }: { uri: string }) => JSON.stringify(await apap.getTemplate(uri)),
    {
        name: 'get_template',
        description:
            'Get a single template by its URI. Returns the full template payload including model, text grammar, and logic.',
        schema: z.object({
            uri: z
                .string()
                .describe('The template URI, e.g. "resource:org.accordproject.protocol@1.0.0.Template#late-delivery".'),
        }),
    },
);

export const listAgreementsTool = tool(
    async () => JSON.stringify(await apap.listAgreements()),
    {
        name: 'list_agreements',
        description:
            'List all APAP agreements (instances of templates with data). Returns id, uri, status, and which template each was created from.',
        schema: z.object({}),
    },
);

export const getAgreementTool = tool(
    async ({ id }: { id: number | string }) => JSON.stringify(await apap.getAgreement(id)),
    {
        name: 'get_agreement',
        description:
            'Get a single agreement by its numeric id. Returns the full agreement payload including data, state, and parties.',
        schema: z.object({
            id: z.union([z.number(), z.string()]).describe('The agreement id (usually a number).'),
        }),
    },
);

export const convertAgreementTool = tool(
    async ({ id, format }) => apap.convertAgreement(id, format),
    {
        name: 'convert_agreement',
        description:
            'Convert an agreement to a rendered output format (html, markdown, or text). Returns the rendered string.',
        schema: z.object({
            id: z.union([z.number(), z.string()]).describe('The agreement id.'),
            format: z.enum(['html', 'markdown', 'md', 'text']).describe('Output format.'),
        }),
    },
);

export const triggerAgreementTool = tool(
    async ({ id, body }) =>
        JSON.stringify(await apap.triggerAgreement(id, body as Record<string, unknown>)),
    {
        name: 'trigger_agreement',
        description:
            'Trigger an agreement clause with a request payload. The body MUST include a $class field naming the request type (e.g. "io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenaltyRequest"). Use get_agreement first to find valid request types if the user does not provide them.',
        schema: z.object({
            id: z.union([z.number(), z.string()]).describe('The agreement id.'),
            body: z
                .record(z.unknown())
                .describe('The Concerto-typed trigger request. Must include $class.'),
        }),
    },
);

export const tools = [
    listTemplatesTool,
    getTemplateTool,
    listAgreementsTool,
    getAgreementTool,
    convertAgreementTool,
    triggerAgreementTool,
];
