import { pgTable, serial, text, varchar, json, pgEnum } from 'drizzle-orm/pg-core';

// The APAP RI defines these four agreement states.
// Using a Postgres enum keeps the DB honest about allowed values.
export const agreementStatusEnum = pgEnum('AgreementStatusType', [
  'DRAFT',
  'SIGNING',
  'SIGNED',
  'DISPUTED',
]);

export const Template = pgTable('Template', {
  id: serial().primaryKey(),
  uri: text().unique().notNull(),
  author: text().notNull(),
  hash: varchar({ length: 64 }).unique(),
  displayName: text(),
  version: text().notNull(),
  description: text(),
  license: text().notNull(),
  keywords: text().array(),
  metadata: json().notNull(),
  logo: json(),
  templateModel: json().notNull(),
  text: json().notNull(),
  logic: json(),
  sampleRequest: json(),
});

export const Agreement = pgTable('Agreement', {
  id: serial().primaryKey(),
  uri: text().unique().notNull(),
  data: json().notNull(),
  template: text(),
  templateHash: varchar({ length: 64 }),
  state: json(),
  agreementStatus: agreementStatusEnum().notNull(),
  agreementParties: json().array(),
  signatures: json().array(),
  historyEntries: json().array(),
  attachments: json().array(),
});

// Type helpers so service functions can work with typed rows
// instead of raw `any` blobs from the query builder.
export type TemplateRow = typeof Template.$inferSelect;
export type TemplateInsert = typeof Template.$inferInsert;
export type AgreementRow = typeof Agreement.$inferSelect;
export type AgreementInsert = typeof Agreement.$inferInsert;
