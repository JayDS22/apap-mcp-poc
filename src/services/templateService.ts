import { eq } from 'drizzle-orm';
import { Template } from '../db/schema.js';
import type { TemplateRow, TemplateInsert } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { TemplateNotFoundError, TemplateDuplicateError } from './errors.js';

/**
 * List all templates.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/templates`)
 * Used by: MCP resource "templates", REST GET /templates
 */
export async function listTemplates(db: Database): Promise<TemplateRow[]> {
  const rows = await db.select().from(Template);
  return rows;
}

/**
 * Fetch a single template by its numeric ID.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/templates/${templateId}`)
 * Used by: MCP tool "getTemplate", MCP resource template "apap://templates/{templateId}"
 *
 * Throws TemplateNotFoundError if the ID doesn't match any row.
 */
export async function getTemplateById(db: Database, id: number): Promise<TemplateRow> {
  const rows = await db.select().from(Template).where(eq(Template.id, id)).limit(1);
  if (rows.length === 0) {
    throw new TemplateNotFoundError(id);
  }
  return rows[0];
}

/**
 * Fetch a single template by URI.
 *
 * The APAP RI uses URIs as the primary external identifier for templates,
 * but the DB also has a numeric auto-increment ID. Some callers pass the URI
 * (like the REST route), others pass the numeric ID (like MCP tools). We
 * support both lookup strategies.
 */
export async function getTemplateByUri(db: Database, uri: string): Promise<TemplateRow> {
  const rows = await db.select().from(Template).where(eq(Template.uri, uri)).limit(1);
  if (rows.length === 0) {
    throw new TemplateNotFoundError(uri);
  }
  return rows[0];
}

/**
 * Create a new template.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/templates`, { method: 'POST', body })
 * Used by: REST POST /templates
 *
 * Throws TemplateDuplicateError if the URI already exists (unique constraint).
 */
export async function createTemplate(
  db: Database,
  data: TemplateInsert,
): Promise<TemplateRow> {
  try {
    const rows = await db.insert(Template).values(data).returning();
    return rows[0];
  } catch (err: unknown) {
    // Postgres unique_violation is error code 23505
    if (isUniqueViolation(err)) {
      throw new TemplateDuplicateError(data.uri);
    }
    throw err;
  }
}

/**
 * Update an existing template by URI.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/templates/${uri}`, { method: 'PUT', body })
 * Used by: REST PUT /templates/:uri
 */
export async function updateTemplate(
  db: Database,
  uri: string,
  data: Partial<TemplateInsert>,
): Promise<TemplateRow> {
  const rows = await db
    .update(Template)
    .set(data)
    .where(eq(Template.uri, uri))
    .returning();
  if (rows.length === 0) {
    throw new TemplateNotFoundError(uri);
  }
  return rows[0];
}

/**
 * Delete a template by URI.
 *
 * Replaces: makeApiRequest(`${API_BASE_URL}/templates/${uri}`, { method: 'DELETE' })
 * Used by: REST DELETE /templates/:uri
 */
export async function deleteTemplate(db: Database, uri: string): Promise<void> {
  const rows = await db.delete(Template).where(eq(Template.uri, uri)).returning();
  if (rows.length === 0) {
    throw new TemplateNotFoundError(uri);
  }
}

// -- Helpers --

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}
