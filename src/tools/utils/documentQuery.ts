import { z } from "zod";

const CUSTOM_FIELD_QUERY_GROUP_OPERATORS = ["AND", "OR"] as const;

const customFieldQueryPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const customFieldQueryValueSchema = z.union([
  customFieldQueryPrimitiveSchema,
  z.array(customFieldQueryPrimitiveSchema),
]);

export type CustomFieldQueryValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

export type CustomFieldQuery =
  | [fieldName: string, operator: string, value: CustomFieldQueryValue]
  | [
      groupOperator: (typeof CUSTOM_FIELD_QUERY_GROUP_OPERATORS)[number],
      clauses: CustomFieldQuery[],
    ];

function isCustomFieldQueryPrimitive(value: unknown) {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function isCustomFieldQueryValue(value: unknown): value is CustomFieldQueryValue {
  if (isCustomFieldQueryPrimitive(value)) {
    return true;
  }

  return (
    Array.isArray(value) && value.every((item) => isCustomFieldQueryPrimitive(item))
  );
}

function isCustomFieldQuery(value: unknown): value is CustomFieldQuery {
  if (!Array.isArray(value)) {
    return false;
  }

  if (
    value.length === 3 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    isCustomFieldQueryValue(value[2])
  ) {
    return true;
  }

  if (
    value.length === 2 &&
    typeof value[0] === "string" &&
    CUSTOM_FIELD_QUERY_GROUP_OPERATORS.includes(
      value[0] as (typeof CUSTOM_FIELD_QUERY_GROUP_OPERATORS)[number]
    ) &&
    Array.isArray(value[1]) &&
    value[1].length >= 1
  ) {
    return value[1].every((item) => isCustomFieldQuery(item));
  }

  return false;
}

export const customFieldQuerySchema = z
  .array(z.unknown())
  .superRefine((value, ctx) => {
    if (!isCustomFieldQuery(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Invalid custom_field_query. Use [field_name, operator, value] or ['AND'|'OR', [clause1, clause2]].",
      });
    }
  }) as unknown as z.ZodType<CustomFieldQuery>;

const paperlessFilterScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]);

export const paperlessFilterValueSchema = z.union([
  paperlessFilterScalarSchema,
  z.array(paperlessFilterScalarSchema),
]);

export const paperlessFiltersSchema = z.record(paperlessFilterValueSchema);

export const LIST_DOCUMENTS_ARGS_SHAPE = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  search: z.string().optional(),
  correspondent: z.number().optional(),
  document_type: z.number().optional(),
  tag: z.number().optional(),
  storage_path: z.number().optional(),
  created__date__gte: z.string().optional(),
  created__date__lte: z.string().optional(),
  ordering: z.string().optional(),
};

export const QUERY_DOCUMENTS_ARGS_SHAPE = {
  ...LIST_DOCUMENTS_ARGS_SHAPE,
  query: z.string().optional(),
  more_like_id: z.number().optional(),
  custom_field_query: customFieldQuerySchema
    .optional()
    .describe(
      "Paperless custom field query. Use [field_name, operator, value] for a single clause or ['AND'|'OR', [clause1, clause2]] for grouped clauses."
    ),
  paperless_filters: paperlessFiltersSchema
    .optional()
    .describe(
      "Additional documented /api/documents/ Paperless filters. Keys must match Paperless query parameter names exactly. Prefer first-class arguments when available."
    ),
};

export const SEARCH_DOCUMENTS_ARGS_SHAPE = {
  query: z.string(),
};

export const queryDocumentsArgsSchema = z.object(QUERY_DOCUMENTS_ARGS_SHAPE);

export type QueryDocumentsArgs = z.infer<typeof queryDocumentsArgsSchema>;
export type BuildDocumentQueryArgs = Partial<QueryDocumentsArgs>;

const FIRST_CLASS_QUERY_PARAM_MAP = {
  page: "page",
  page_size: "page_size",
  ordering: "ordering",
  query: "query",
  search: "search",
  more_like_id: "more_like_id",
  correspondent: "correspondent__id",
  document_type: "document_type__id",
  tag: "tags__id",
  storage_path: "storage_path__id",
  created__date__gte: "created__date__gte",
  created__date__lte: "created__date__lte",
} as const;

type FirstClassQueryArg = keyof typeof FIRST_CLASS_QUERY_PARAM_MAP;

