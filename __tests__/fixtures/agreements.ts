import type { AgreementInsert, AgreementRow } from '../../src/db/schema.js';

/**
 * Agreement based on the Late Delivery and Penalty template.
 * This mirrors the shape you'd get after creating an agreement
 * through the APAP RI's POST /agreements endpoint.
 */
export const lateDeliveryAgreement: AgreementInsert = {
  uri: 'resource:org.accordproject.protocol@1.0.0.Agreement#latedelivery-001',
  data: {
    $class: 'io.clause.latedeliveryandpenalty@0.1.0.LatePenaltyClause',
    clauseId: 'latedelivery-1',
    forceMajeure: false,
    penaltyDuration: {
      $class: 'org.accordproject.time@0.3.0.Duration',
      amount: 9,
      unit: 'days',
    },
    penaltyPercentage: 7.0,
    capPercentage: 2.0,
    termination: {
      $class: 'org.accordproject.time@0.3.0.Duration',
      amount: 2,
      unit: 'weeks',
    },
    fractionalPart: 'days',
  },
  template: 'resource:org.accordproject.protocol@1.0.0.Template#latedelivery',
  templateHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
  state: null,
  agreementStatus: 'DRAFT',
  agreementParties: [
    { name: 'Buyer Corp', role: 'buyer' },
    { name: 'Seller Inc', role: 'seller' },
  ],
  signatures: [],
  historyEntries: [],
  attachments: [],
};

/**
 * A second agreement for list operations testing.
 */
export const helloWorldAgreement: AgreementInsert = {
  uri: 'resource:org.accordproject.protocol@1.0.0.Agreement#hello-001',
  data: {
    $class: 'org.accordproject.helloworld@1.0.0.HelloWorld',
    name: 'World',
  },
  template: 'resource:org.accordproject.protocol@1.0.0.Template#helloworld',
  templateHash: '789012fed789012fed789012fed789012fed789012fed789012fed789012fedc',
  state: null,
  agreementStatus: 'SIGNED',
  agreementParties: [],
  signatures: [],
  historyEntries: [],
  attachments: [],
};

/**
 * The trigger payload that the APAP RI examples use for the
 * Late Delivery and Penalty template.
 */
export const lateDeliveryTriggerPayload = {
  $class: 'io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenaltyRequest',
  forceMajeure: false,
  agreedDelivery: '2024-01-01T00:00:00Z',
  deliveredAt: '2024-01-10T00:00:00Z',
  goodsValue: 1000.0,
};

/**
 * Build a full AgreementRow from insert data for mocking.
 */
export function toAgreementRow(insert: AgreementInsert, id: number = 1): AgreementRow {
  return {
    id,
    uri: insert.uri,
    data: insert.data,
    template: insert.template ?? null,
    templateHash: insert.templateHash ?? null,
    state: insert.state ?? null,
    agreementStatus: insert.agreementStatus,
    agreementParties: insert.agreementParties ?? null,
    signatures: insert.signatures ?? null,
    historyEntries: insert.historyEntries ?? null,
    attachments: insert.attachments ?? null,
  };
}
