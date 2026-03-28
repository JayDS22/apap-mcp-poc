/**
 * Error types for the service layer.
 *
 * The RI throws bare strings everywhere: throw new Error('Failed to load template').
 * That's useless for the caller -- you can't distinguish a 404 from a 500, and
 * you can't give the client anything actionable in the response body.
 *
 * These carry a machine-readable code, an HTTP status, a message, and optional
 * details. The MCP handler and REST router each have their own catch block that
 * maps ServiceError into the right response shape for their protocol. Anything
 * that ISN'T a ServiceError is a genuine bug and gets treated as a 500.
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

  /** Serialize for API responses. Stack trace stays in server logs, not in the payload. */
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