// Derived from the documented /api/documents/ query parameters in Paperless_ngx_REST_API.yaml.
export const DOCUMENT_QUERY_PAPERLESS_FILTER_KEYS = [
  "added__date__gt",
  "added__date__gte",
  "added__date__lt",
  "added__date__lte",
  "added__day",
  "added__gt",
  "added__gte",
  "added__lt",
  "added__lte",
  "added__month",
  "added__year",
  "archive_serial_number",
  "archive_serial_number__gt",
  "archive_serial_number__gte",
  "archive_serial_number__isnull",
  "archive_serial_number__lt",
  "archive_serial_number__lte",
  "checksum__icontains",
  "checksum__iendswith",
  "checksum__iexact",
  "checksum__istartswith",
  "content__icontains",
  "content__iendswith",
  "content__iexact",
  "content__istartswith",
  "correspondent__id",
  "correspondent__id__in",
  "correspondent__id__none",
  "correspondent__isnull",
  "correspondent__name__icontains",
  "correspondent__name__iendswith",
  "correspondent__name__iexact",
  "correspondent__name__istartswith",
  "created__date__gt",
  "created__date__gte",
  "created__date__lt",
  "created__date__lte",
  "created__day",
  "created__gt",
  "created__gte",
  "created__lt",
  "created__lte",
  "created__month",
  "created__year",
  "custom_field_query",
  "custom_fields__icontains",
  "custom_fields__id__all",
  "custom_fields__id__in",
  "custom_fields__id__none",
  "document_type__id",
  "document_type__id__in",
  "document_type__id__none",
  "document_type__isnull",
  "document_type__name__icontains",
  "document_type__name__iendswith",
  "document_type__name__iexact",
  "document_type__name__istartswith",
  "fields",
  "full_perms",
  "has_custom_fields",
  "id",
  "id__in",
  "is_in_inbox",
  "is_tagged",
  "mime_type",
  "modified__date__gt",
  "modified__date__gte",
  "modified__date__lt",
  "modified__date__lte",
  "modified__day",
  "modified__gt",
  "modified__gte",
  "modified__lt",
  "modified__lte",
  "modified__month",
  "modified__year",
  "ordering",
  "original_filename__icontains",
  "original_filename__iendswith",
  "original_filename__iexact",
  "original_filename__istartswith",
  "owner__id",
  "owner__id__in",
  "owner__id__none",
  "owner__isnull",
  "page",
  "page_size",
  "search",
  "shared_by__id",
  "storage_path__id",
  "storage_path__id__in",
  "storage_path__id__none",
  "storage_path__isnull",
  "storage_path__name__icontains",
  "storage_path__name__iendswith",
  "storage_path__name__iexact",
  "storage_path__name__istartswith",
  "tags__id",
  "tags__id__all",
  "tags__id__in",
  "tags__id__none",
  "tags__name__icontains",
  "tags__name__iendswith",
  "tags__name__iexact",
  "tags__name__istartswith",
  "title__icontains",
  "title__iendswith",
  "title__iexact",
  "title__istartswith",
  "title_content",
] as const;

const DOCUMENT_QUERY_PAPERLESS_FILTER_KEY_SET: ReadonlySet<string> = new Set(
  DOCUMENT_QUERY_PAPERLESS_FILTER_KEYS
);

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

function setQueryParam(
  query: URLSearchParams,
  key: string,
  value: unknown,
  jsonEncode = false
) {
  if (jsonEncode) {
    query.set(key, JSON.stringify(value));
    return;
  }

  if (Array.isArray(value)) {
    query.set(key, value.map((item) => String(item)).join(","));
    return;
  }

  query.set(key, String(value));
}

export function buildDocumentQueryString(args: BuildDocumentQueryArgs): string {
  const query = new URLSearchParams();
  const firstClassKeys = new Set<string>();

  for (const [argName, queryParamName] of Object.entries(
    FIRST_CLASS_QUERY_PARAM_MAP
  ) as [FirstClassQueryArg, (typeof FIRST_CLASS_QUERY_PARAM_MAP)[FirstClassQueryArg]][]) {
    const value = args[argName];
    if (!hasValue(value)) {
      continue;
    }

    setQueryParam(query, queryParamName, value as string | number | boolean);
    firstClassKeys.add(queryParamName);
  }

  if (hasValue(args.custom_field_query)) {
    setQueryParam(query, "custom_field_query", args.custom_field_query, true);
    firstClassKeys.add("custom_field_query");
  }

  if (!args.paperless_filters) {
    return query.toString() ? `?${query.toString()}` : "";
  }

  for (const [key, value] of Object.entries(args.paperless_filters)) {
    if (!DOCUMENT_QUERY_PAPERLESS_FILTER_KEY_SET.has(key)) {
      throw new Error(
        `Unsupported paperless_filters key '${key}'. Use documented /api/documents/ query parameter names only.`
      );
    }

    if (firstClassKeys.has(key)) {
      throw new Error(
        `Duplicate filter '${key}' provided both as a first-class argument and in paperless_filters.`
      );
    }

    setQueryParam(query, key, value);
  }

  return query.toString() ? `?${query.toString()}` : "";
}
