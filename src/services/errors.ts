/**
 * Structured error hierarchy for the APAP service layer.
 *
 * The current RI throws bare strings like `throw new Error('Failed to load template')`.
 * That makes it impossible for MCP handlers or REST routes to return the right status
 * code or give the client useful context about what went wrong.
 *
 * Every error here carries:
 *   - code:       A machine-readable string the client can switch on
 *   - statusCode: The HTTP status code that REST routes should use
 *   - message:    A human-readable description
 *   - details:    Optional structured payload for debugging
 *
 * MCP handlers catch ServiceError and map it to an MCP error response.
 * REST routes catch ServiceError and map it to the correct HTTP status.
 * Anything that ISN'T a ServiceError is treated as an unexpected 500.
 */

export class ServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serialize to a clean JSON shape for API responses.
   * We intentionally omit the stack trace here because
   * that belongs in server logs, not client payloads.
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// -- Template errors --

export class TemplateNotFoundError extends ServiceError {
  constructor(identifier: string | number) {
    super('TEMPLATE_NOT_FOUND', 404, `Template not found: ${identifier}`, {
      identifier,
    });
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplateDuplicateError extends ServiceError {
  constructor(uri: string) {
    super('TEMPLATE_DUPLICATE', 409, `Template with URI already exists: ${uri}`, {
      uri,
    });
    this.name = 'TemplateDuplicateError';
  }
}

// -- Agreement errors --

export class AgreementNotFoundError extends ServiceError {
  constructor(identifier: string | number) {
    super('AGREEMENT_NOT_FOUND', 404, `Agreement not found: ${identifier}`, {
      identifier,
    });
    this.name = 'AgreementNotFoundError';
  }
}

export class AgreementConversionError extends ServiceError {
  constructor(agreementId: string | number, format: string, reason?: string) {
    super(
      'AGREEMENT_CONVERSION_FAILED',
      500,
      `Failed to convert agreement ${agreementId} to ${format}${reason ? ': ' + reason : ''}`,
      { agreementId, format, reason },
    );
    this.name = 'AgreementConversionError';
  }
}

export class InvalidPayloadError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVALID_PAYLOAD', 400, message, details);
    this.name = 'InvalidPayloadError';
  }
}

// -- Generic validation error --

export class ValidationError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 422, message, details);
    this.name = 'ValidationError';
  }
}
