import type { TemplateInsert, TemplateRow } from '../../src/db/schema.js';

/**
 * Seed data for the "Late Delivery and Penalty" template.
 * This is the canonical example from the APAP RI's own docs and test suite.
 */
export const lateDeliveryTemplate: TemplateInsert = {
  uri: 'resource:org.accordproject.protocol@1.0.0.Template#latedelivery',
  author: 'dan',
  hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
  displayName: 'Late Delivery and Penalty',
  version: '1.0.0',
  description: 'A clause that defines penalties for late delivery of goods',
  license: 'Apache-2.0',
  keywords: ['late', 'delivery', 'penalty'],
  metadata: {
    $class: 'org.accordproject.protocol@1.0.0.TemplateMetadata',
    runtime: 'typescript',
    template: 'clause',
    cicero: '0.25.x',
  },
  logo: null,
  templateModel: {
    $class: 'org.accordproject.protocol@1.0.0.TemplateModel',
    typeName: 'LatePenaltyClause',
    model: {
      $class: 'org.accordproject.protocol@1.0.0.CtoModel',
      ctoFiles: [
        {
          contents: `namespace io.clause.latedeliveryandpenalty@0.1.0
import org.accordproject.time@0.3.0.{Duration, TemporalUnit}
concept LatePenaltyClause {
  o Boolean forceMajeure
  o Duration penaltyDuration
  o Double penaltyPercentage
  o Double capPercentage
  o Duration termination
  o String fractionalPart
}`,
        },
      ],
    },
  },
  text: {
    $class: 'org.accordproject.protocol@1.0.0.TemplateText',
    templateMark: 'Late Delivery and Penalty. In case of delayed delivery...',
  },
  logic: null,
  sampleRequest: {
    $class: 'io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenaltyRequest',
    forceMajeure: false,
    agreedDelivery: '2024-01-01T00:00:00Z',
    deliveredAt: '2024-01-10T00:00:00Z',
    goodsValue: 1000.0,
  },
};

/**
 * A second template for testing list operations and ensuring
 * we handle multiple templates correctly.
 */
export const helloWorldTemplate: TemplateInsert = {
  uri: 'resource:org.accordproject.protocol@1.0.0.Template#helloworld',
  author: 'niall',
  hash: '789012fed789012fed789012fed789012fed789012fed789012fed789012fedc',
  displayName: 'Hello World',
  version: '0.1.0',
  description: 'A simple hello world template for testing',
  license: 'Apache-2.0',
  keywords: ['hello', 'test'],
  metadata: {
    $class: 'org.accordproject.protocol@1.0.0.TemplateMetadata',
    runtime: 'typescript',
    template: 'contract',
    cicero: '0.25.x',
  },
  logo: null,
  templateModel: {
    $class: 'org.accordproject.protocol@1.0.0.TemplateModel',
    typeName: 'HelloWorld',
    model: {
      $class: 'org.accordproject.protocol@1.0.0.CtoModel',
      ctoFiles: [
        {
          contents: `namespace org.accordproject.helloworld@1.0.0
concept HelloWorld {
  o String name
}`,
        },
      ],
    },
  },
  text: {
    $class: 'org.accordproject.protocol@1.0.0.TemplateText',
    templateMark: 'Hello {{name}}!',
  },
  logic: null,
  sampleRequest: null,
};

/**
 * Build a full TemplateRow from insert data for mocking DB responses.
 * Tests that mock the db parameter use this to avoid repeating row shapes.
 */
export function toTemplateRow(insert: TemplateInsert, id: number = 1): TemplateRow {
  return {
    id,
    uri: insert.uri,
    author: insert.author,
    hash: insert.hash ?? null,
    displayName: insert.displayName ?? null,
    version: insert.version,
    description: insert.description ?? null,
    license: insert.license,
    keywords: insert.keywords ?? null,
    metadata: insert.metadata,
    logo: insert.logo ?? null,
    templateModel: insert.templateModel,
    text: insert.text,
    logic: insert.logic ?? null,
    sampleRequest: insert.sampleRequest ?? null,
  };
}
