export interface Tag {
  id: number;
  slug: string;
  name: string;
  color: string;
  text_color: string;
  match: string;
  matching_algorithm: number;
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
  extra_data?: any;
  document_count: number;
}

export interface CustomFieldInstance {
  field: number;
  value: string | number | boolean | object | null;
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
  notes: any[];
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
  matching_algorithm: number;
  is_insensitive: boolean;
  document_count: number;
  last_correspondence: string;
  owner: number | null;
  permissions: any;
  user_can_change: boolean;
}

export interface GetCorrespondentsResponse
  extends PaginationResponse<Correspondent> {}

export interface DocumentType {
  id: number;
  slug: string;
  name: string;
  match: string;
  matching_algorithm: number;
  is_insensitive: boolean;
  document_count: number;
  last_correspondence: string;
  owner: number | null;
  permissions: any;
  user_can_change: boolean;
}

export interface GetDocumentTypesResponse
  extends PaginationResponse<DocumentType> {}

export interface BulkEditDocumentsResult {
  result: string;
}

export interface BulkEditParameters {
  add_custom_fields?: Record<string, string | number | boolean | null>;
  remove_custom_fields?: Record<string, string | number | boolean | null>;
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
