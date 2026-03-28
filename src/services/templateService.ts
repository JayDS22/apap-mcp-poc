import { eq } from 'drizzle-orm';
import { Template } from '../db/schema.js';
import type { TemplateRow, TemplateInsert } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { TemplateNotFoundError, TemplateDuplicateError } from './errors.js';

// Each function takes `db` as the first arg. This is the same DI pattern I used
// at Bridgestone for the fleet analytics services and at Aya for the talent matching
// pipeline. It keeps the service layer testable without spinning up real Postgres.

/** Replaces: makeApiRequest(`${API_BASE_URL}/templates`) */
export async function listTemplates(db: Database): Promise<TemplateRow[]> {
  return db.select().from(Template);
}

/** Replaces: makeApiRequest(`${API_BASE_URL}/templates/${id}`) */
export async function getTemplateById(db: Database, id: number): Promise<TemplateRow> {
  const rows = await db.select().from(Template).where(eq(Template.id, id)).limit(1);
  if (rows.length === 0) throw new TemplateNotFoundError(id);
  return rows[0];
}

/**
 * Lookup by URI. The RI uses URIs as external identifiers while MCP tools
 * pass numeric IDs. Supporting both avoids a class of "which ID format?" bugs.
 */
export async function getTemplateByUri(db: Database, uri: string): Promise<TemplateRow> {
  const rows = await db.select().from(Template).where(eq(Template.uri, uri)).limit(1);
  if (rows.length === 0) throw new TemplateNotFoundError(uri);
  return rows[0];
}

/**
 * Insert a new template. Catches PG unique constraint violations (23505)
 * and surfaces them as TemplateDuplicateError so the caller gets a clean 409.
 */
export async function createTemplate(
  db: Database,
  data: TemplateInsert,
): Promise<TemplateRow> {
  try {
    const rows = await db.insert(Template).values(data).returning();
    return rows[0];
  } catch (err: unknown) {
    if (isUniqueViolation(err)) throw new TemplateDuplicateError(data.uri);
    throw err;
  }
}

export async function updateTemplate(
  db: Database,
  uri: string,
  data: Partial<TemplateInsert>,
): Promise<TemplateRow> {
  const rows = await db.update(Template).set(data).where(eq(Template.uri, uri)).returning();
  if (rows.length === 0) throw new TemplateNotFoundError(uri);
  return rows[0];
}

export async function deleteTemplate(db: Database, uri: string): Promise<void> {
  const rows = await db.delete(Template).where(eq(Template.uri, uri)).returning();
  if (rows.length === 0) throw new TemplateNotFoundError(uri);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code: string }).code === '23505';
}
