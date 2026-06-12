import { PaperlessAPI } from "../../api/PaperlessAPI";
import {
  CustomField,
  CustomFieldInstanceRequest,
  CustomFieldValue,
} from "../../api/types";

/**
 * The two encodings Paperless-NGX expects for a `select` value depending on the
 * write path (both verified against Paperless v2.20.15, API version 5):
 *
 * - `"index"` — the document endpoint (`PATCH /documents/{id}/`, used by
 *   `update_document`). Its serializer converts the submitted zero-based index
 *   into the stored option id, and converts back to the index on read.
 * - `"stored"` — the bulk endpoint (`POST /documents/bulk_edit/` →
 *   `modify_custom_fields`). It writes the submitted value straight into
 *   `value_select`, which must already be the stored form: the option id on
 *   2.17+ (`{id,label}` options) or the index on pre-2.17 (plain-string options).
 */
export type SelectValueEncoding = "index" | "stored";

interface NormalizedSelectOption {
  index: number;
  label: string;
  // Present on Paperless 2.17+ where options are {id, label}; absent on pre-2.17
  // instances where options are plain strings (the index is the stored form).
  id?: string;
}

function normalizeSelectOptions(field: CustomField): NormalizedSelectOption[] {
  const rawOptions = (
    field.extra_data as { select_options?: unknown } | null | undefined
  )?.select_options;
  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions.map((option, index) => {
    if (option && typeof option === "object") {
      const { id, label } = option as { id?: unknown; label?: unknown };
      return {
        index,
        label: typeof label === "string" ? label : String(label),
        id: typeof id === "string" ? id : undefined,
      };
    }
    return { index, label: String(option) };
  });
}

function findSelectOption(
  options: NormalizedSelectOption[],
  value: CustomFieldValue
): NormalizedSelectOption | undefined {
  if (typeof value === "string") {
    return (
      options.find((option) => option.label === value) ??
      options.find((option) => option.id === value)
    );
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return options.find((option) => option.index === value);
  }
  return undefined;
}

/**
 * Translates a `select` custom field value into the encoding Paperless-NGX
 * expects for the given write path (see {@link SelectValueEncoding}).
 *
 * Agents only ever see option labels (from `get_custom_field` /
 * `list_custom_fields`), and Paperless rejects the label outright. The supplied
 * value is matched against the field's `select_options` by label, then by option
 * id, then by index — so a label, a stored id read back from a document, or an
 * already-correct index all resolve. The matched option is then returned in the
 * requested encoding. Non-select fields and `null` (which clears the field) are
 * returned unchanged. An unmatched value throws an actionable error listing the
 * valid options instead of letting Paperless fail with a 400/500.
 */
export function resolveSelectCustomFieldValue(
  field: CustomField,
  value: CustomFieldValue,
  encoding: SelectValueEncoding = "index"
): CustomFieldValue {
  if (field.data_type !== "select" || value === null) {
    return value;
  }

  const options = normalizeSelectOptions(field);
  if (options.length === 0) {
    return value;
  }

  const option = findSelectOption(options, value);
  if (!option) {
    const optionList = options
      .map((o) => `${JSON.stringify(o.label)} (index ${o.index})`)
      .join(", ");
    throw new Error(
      `Invalid value ${JSON.stringify(value)} for select custom field ` +
        `"${field.name}" (id ${field.id}). Pass one of the option labels. ` +
        `Valid options: ${optionList}.`
    );
  }

  if (encoding === "stored") {
    return option.id ?? option.index;
  }
  return option.index;
}

/**
 * Resolves `select` custom field values to their Paperless-NGX encoding before a
 * document write. `encoding` selects the form required by the target endpoint
 * (see {@link SelectValueEncoding}). Each referenced field definition is fetched
 * once to detect select fields; values for other field types are left untouched.
 * If a field definition cannot be fetched, its value is passed through so
 * Paperless validates it as before.
 */
export async function resolveSelectCustomFieldValues(
  api: PaperlessAPI,
  customFields: CustomFieldInstanceRequest[] | undefined,
  encoding: SelectValueEncoding = "index"
): Promise<CustomFieldInstanceRequest[] | undefined> {
  if (!customFields || customFields.length === 0) {
    return customFields;
  }

  const uniqueFieldIds = [...new Set(customFields.map((cf) => cf.field))];
  const definitions = new Map<number, CustomField>();
  await Promise.all(
    uniqueFieldIds.map(async (id) => {
      try {
        definitions.set(id, await api.getCustomField(id));
      } catch {
        // Field definition unavailable: leave the value untouched and let
        // Paperless validate it as before.
      }
    })
  );

  return customFields.map((cf) => {
    const field = definitions.get(cf.field);
    if (!field || field.data_type !== "select") {
      return cf;
    }
    return { ...cf, value: resolveSelectCustomFieldValue(field, cf.value, encoding) };
  });
}
