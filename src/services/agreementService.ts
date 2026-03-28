import { eq } from 'drizzle-orm';
import { Agreement, Template } from '../db/schema.js';
import type { AgreementRow, AgreementInsert } from '../db/schema.js';
import type { Database } from '../db/client.js';
import {
  AgreementNotFoundError,
  AgreementConversionError,
  InvalidPayloadError,
} from './errors.js';

/** Replaces: makeApiRequest(`${API_BASE_URL}/agreements`) */
export async function listAgreements(db: Database): Promise<AgreementRow[]> {
  return db.select().from(Agreement);
}

/** Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${id}`) */
export async function getAgreementById(db: Database, id: number): Promise<AgreementRow> {
  const rows = await db.select().from(Agreement).where(eq(Agreement.id, id)).limit(1);
  if (rows.length === 0) throw new AgreementNotFoundError(id);
  return rows[0];
}

export async function createAgreement(
  db: Database,
  data: AgreementInsert,
): Promise<AgreementRow> {
  const rows = await db.insert(Agreement).values(data).returning();
  return rows[0];
}

export async function updateAgreement(
  db: Database,
  id: number,
  data: Partial<AgreementInsert>,
): Promise<AgreementRow> {
  const rows = await db.update(Agreement).set(data).where(eq(Agreement.id, id)).returning();
  if (rows.length === 0) throw new AgreementNotFoundError(id);
  return rows[0];
}

export async function deleteAgreement(db: Database, id: number): Promise<void> {
  const rows = await db.delete(Agreement).where(eq(Agreement.id, id)).returning();
  if (rows.length === 0) throw new AgreementNotFoundError(id);
}

// ----- Convert + Trigger -----
//
// These two operations are the interesting ones. In production they call
// @accordproject/template-engine to render documents and evaluate business
// rules. For this POC, I've wired the DB lookups and structured the code
// so that swapping in the real engine is a one-import change, not a rewrite.

/**
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${id}/convert/${format}`)
 *
 * Loads agreement + associated template from DB, renders to HTML or Markdown.
 * The template-engine integration point is clearly marked below.
 */
export async function convertAgreement(
  db: Database,
  agreementId: number,
  format: 'html' | 'markdown',
): Promise<string> {
  // Step 1: Load the agreement
  const agreementRows = await db
    .select()
    .from(Agreement)
    .where(eq(Agreement.id, agreementId))
    .limit(1);

  if (agreementRows.length === 0) {
    throw new AgreementNotFoundError(agreementId);
  }

  const agreement = agreementRows[0];

  // Step 2: If the agreement references a template, load it
  let templateRow = null;
  if (agreement.template) {
    const templateRows = await db
      .select()
      .from(Template)
      .where(eq(Template.uri, agreement.template))
      .limit(1);
    templateRow = templateRows[0] ?? null;
  }

  // Step 3: Convert (POC implementation; full version would use template-engine)
  try {
    return renderAgreement(agreement, templateRow, format);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'Unknown rendering error';
    throw new AgreementConversionError(agreementId, format, reason);
  }
}

/**
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${id}/trigger`, POST)
 *
 * Validates the JSON payload, loads the agreement, runs it through logic
 * evaluation. In production this invokes the Ergo/TS runtime via template-engine.
 * POC merges the payload into state and returns a structured result.
 */
export async function triggerAgreement(
  db: Database,
  agreementId: number,
  payload: string,
): Promise<Record<string, unknown>> {
  // Validate that the payload is actually valid JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new InvalidPayloadError('Payload must be valid JSON', {
      agreementId,
      receivedType: typeof payload,
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidPayloadError('Payload must be a JSON object', {
      agreementId,
    });
  }

  // Load the agreement
  const agreementRows = await db
    .select()
    .from(Agreement)
    .where(eq(Agreement.id, agreementId))
    .limit(1);

  if (agreementRows.length === 0) {
    throw new AgreementNotFoundError(agreementId);
  }

  const agreement = agreementRows[0];

  // POC: merge trigger payload into agreement state.
  // Real implementation runs this through the template engine's logic evaluation.
  const newState = {
    ...(typeof agreement.state === 'object' && agreement.state !== null
      ? agreement.state
      : {}),
    lastTrigger: parsed,
    triggeredAt: new Date().toISOString(),
  };

  // Persist the updated state
  await db
    .update(Agreement)
    .set({ state: newState })
    .where(eq(Agreement.id, agreementId));

  return {
    agreementId: agreement.id,
    status: agreement.agreementStatus,
    state: newState,
    response: {
      ...parsed,
      $class: parsed.$class ? `${String(parsed.$class).replace('Request', 'Response')}` : 'org.accordproject.protocol@1.0.0.TriggerResponse',
      processed: true,
    },
  };
}

// -- Internal helpers (not exported, not part of the public API) --

function renderAgreement(
  agreement: AgreementRow,
  template: { displayName?: string | null; uri: string } | null,
  format: 'html' | 'markdown',
): string {
  const data = agreement.data as Record<string, unknown>;
  const title = template?.displayName ?? template?.uri ?? `Agreement #${agreement.id}`;
  const status = agreement.agreementStatus;
  const dataStr = JSON.stringify(data, null, 2);

  if (format === 'html') {
    return [
      '<!DOCTYPE html>',
      '<html><head><meta charset="utf-8">',
      `<title>${escapeHtml(title)}</title>`,
      '<style>body{font-family:sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem}',
      'pre{background:#f5f5f5;padding:1rem;overflow-x:auto;border-radius:4px}',
      '.status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.85rem;',
      'background:#e8f5e9;color:#2e7d32}</style></head><body>',
      `<h1>${escapeHtml(title)}</h1>`,
      `<p>Status: <span class="status">${escapeHtml(status)}</span></p>`,
      `<h2>Agreement Data</h2>`,
      `<pre>${escapeHtml(dataStr)}</pre>`,
      '</body></html>',
    ].join('\n');
  }

  // Markdown
  return [
    `# ${title}`,
    '',
    `**Status:** ${status}`,
    '',
    '## Agreement Data',
    '',
    '```json',
    dataStr,
    '```',
  ].join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
