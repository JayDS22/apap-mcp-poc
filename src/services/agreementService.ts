import { eq } from 'drizzle-orm';
import { Agreement, Template } from '../db/schema.js';
import type { AgreementRow, AgreementInsert } from '../db/schema.js';
import type { Database } from '../db/client.js';
import {
  AgreementNotFoundError,
  AgreementConversionError,
  InvalidPayloadError,
} from './errors.js';

/**
 * List all agreements.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements`)
 * Used by: MCP resource "agreements", REST GET /agreements
 */
export async function listAgreements(db: Database): Promise<AgreementRow[]> {
  const rows = await db.select().from(Agreement);
  return rows;
}

/**
 * Fetch a single agreement by its numeric ID.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${agreementId}`)
 * Used by: MCP tool "getAgreement", MCP resource template, REST GET /agreements/:id
 *
 * Throws AgreementNotFoundError if no row matches.
 */
export async function getAgreementById(db: Database, id: number): Promise<AgreementRow> {
  const rows = await db.select().from(Agreement).where(eq(Agreement.id, id)).limit(1);
  if (rows.length === 0) {
    throw new AgreementNotFoundError(id);
  }
  return rows[0];
}

/**
 * Create a new agreement.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements`, { method: 'POST', body })
 * Used by: REST POST /agreements
 */
export async function createAgreement(
  db: Database,
  data: AgreementInsert,
): Promise<AgreementRow> {
  const rows = await db.insert(Agreement).values(data).returning();
  return rows[0];
}

/**
 * Update an existing agreement by ID.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${id}`, { method: 'PUT', body })
 * Used by: REST PUT /agreements/:id
 */
export async function updateAgreement(
  db: Database,
  id: number,
  data: Partial<AgreementInsert>,
): Promise<AgreementRow> {
  const rows = await db
    .update(Agreement)
    .set(data)
    .where(eq(Agreement.id, id))
    .returning();
  if (rows.length === 0) {
    throw new AgreementNotFoundError(id);
  }
  return rows[0];
}

/**
 * Delete an agreement by ID.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${id}`, { method: 'DELETE' })
 * Used by: REST DELETE /agreements/:id
 */
export async function deleteAgreement(db: Database, id: number): Promise<void> {
  const rows = await db.delete(Agreement).where(eq(Agreement.id, id)).returning();
  if (rows.length === 0) {
    throw new AgreementNotFoundError(id);
  }
}

// ---------------------------------------------------------------
// Convert + Trigger
//
// In the full APAP RI these operations reach out to the Accord
// template engine. For this POC we implement the DB lookup and
// format conversion skeleton. A real implementation would import
// @accordproject/template-engine here and call it directly instead
// of looping back through HTTP.
// ---------------------------------------------------------------

/**
 * Convert an agreement to the requested output format (html | markdown).
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${id}/convert/${format}`)
 * Used by: MCP tool "convert-agreement-to-format", REST GET /agreements/:id/convert/:format
 *
 * In the full implementation this would:
 *   1. Load the agreement from DB
 *   2. Load its associated template from DB
 *   3. Feed both into @accordproject/template-engine
 *   4. Return the rendered output
 *
 * For the POC we do steps 1-2 from the DB and return a structured
 * representation that proves the service layer wiring works end-to-end.
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
 * Trigger agreement logic with a JSON payload.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/agreements/${id}/trigger`, { method: 'POST', body })
 * Used by: MCP tool "trigger-agreement", REST POST /agreements/:id/trigger
 *
 * The trigger operation sends data to the agreement's template logic,
 * evaluating business rules against the input. In the full RI this calls
 * the template engine. Here we validate the payload shape and return
 * the agreement state with the payload merged in.
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

  // POC: merge the trigger payload into the agreement state.
  // Full implementation would run this through the template engine's
  // logic evaluation (the Ergo/TS runtime).
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
