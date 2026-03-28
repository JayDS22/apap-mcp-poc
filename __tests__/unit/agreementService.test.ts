import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listAgreements,
  getAgreementById,
  createAgreement,
  updateAgreement,
  deleteAgreement,
  convertAgreement,
  triggerAgreement,
} from '../../src/services/agreementService.js';
import {
  AgreementNotFoundError,
  InvalidPayloadError,
} from '../../src/services/errors.js';
import {
  lateDeliveryAgreement,
  helloWorldAgreement,
  lateDeliveryTriggerPayload,
  toAgreementRow,
} from '../fixtures/agreements.js';
import { lateDeliveryTemplate, toTemplateRow } from '../fixtures/templates.js';

// Same fluent mock pattern as the template service tests.
// We need a slightly more complex mock here because convertAgreement
// makes two sequential queries (agreement + template).
function createMockDb() {
  let callCount = 0;
  const returnValues: any[][] = [[]];

  const mock: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      const val = returnValues[callCount] ?? [];
      callCount++;
      return Promise.resolve(val);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(() => {
      const val = returnValues[callCount] ?? [];
      callCount++;
      return Promise.resolve(val);
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };

  // Set what sequential query chains will return.
  // e.g., setReturns([[agreementRow], [templateRow]]) for convertAgreement
  mock._setReturns = (vals: any[][]) => {
    callCount = 0;
    returnValues.length = 0;
    vals.forEach((v) => returnValues.push(v));
  };

  // Shorthand for single-query scenarios
  mock._setReturn = (val: any[]) => {
    mock._setReturns([val]);
  };

  return mock;
}

describe('agreementService', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -- listAgreements --

  describe('listAgreements', () => {
    it('returns all agreements', async () => {
      const rows = [
        toAgreementRow(lateDeliveryAgreement, 1),
        toAgreementRow(helloWorldAgreement, 2),
      ];
      db.select.mockReturnValue({ from: vi.fn().mockResolvedValue(rows) });

      const result = await listAgreements(db);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no agreements exist', async () => {
      db.select.mockReturnValue({ from: vi.fn().mockResolvedValue([]) });

      const result = await listAgreements(db);
      expect(result).toEqual([]);
    });
  });

  // -- getAgreementById --

  describe('getAgreementById', () => {
    it('returns the agreement when it exists', async () => {
      const row = toAgreementRow(lateDeliveryAgreement, 1);
      db._setReturn([row]);

      const result = await getAgreementById(db, 1);
      expect(result.id).toBe(1);
      expect(result.agreementStatus).toBe('DRAFT');
    });

    it('throws AgreementNotFoundError when ID is missing', async () => {
      db._setReturn([]);

      await expect(getAgreementById(db, 404)).rejects.toThrow(AgreementNotFoundError);
    });
  });

  // -- createAgreement --

  describe('createAgreement', () => {
    it('inserts and returns the agreement', async () => {
      const row = toAgreementRow(lateDeliveryAgreement, 5);
      db._setReturn([row]);

      const result = await createAgreement(db, lateDeliveryAgreement);
      expect(result.id).toBe(5);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  // -- updateAgreement --

  describe('updateAgreement', () => {
    it('updates and returns the agreement', async () => {
      const row = toAgreementRow({ ...lateDeliveryAgreement, agreementStatus: 'SIGNED' }, 1);
      db._setReturn([row]);

      const result = await updateAgreement(db, 1, { agreementStatus: 'SIGNED' });
      expect(result.agreementStatus).toBe('SIGNED');
    });

    it('throws AgreementNotFoundError when ID does not exist', async () => {
      db._setReturn([]);

      await expect(
        updateAgreement(db, 999, { agreementStatus: 'DRAFT' }),
      ).rejects.toThrow(AgreementNotFoundError);
    });
  });

  // -- deleteAgreement --

  describe('deleteAgreement', () => {
    it('deletes without error when agreement exists', async () => {
      db._setReturn([toAgreementRow(lateDeliveryAgreement, 1)]);

      await expect(deleteAgreement(db, 1)).resolves.toBeUndefined();
    });

    it('throws AgreementNotFoundError when ID does not exist', async () => {
      db._setReturn([]);

      await expect(deleteAgreement(db, 999)).rejects.toThrow(AgreementNotFoundError);
    });
  });

  // -- convertAgreement --

  describe('convertAgreement', () => {
    it('returns HTML when format is html', async () => {
      const agreementRow = toAgreementRow(lateDeliveryAgreement, 1);
      const templateRow = toTemplateRow(lateDeliveryTemplate, 1);

      // First query: agreement lookup. Second query: template lookup.
      db._setReturns([[agreementRow], [templateRow]]);

      const result = await convertAgreement(db, 1, 'html');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Late Delivery and Penalty');
      expect(result).toContain('DRAFT');
    });

    it('returns Markdown when format is markdown', async () => {
      const agreementRow = toAgreementRow(lateDeliveryAgreement, 1);
      const templateRow = toTemplateRow(lateDeliveryTemplate, 1);

      db._setReturns([[agreementRow], [templateRow]]);

      const result = await convertAgreement(db, 1, 'markdown');
      expect(result).toContain('# Late Delivery and Penalty');
      expect(result).toContain('**Status:** DRAFT');
      expect(result).toContain('```json');
    });

    it('handles agreements without a linked template', async () => {
      const noTemplateAgreement = toAgreementRow(
        { ...lateDeliveryAgreement, template: null },
        1,
      );
      // Only one query (agreement), no template lookup
      db._setReturns([[noTemplateAgreement]]);

      const result = await convertAgreement(db, 1, 'html');
      expect(result).toContain('Agreement #1');
    });

    it('throws AgreementNotFoundError when agreement does not exist', async () => {
      db._setReturns([[]]);

      await expect(convertAgreement(db, 999, 'html')).rejects.toThrow(
        AgreementNotFoundError,
      );
    });
  });

  // -- triggerAgreement --

  describe('triggerAgreement', () => {
    it('processes a valid JSON payload and updates state', async () => {
      const agreementRow = toAgreementRow(lateDeliveryAgreement, 1);
      db._setReturns([[agreementRow]]);

      // The update call also uses the mock chain. We just need it not to throw.
      // It goes through: db.update().set().where() which resolves via the mock.

      const result = await triggerAgreement(
        db,
        1,
        JSON.stringify(lateDeliveryTriggerPayload),
      );

      expect(result.agreementId).toBe(1);
      expect(result.status).toBe('DRAFT');
      expect(result.state).toBeDefined();
      expect((result.state as any).lastTrigger).toEqual(lateDeliveryTriggerPayload);
      expect(result.response).toBeDefined();
      expect((result.response as any).processed).toBe(true);
    });

    it('throws InvalidPayloadError for non-JSON strings', async () => {
      await expect(
        triggerAgreement(db, 1, 'not json at all'),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it('throws InvalidPayloadError for JSON arrays', async () => {
      await expect(
        triggerAgreement(db, 1, '[1, 2, 3]'),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it('throws InvalidPayloadError for JSON primitives', async () => {
      await expect(
        triggerAgreement(db, 1, '"just a string"'),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it('throws AgreementNotFoundError when agreement does not exist', async () => {
      db._setReturns([[]]);

      await expect(
        triggerAgreement(db, 999, JSON.stringify(lateDeliveryTriggerPayload)),
      ).rejects.toThrow(AgreementNotFoundError);
    });

    it('generates a Response $class from the Request $class', async () => {
      const agreementRow = toAgreementRow(lateDeliveryAgreement, 1);
      db._setReturns([[agreementRow]]);

      const result = await triggerAgreement(
        db,
        1,
        JSON.stringify(lateDeliveryTriggerPayload),
      );

      // The trigger function should transform "...Request" to "...Response"
      expect((result.response as any).$class).toContain('Response');
    });
  });
});
