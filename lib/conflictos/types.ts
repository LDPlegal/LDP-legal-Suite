// Pure types and labels for the conflict-of-interest feature, importable from
// both server (DB queries, server actions) and client (form components).
// Keeping this module free of any `pg`/Drizzle import lets client components
// reference these symbols without dragging Postgres into the browser bundle.

export type ConflictKind =
  | "client_taxid"
  | "counterparty_taxid"
  | "client_name"
  | "counterparty_name";

export type ConflictHit = {
  kind: ConflictKind;
  refId: string;
  refType: "client" | "case";
  label: string;
  detail: string;
  involvedLawyers?: Array<{ id: string; name: string }>;
};

export type ConflictReport = {
  hits: ConflictHit[];
  // True when at least one tax_id-based hit exists (strong signal). Name-only
  // hits are advisory and never set blocking.
  blocking: boolean;
};

export const CONFLICT_KIND_LABEL: Record<ConflictKind, string> = {
  client_taxid: "Ya es cliente del firm",
  counterparty_taxid: "Aparece como contraparte en otro caso",
  client_name: "Cliente con nombre similar",
  counterparty_name: "Contraparte con nombre similar",
};
