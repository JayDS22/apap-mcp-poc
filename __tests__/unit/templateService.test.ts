import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listTemplates,
  getTemplateById,
  getTemplateByUri,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../src/services/templateService.js';
import {
  TemplateNotFoundError,
  TemplateDuplicateError,
} from '../../src/services/errors.js';
import {
  lateDeliveryTemplate,
  helloWorldTemplate,
  toTemplateRow,
} from '../fixtures/templates.js';

// We mock the db object with a fluent query builder pattern.
// Each chained method returns the mock itself so calls like
// db.select().from(Table).where(...).limit(1) resolve correctly.
function createMockDb() {
  const mock: any = {
    _returnValue: [] as any[],

    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(function (this: any) {
      return Promise.resolve(this._returnValue);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(function (this: any) {
      return Promise.resolve(this._returnValue);
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };

  // Helper to configure what the next query chain will resolve to
  mock._setReturn = (val: any[]) => {
    mock._returnValue = val;
  };

  return mock;
}

describe('templateService', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -- listTemplates --

  describe('listTemplates', () => {
    it('returns all templates from the database', async () => {
      const rows = [toTemplateRow(lateDeliveryTemplate, 1), toTemplateRow(helloWorldTemplate, 2)];

      // For listTemplates, the chain is: db.select().from(Template)
      // We need select() to return an object whose from() resolves to rows.
      db.select.mockReturnValue({ from: vi.fn().mockResolvedValue(rows) });

      const result = await listTemplates(db);
      expect(result).toEqual(rows);
      expect(result).toHaveLength(2);
    });

    it('returns an empty array when no templates exist', async () => {
      db.select.mockReturnValue({ from: vi.fn().mockResolvedValue([]) });

      const result = await listTemplates(db);
      expect(result).toEqual([]);
    });
  });

  // -- getTemplateById --

  describe('getTemplateById', () => {
    it('returns the template when it exists', async () => {
      const row = toTemplateRow(lateDeliveryTemplate, 5);
      db._setReturn([row]);

      const result = await getTemplateById(db, 5);
      expect(result).toEqual(row);
      expect(db.select).toHaveBeenCalled();
    });

    it('throws TemplateNotFoundError when the ID does not exist', async () => {
      db._setReturn([]);

      await expect(getTemplateById(db, 999)).rejects.toThrow(TemplateNotFoundError);
      await expect(getTemplateById(db, 999)).rejects.toMatchObject({
        code: 'TEMPLATE_NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  // -- getTemplateByUri --

  describe('getTemplateByUri', () => {
    it('returns the template when URI matches', async () => {
      const row = toTemplateRow(helloWorldTemplate, 2);
      db._setReturn([row]);

      const result = await getTemplateByUri(db, helloWorldTemplate.uri);
      expect(result.uri).toBe(helloWorldTemplate.uri);
    });

    it('throws TemplateNotFoundError when URI does not match', async () => {
      db._setReturn([]);

      await expect(
        getTemplateByUri(db, 'resource:nonexistent'),
      ).rejects.toThrow(TemplateNotFoundError);
    });
  });

  // -- createTemplate --

  describe('createTemplate', () => {
    it('inserts and returns the new template', async () => {
      const row = toTemplateRow(lateDeliveryTemplate, 10);
      db._setReturn([row]);

      const result = await createTemplate(db, lateDeliveryTemplate);
      expect(result.id).toBe(10);
      expect(db.insert).toHaveBeenCalled();
    });

    it('throws TemplateDuplicateError on unique constraint violation', async () => {
      // Simulate Postgres error code 23505 (unique_violation)
      db.returning.mockRejectedValue({ code: '23505' });

      await expect(
        createTemplate(db, lateDeliveryTemplate),
      ).rejects.toThrow(TemplateDuplicateError);
    });

    it('re-throws non-unique-violation errors as-is', async () => {
      const genericError = new Error('connection lost');
      db.returning.mockRejectedValue(genericError);

      await expect(
        createTemplate(db, lateDeliveryTemplate),
      ).rejects.toThrow('connection lost');
    });
  });

  // -- updateTemplate --

  describe('updateTemplate', () => {
    it('updates and returns the template', async () => {
      const row = toTemplateRow({ ...lateDeliveryTemplate, description: 'Updated' }, 1);
      db._setReturn([row]);

      const result = await updateTemplate(db, lateDeliveryTemplate.uri, {
        description: 'Updated',
      });
      expect(result.description).toBe('Updated');
    });

    it('throws TemplateNotFoundError when URI does not match', async () => {
      db._setReturn([]);

      await expect(
        updateTemplate(db, 'resource:ghost', { description: 'nope' }),
      ).rejects.toThrow(TemplateNotFoundError);
    });
  });

  // -- deleteTemplate --

  describe('deleteTemplate', () => {
    it('deletes the template without error when it exists', async () => {
      const row = toTemplateRow(lateDeliveryTemplate, 1);
      db._setReturn([row]);

      await expect(deleteTemplate(db, lateDeliveryTemplate.uri)).resolves.toBeUndefined();
    });

    it('throws TemplateNotFoundError when URI does not match', async () => {
      db._setReturn([]);

      await expect(deleteTemplate(db, 'resource:ghost')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });
  });
});
