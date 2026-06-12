import { PaperlessAPI } from "../../api/PaperlessAPI";
import {
  CustomField,
  CustomFieldInstanceRequest,
  CustomFieldValue,
} from "../../api/types";

interface NormalizedSelectOption {
  index: number;
  label: string;
  // Present on Paperless 2.17+ where options are {id, label}; absent on pre-2.17
  // instances where options are plain strings. Only used to recognise an
  // already-stored value being sent back.
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

/**
 * Translates a `select` custom field value into the encoding Paperless-NGX
 * expects on input: the option's **zero-based index** into `select_options`.
 *
 * Agents only ever see option labels (from `get_custom_field` /
 * `list_custom_fields`). Paperless rejects the label with an HTTP 500 because
 * its serializer does `select_options[value]` — i.e. it indexes the options
 * list with the supplied value and then resolves it to the stored option id.
 * Passing the label (or the stored id) is a string index into a list and raises
 * `TypeError: list indices must be integers`. The value must therefore be the
 * integer index; Paperless converts it to the stored id (2.17+) itself.
 *
 * The supplied value is matched against the field's `select_options` by label,
 * then by option id (so a value read back from a document round-trips), and an
 * existing valid index passes through. Non-select fields and `null` (which
 * clears the field) are returned unchanged. An unmatched value throws an
 * actionable error listing the valid options instead of letting Paperless 500.
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

  // Already the integer index Paperless expects.
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < options.length
  ) {
    return value;
  }

  if (typeof value === "string") {
    const byLabel = options.find((option) => option.label === value);
    if (byLabel) {
      return byLabel.index;
    }
    // A value previously read from a document comes back as the stored option
    // id; map it to its index so the round-trip succeeds.
    const byId = options.find((option) => option.id === value);
    if (byId) {
      return byId.index;
    }
  }

  const optionList = options
    .map((option) => `${JSON.stringify(option.label)} (index ${option.index})`)
    .join(", ");
  throw new Error(
    `Invalid value ${JSON.stringify(value)} for select custom field ` +
      `"${field.name}" (id ${field.id}). Pass one of the option labels. ` +
      `Valid options: ${optionList}.`
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
