/**
 * Thin REST client for the APAP server.
 *
 * Intentionally a verbatim copy of the openai-fn-calling spike's client so
 * the comparison is apples-to-apples: same operations, same surface,
 * different orchestration framework on top.
 */

const BASE = process.env.APAP_BASE_URL ?? 'http://localhost:9000';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`APAP ${init?.method ?? 'GET'} ${path} -> ${res.status}: ${text}`);
    }
    return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

export interface TemplateSummary {
    uri: string;
    displayName?: string | null;
    version: string;
    author: string;
    description?: string | null;
}

export interface Agreement {
    id: string | number;
    uri: string;
    template?: string | null;
    data?: Record<string, unknown>;
    agreementStatus?: string;
    state?: unknown;
}

export const apap = {
    capabilities: () => call<string[]>('/capabilities'),
    listTemplates: () => call<{ items: TemplateSummary[] }>('/templates'),
    getTemplate: (uri: string) =>
        call<TemplateSummary>(`/templates/${encodeURIComponent(uri)}`),
    listAgreements: () => call<{ items: Agreement[] }>('/agreements'),
    getAgreement: (id: string | number) => call<Agreement>(`/agreements/${id}`),
    convertAgreement: (id: string | number, format: string) =>
        fetch(`${BASE}/agreements/${id}/convert/${format}`).then(async (r) => {
            const body = await r.text();
            if (!r.ok) throw new Error(`APAP convert -> ${r.status}: ${body}`);
            return body;
        }),
    triggerAgreement: (id: string | number, body: Record<string, unknown>) =>
        call<unknown>(`/agreements/${id}/trigger`, {
            method: 'POST',
            body: JSON.stringify(body),
        }),
};
