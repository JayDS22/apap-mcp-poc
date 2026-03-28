// Service layer barrel export.
// Both MCP handlers and REST routes import from here.
// Services never import transport-layer code (Express, MCP SDK).

export * from './templateService.js';
export * from './agreementService.js';
export * from './errors.js';
