import { PaperlessAPI } from "../../api/PaperlessAPI";
import {
  CustomField,
  CustomFieldInstanceRequest,
  CustomFieldValue,
} from "../../api/types";

/**
 * Encoding Paperless expects for a select value. On the supported API versions
 * (v9+) both `update_document` and `bulk_edit` take the option's stored form:
 * the option id on 2.17+ fields, or the index on pre-2.17 string-option fields.
 * The bare `index` form is retained for older API versions whose document
 * endpoint accepted the option index directly.
 */
export type SelectValueEncoding = "index" | "stored";

interface NormalizedSelectOption {
  index: number;
  label: string;
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
    const byLabel = options.find((option) => option.label === value);
    const byId = options.find((option) => option.id === value);
    if (byLabel && byId && byLabel.index !== byId.index) {
      throw new Error(
        `Ambiguous select value ${JSON.stringify(value)}: it matches one ` +
          `option's label and a different option's id.`
      );
    }
    return byLabel ?? byId;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return options.find((option) => option.index === value);
  }
  return undefined;
}

/** Translates a select value (label, option id, or index) to the `encoding` Paperless expects; throws on no match. */
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

  return encoding === "stored" ? option.id ?? option.index : option.index;
}

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
        // Definition unavailable; leave the value for Paperless to validate.
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
