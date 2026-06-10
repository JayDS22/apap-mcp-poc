/**
 * OpenAI function-calling tool definitions for APAP.
 *
 * Compare against the MCP tool registration in apap-mcp-poc/src/handlers/mcp.ts.
 * Same operations, different surface shape. Both end up calling the same REST
 * endpoints (or, in the POC, the same service layer).
 */

import type OpenAI from 'openai';
import { apap } from './apap-client.js';

export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'list_templates',
            description: 'List all available APAP templates (smart legal templates). Returns each template URI, displayName, version, and author. Use this when the user asks what templates exist.',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_template',
            description: 'Get a single template by its URI. Returns the full template payload including model, text grammar, and logic.',
            parameters: {
                type: 'object',
                properties: {
                    uri: { type: 'string', description: 'The template URI, e.g. "resource:org.accordproject.protocol@1.0.0.Template#late-delivery".' },
                },
                required: ['uri'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_agreements',
            description: 'List all APAP agreements (instances of templates with data). Returns id, uri, status, and which template each was created from.',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_agreement',
            description: 'Get a single agreement by its numeric id. Returns the full agreement payload including data, state, and parties.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: ['integer', 'string'], description: 'The agreement id (usually a number).' },
                },
                required: ['id'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'convert_agreement',
            description: 'Convert an agreement to a rendered output format (html, markdown, or text). Returns the rendered string.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: ['integer', 'string'], description: 'The agreement id.' },
                    format: { type: 'string', enum: ['html', 'markdown', 'md', 'text'], description: 'Output format.' },
                },
                required: ['id', 'format'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'trigger_agreement',
            description: 'Trigger an agreement clause with a request payload. The body MUST include a $class field naming the request type (e.g. "io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenaltyRequest"). Use get_agreement first to find valid request types if the user does not provide them.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: ['integer', 'string'], description: 'The agreement id.' },
                    body: {
                        type: 'object',
                        description: 'The Concerto-typed trigger request. Must include $class matching one of the template request types.',
                        additionalProperties: true,
                    },
                },
                required: ['id', 'body'],
                additionalProperties: false,
            },
        },
    },
];

/** Map a tool name to the actual implementation. */
export async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'list_templates':   return apap.listTemplates();
        case 'get_template':     return apap.getTemplate(String(args.uri));
        case 'list_agreements':  return apap.listAgreements();
        case 'get_agreement':    return apap.getAgreement(args.id as string | number);
        case 'convert_agreement':return apap.convertAgreement(args.id as string | number, String(args.format));
        case 'trigger_agreement':return apap.triggerAgreement(args.id as string | number, args.body as Record<string, unknown>);
        default: throw new Error(`Unknown tool: ${name}`);
    }
}
