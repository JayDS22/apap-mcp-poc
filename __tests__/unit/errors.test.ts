import { describe, it, expect } from 'vitest';
import {
  ServiceError,
  TemplateNotFoundError,
  TemplateDuplicateError,
  AgreementNotFoundError,
  AgreementConversionError,
  InvalidPayloadError,
  ValidationError,
} from '../../src/services/errors.js';

describe('ServiceError', () => {
  it('stores code, statusCode, message, and details', () => {
    const err = new ServiceError('TEST_ERROR', 418, 'I am a teapot', { brew: 'earl grey' });

    expect(err.code).toBe('TEST_ERROR');
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe('I am a teapot');
    expect(err.details).toEqual({ brew: 'earl grey' });
    expect(err.name).toBe('ServiceError');
  });

  it('extends Error and works with instanceof', () => {
    const err = new ServiceError('X', 500, 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
  });

  it('serializes to JSON without stack trace', () => {
    const err = new ServiceError('TEST', 400, 'bad', { field: 'name' });
    const json = err.toJSON();

    expect(json).toEqual({
      error: {
        code: 'TEST',
        message: 'bad',
        details: { field: 'name' },
      },
    });
    // Stack trace should not leak to clients
    expect(json).not.toHaveProperty('stack');
  });

  it('omits details from JSON when not provided', () => {
    const err = new ServiceError('MINIMAL', 500, 'no details');
    const json = err.toJSON();

    expect(json.error).not.toHaveProperty('details');
  });
});

describe('TemplateNotFoundError', () => {
  it('returns 404 with the template identifier', () => {
    const err = new TemplateNotFoundError(42);

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('TEMPLATE_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('42');
    expect(err.details).toEqual({ identifier: 42 });
    expect(err.name).toBe('TemplateNotFoundError');
  });

  it('works with string identifiers (URIs)', () => {
    const err = new TemplateNotFoundError('resource:org.accordproject.foo');
    expect(err.message).toContain('resource:org.accordproject.foo');
  });
});

describe('TemplateDuplicateError', () => {
  it('returns 409 with the URI', () => {
    const err = new TemplateDuplicateError('resource:test#dup');

    expect(err.code).toBe('TEMPLATE_DUPLICATE');
    expect(err.statusCode).toBe(409);
    expect(err.details).toEqual({ uri: 'resource:test#dup' });
    expect(err.name).toBe('TemplateDuplicateError');
  });
});

describe('AgreementNotFoundError', () => {
  it('returns 404 with the agreement identifier', () => {
    const err = new AgreementNotFoundError(99);

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('AGREEMENT_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.details).toEqual({ identifier: 99 });
  });
});

describe('AgreementConversionError', () => {
  it('returns 500 with agreementId, format, and reason', () => {
    const err = new AgreementConversionError(7, 'html', 'template engine crashed');

    expect(err.code).toBe('AGREEMENT_CONVERSION_FAILED');
    expect(err.statusCode).toBe(500);
    expect(err.message).toContain('7');
    expect(err.message).toContain('html');
    expect(err.message).toContain('template engine crashed');
    expect(err.details).toEqual({
      agreementId: 7,
      format: 'html',
      reason: 'template engine crashed',
    });
  });

  it('works without a reason', () => {
    const err = new AgreementConversionError(3, 'markdown');
    expect(err.message).not.toContain('undefined');
  });
});

describe('InvalidPayloadError', () => {
  it('returns 400 with message and optional details', () => {
    const err = new InvalidPayloadError('Missing $class field', { field: '$class' });

    expect(err.code).toBe('INVALID_PAYLOAD');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: '$class' });
  });
});

describe('ValidationError', () => {
  it('returns 422', () => {
    const err = new ValidationError('URI format invalid');

    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(422);
    expect(err.name).toBe('ValidationError');
  });
});
