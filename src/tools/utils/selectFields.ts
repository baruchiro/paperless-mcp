import { PaperlessAPI } from "../../api/PaperlessAPI";
import {
  CustomField,
  CustomFieldInstanceRequest,
  CustomFieldValue,
} from "../../api/types";

interface NormalizedSelectOption {
  index: number;
  // The value Paperless stores for the option: its id on 2.17+ (a short hashed
  // string) or its zero-based index on pre-2.17 instances (plain-string options).
  storedValue: string | number;
  label: string;
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
        storedValue: typeof id === "string" || typeof id === "number" ? id : index,
        label: typeof label === "string" ? label : String(label),
      };
    }
    return { index, storedValue: index, label: String(option) };
  });
}

/**
 * Translates a `select` custom field value into the encoding Paperless-NGX
 * stores. Agents only ever see option labels (from `get_custom_field` /
 * `list_custom_fields`), but Paperless rejects the label string with an HTTP
 * 500: it expects the option id (2.17+) or its zero-based index (pre-2.17).
 *
 * The supplied value is matched against the field's `select_options` by label
 * first, then by its already-encoded form (so a correct id/index passes through
 * untouched). Values for non-select fields and `null` (which clears the field)
 * are returned unchanged. An unmatched value throws an actionable error listing
 * the valid options instead of letting Paperless 500.
 */
export function resolveSelectCustomFieldValue(
  field: CustomField,
  value: CustomFieldValue
): CustomFieldValue {
  if (field.data_type !== "select" || value === null) {
    return value;
  }

  const options = normalizeSelectOptions(field);
  if (options.length === 0) {
    return value;
  }

  if (typeof value === "string") {
    const byLabel = options.find((option) => option.label === value);
    if (byLabel) {
      return byLabel.storedValue;
    }
  }

  const alreadyEncoded = options.some((option) => option.storedValue === value);
  if (alreadyEncoded) {
    return value;
  }

  const optionList = options
    .map(
      (option) =>
        `${JSON.stringify(option.label)} → ${JSON.stringify(option.storedValue)}`
    )
    .join(", ");
  throw new Error(
    `Invalid value ${JSON.stringify(value)} for select custom field ` +
      `"${field.name}" (id ${field.id}). Pass one of the option labels (or its ` +
      `stored value). Valid options: ${optionList}.`
  );
}

/**
 * Resolves `select` custom field values to their Paperless-NGX encoding before
 * a document write. Each referenced field definition is fetched once to detect
 * select fields; values for other field types are left untouched. If a field
 * definition cannot be fetched, its value is passed through so Paperless
 * validates it as before.
 */
export async function resolveSelectCustomFieldValues(
  api: PaperlessAPI,
  customFields: CustomFieldInstanceRequest[] | undefined
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
    return { ...cf, value: resolveSelectCustomFieldValue(field, cf.value) };
  });
}
