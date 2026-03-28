import { eq } from 'drizzle-orm';
import { Template } from '../db/schema.js';
import type { TemplateRow, TemplateInsert } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { TemplateNotFoundError, TemplateDuplicateError } from './errors.js';

/**
 * List all templates.
 * Replaces: makeApiRequest(`${API_BASE_URL}/templates`)
 */
export async function listTemplates(db: Database): Promise<TemplateRow[]> {
  const rows = await db.select().from(Template);
  return rows;
}

/**
 * Get a template by numeric ID.
 * Replaces: makeApiRequest(`${API_BASE_URL}/templates/${templateId}`)
 */
export async function getTemplateById(db: Database, id: number): Promise<TemplateRow> {
  const rows = await db.select().from(Template).where(eq(Template.id, id)).limit(1);
  if (rows.length === 0) {
    throw new TemplateNotFoundError(id);
  }
  return rows[0];
}

/**
 * Get a template by URI. The RI uses URIs as the primary external identifier,
 * but MCP tools typically pass numeric IDs. We support both lookups.
 */
export async function getTemplateByUri(db: Database, uri: string): Promise<TemplateRow> {
  const rows = await db.select().from(Template).where(eq(Template.uri, uri)).limit(1);
  if (rows.length === 0) {
    throw new TemplateNotFoundError(uri);
  }
  return rows[0];
}

/**
 * Insert a new template. Catches Postgres unique constraint violations
 * and re-throws as TemplateDuplicateError so callers get a 409, not a 500.
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

/** Update an existing template by URI. Returns the updated row or throws if not found. */
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

/** Delete by URI. Throws TemplateNotFoundError if nothing was deleted. */
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
