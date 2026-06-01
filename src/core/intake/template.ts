// Intake template builder — turns a DatasetSchema into the array-of-arrays for
// a downloadable .xlsx (Data + Data Dictionary + README sheets). Pure data so it
// is testable; the UI feeds these AoAs to SheetJS to write the workbook.

import type { DatasetSchema } from "../datasets";

export interface TemplateAoA {
  data: string[][]; // header row + one example row
  dictionary: string[][]; // header + one row per field
  readme: string[][]; // key/value rows
}

export function templateAoA(schema: DatasetSchema): TemplateAoA {
  const headers = schema.fields.map((fld) => fld.label);
  const example = schema.fields.map((fld) => fld.example ?? "");
  const data: string[][] = [headers, example];

  const dictionary: string[][] = [["Field", "Column header", "Required", "Type", "Allowed values", "Example", "Notes"]];
  for (const fld of schema.fields) {
    dictionary.push([
      fld.name,
      fld.label,
      fld.required ? "Yes" : "No",
      fld.dtype,
      fld.allowed ? fld.allowed.join(", ") : "",
      fld.example ?? "",
      fld.note ?? "",
    ]);
  }

  const readme: string[][] = [
    ["Dataset", schema.label],
    ["Kind", schema.kind],
    ["Owner team", schema.team],
    ["Grain", schema.grain],
    ["Period", schema.periodKind],
    ["Key field(s)", schema.keyFields.join(", ")],
    ["Filename convention", schema.filenameHint],
    ["Description", schema.description],
    ["", ""],
    [
      "How to use",
      "Fill the Data sheet — one row per record. Keep the header row exactly as-is. " +
        "The example row shows the expected format; replace or delete it. " +
        "Then upload this file on the Data Intake page under the matching domain.",
    ],
  ];

  return { data, dictionary, readme };
}
