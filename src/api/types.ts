export const MATCHING_ALGORITHM_OPTIONS = {
  0: "None",
  1: "Any word",
  2: "All words",
  3: "Exact match",
  4: "Regular expression",
  5: "Fuzzy word",
  6: "Automatic",
} as const;

export type MatchingAlgorithm = keyof typeof MATCHING_ALGORITHM_OPTIONS;

export const MATCHING_ALGORITHM_DESCRIPTION = `Matching algorithm: ${Object.entries(
  MATCHING_ALGORITHM_OPTIONS
)
  .map(([id, name]) => `${id}=${name}`)
  .join(", ")}`;

export interface Tag {
  id: number;
  slug: string;
  name: string;
  color: string;
  text_color: string;
  match: string;
  matching_algorithm: MatchingAlgorithm;
  is_insensitive: boolean;
  is_inbox_tag: boolean;
  document_count: number;
  owner: number | null;
  user_can_change: boolean;
}

export interface CustomField {
  id: number;
  name: string;
  data_type: string;
  extra_data?: Record<string, unknown> | null;
  document_count: number;
}

export type CustomFieldValue = string | number | boolean | number[] | null;

export interface CustomFieldInstance {
  field: number;
  value: CustomFieldValue;
}

export interface CustomFieldInstanceRequest {
  field: number;
  value: CustomFieldValue;
}

export interface PaginationResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  all: number[];
  results: T[];
}

export interface GetTagsResponse extends PaginationResponse<Tag> {}

export interface GetCustomFieldsResponse
  extends PaginationResponse<CustomField> {}

export interface BasicUser {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
}

export interface Note {
  id: number;
  note: string;
  created: string;
  user: BasicUser;
}

export interface DocumentsResponse extends PaginationResponse<Document> {}

export interface Document {
  id: number;
  correspondent: number | null;
  document_type: number | null;
  storage_path: string | null;
  title: string;
  content: string | null;
  tags: number[];
  created: string;
  created_date: string;
  modified: string;
  added: string;
  deleted_at: string | null;
  archive_serial_number: string | null;
  original_file_name: string;
  archived_file_name: string;
  owner: number | null;
  user_can_change: boolean;
  is_shared_by_requester: boolean;
  notes: Note[];
  custom_fields: CustomFieldInstance[];
  page_count: number;
  mime_type: string;
  __search_hit__?: SearchHit;
}

export interface SearchHit {
  score: number;
  highlights: string;
  note_highlights: string;
  rank: number;
}

export interface Correspondent {
  id: number;
  slug: string;
  name: string;
  match: string;
  matching_algorithm: MatchingAlgorithm;
  is_insensitive: boolean;
  document_count: number;
  last_correspondence: string;
  owner: number | null;
  permissions: Record<string, unknown>;
  user_can_change: boolean;
}

export interface GetCorrespondentsResponse
  extends PaginationResponse<Correspondent> {}

export interface DocumentType {
  id: number;
  slug: string;
  name: string;
  match: string;
  matching_algorithm: MatchingAlgorithm;
  is_insensitive: boolean;
  document_count: number;
  last_correspondence: string;
  owner: number | null;
  permissions: Record<string, unknown>;
  user_can_change: boolean;
}

export interface GetDocumentTypesResponse
  extends PaginationResponse<DocumentType> {}

export interface MailAccount {
  id: number;
  name: string;
  imap_server: string;
  imap_port: number | null;
  imap_security: number;
  username: string;
  password?: string;
  character_set: string;
  is_token: boolean;
  owner: number | null;
  user_can_change: boolean;
  account_type: number;
  expiration: string | null;
}

export interface GetMailAccountsResponse
  extends PaginationResponse<MailAccount> {}

export interface MailRule {
  id: number;
  name: string;
  account: number;
  enabled: boolean;
  folder: string;
  filter_from: string | null;
  filter_to: string | null;
  filter_subject: string | null;
  filter_body: string | null;
  filter_attachment_filename_include: string | null;
  filter_attachment_filename_exclude: string | null;
  maximum_age: number;
  action: number;
  action_parameter: string | null;
  assign_title_from: number;
  assign_tags: Array<number | null>;
  assign_correspondent_from: number;
  assign_correspondent: number | null;
  assign_document_type: number | null;
  assign_owner_from_rule: boolean;
  order: number;
  attachment_type: number;
  consumption_scope: number;
  pdf_layout: number;
  owner: number | null;
  user_can_change: boolean;
}

export interface GetMailRulesResponse extends PaginationResponse<MailRule> {}

export interface BulkEditDocumentsResult {
  result: string;
}

export interface BulkEditParameters {
  add_custom_fields?: Record<string, CustomFieldInstanceRequest["value"]>;
  remove_custom_fields?: number[];
  add_tags?: number[];
  remove_tags?: number[];
  degrees?: number;
  pages?: string;
  metadata_document_id?: number;
  delete_originals?: boolean;
  correspondent?: number;
  document_type?: number;
  storage_path?: number;
  tag?: number;
  permissions?: {
    owner?: number | null;
    set_permissions?: {
      view: { users: number[]; groups: number[] };
      change: { users: number[]; groups: number[] };
    };
    merge?: boolean;
  };
}
