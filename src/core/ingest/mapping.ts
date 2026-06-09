// Column-mapping engine — the core behind the guided importer (BUILD-1). Given a
// file's header row and a target schema, it suggests which header maps to which
// canonical field (reusing the same normalize/alias logic the parser uses), and
// reports the gaps a user must resolve before import. Pure + deterministic; no I/O.

import { DatasetSchema, normalizeHeader } from "../datasets";

export interface ColumnMappingSuggestion {
  /** Header (verbatim from the file) → canonical field name, or null when unmatched. */
  mapping: Record<string, string | null>;
  /** Headers that matched no field (candidates the user can map by hand). */
  unmappedHeaders: string[];
  /** Canonical fields no header mapped to (candidates to fill from an unmapped header). */
  unmappedFields: string[];
  /** Required fields still without a mapping — a hard gap to resolve before importing. */
  missingRequired: string[];
}

// Auto-suggest a mapping from headers to fields. First confident alias match wins a
// field; a second header aliasing to an already-claimed field is left unmapped so the
// user decides. Deterministic — same inputs, same suggestion.
export function suggestColumnMapping(headers: string[], schema: DatasetSchema): ColumnMappingSuggestion {
  const alias = schema.aliasMap();
  const canonical = new Set(schema.columnNames);
  const mapping: Record<string, string | null> = {};
  const claimed = new Set<string>();
  for (const h of headers) {
    const field = alias[normalizeHeader(h)];
    if (field && canonical.has(field) && !claimed.has(field)) {
      mapping[h] = field;
      claimed.add(field);
    } else {
      mapping[h] = null;
    }
  }
  return {
    mapping,
    unmappedHeaders: headers.filter((h) => mapping[h] === null),
    unmappedFields: schema.columnNames.filter((c) => !claimed.has(c)),
    missingRequired: [...schema.requiredFields()].filter((c) => !claimed.has(c)),
  };
}

// Validate a user-edited mapping before import. Returns the resolved set plus any
// problems: a field mapped from two headers (ambiguous), or a header mapped to a
// name that isn't a real field. Empty `errors` ⇒ safe to import.
export interface MappingValidation {
  errors: string[];
  missingRequired: string[];
  mappedFields: string[];
}

export function validateColumnMapping(mapping: Record<string, string | null>, schema: DatasetSchema): MappingValidation {
  const canonical = new Set(schema.columnNames);
  const errors: string[] = [];
  const fieldToHeaders = new Map<string, string[]>();
  for (const [header, field] of Object.entries(mapping)) {
    if (field == null) continue;
    if (!canonical.has(field)) {
      errors.push(`"${header}" is mapped to "${field}", which is not a field in this template.`);
      continue;
    }
    fieldToHeaders.set(field, [...(fieldToHeaders.get(field) ?? []), header]);
  }
  for (const [field, hs] of fieldToHeaders) {
    if (hs.length > 1) errors.push(`Field "${field}" is mapped from ${hs.length} columns (${hs.join(", ")}) — pick one.`);
  }
  const mappedFields = [...fieldToHeaders.keys()];
  const missingRequired = [...schema.requiredFields()].filter((c) => !fieldToHeaders.has(c));
  return { errors, missingRequired, mappedFields };
}
