import axios, { AxiosResponse } from "axios";
import FormData from "form-data";
import {
  BulkEditDocumentsResult,
  BulkEditParameters,
  Correspondent,
  CustomField,
  Document,
  DocumentsResponse,
  DocumentType,
  GetCorrespondentsResponse,
  GetCustomFieldsResponse,
  GetDocumentTypesResponse,
  GetMailAccountsResponse,
  GetMailRulesResponse,
  MailAccount,
  MailRule,
  GetTagsResponse,
  Note,
  Tag,
} from "./types";
import { headersToObject } from "./utils";

export class PaperlessAPI {
  private readonly apiVersion: string;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.apiVersion = process.env.PAPERLESS_API_VERSION || "5";
  }

  async request<T = any>(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/api${path}`;
    const isJson = !options.body || typeof options.body === "string";

    const mergedHeaders = {
      Authorization: `Token ${this.token}`,
      Accept: `application/json; version=${this.apiVersion}`,
      "Accept-Language": "en-US,en;q=0.9",
      ...(isJson ? { "Content-Type": "application/json" } : {}),
      ...headersToObject(options.headers),
    };

    try {
      const response = await axios<T>({
        url,
        method: options.method || "GET",
        headers: mergedHeaders,
        data: options.body,
      });

      const body = response.data;
      if (response.status < 200 || response.status >= 300) {
        console.error({
          error: "Error executing request",
          url,
          method: options.method || "GET",
          status: response.status,
          response: body,
        });
        const errorMessage =
          (body as Record<string, unknown>)?.detail ||
          (body as Record<string, unknown>)?.error ||
          (body as Record<string, unknown>)?.message ||
          `HTTP error! status: ${response.status}`;
        throw new Error(String(errorMessage));
      }

      return body;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 406) {
        throw new Error(
          `HTTP 406: Paperless-ngx rejected API version ${this.apiVersion}. ` +
            `Set the PAPERLESS_API_VERSION environment variable to match your server's API version (e.g., "10" for Paperless-ngx v3+).`
        );
      }
      console.error({
        error: "Error executing request",
        message: error instanceof Error ? error.message : String(error),
        url,
        method: options.method || "GET",
        responseData: axios.isAxiosError(error) ? error.response?.data : undefined,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
      });
      throw error;
    }
  }

  // Document operations
  async bulkEditDocuments(
    documents: number[],
    method: string,
    parameters: BulkEditParameters = {}
  ): Promise<BulkEditDocumentsResult> {
    return this.request<BulkEditDocumentsResult>("/documents/bulk_edit/", {
      method: "POST",
      body: JSON.stringify({
        documents,
        method,
        parameters,
      }),
    });
  }

  async postDocument(
    document: Buffer,
    filename: string,
    metadata: Record<string, string | string[] | number | number[]> = {}
  ): Promise<string> {
    const formData = new FormData();
    formData.append("document", document, { filename });

    // Add optional metadata fields
    if (metadata.title) formData.append("title", metadata.title);
    if (metadata.created) formData.append("created", metadata.created);
    if (metadata.correspondent)
      formData.append("correspondent", metadata.correspondent);
    if (metadata.document_type)
      formData.append("document_type", metadata.document_type);
    if (metadata.storage_path)
      formData.append("storage_path", metadata.storage_path);
    if (metadata.tags) {
      (metadata.tags as string[]).forEach((tag) =>
        formData.append("tags", tag)
      );
    }
    if (metadata.archive_serial_number) {
      formData.append(
        "archive_serial_number",
        String(metadata.archive_serial_number)
      );
    }
    if (metadata.custom_fields) {
      (metadata.custom_fields as number[]).forEach((field) =>
        formData.append("custom_fields", String(field))
      );
    }

    try {
      const response = await axios.post<string>(
        `${this.baseUrl}/api/documents/post_document/`,
        formData,
        {
          headers: {
            Authorization: `Token ${this.token}`,
            Accept: `application/json; version=${this.apiVersion}`,
            ...formData.getHeaders(),
          },
        }
      );

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 406) {
        throw new Error(
          `HTTP 406: Paperless-ngx rejected API version ${this.apiVersion}. ` +
            `Set the PAPERLESS_API_VERSION environment variable to match your server's API version (e.g., "10" for Paperless-ngx v3+).`
        );
      }
      throw error;
    }
  }

  async getDocuments(query = ""): Promise<DocumentsResponse> {
    return this.request<DocumentsResponse>(`/documents/${query}`);
  }

  async getDocument(id: number): Promise<Document> {
    return this.request<Document>(`/documents/${id}/`);
  }

  async updateDocument(id: number, data: Partial<Document>): Promise<Document> {
    return this.request<Document>(`/documents/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async searchDocuments(query: string): Promise<DocumentsResponse> {
    const response = await this.request<DocumentsResponse>(
      `/documents/?query=${encodeURIComponent(query)}`
    );
    return response;
  }

  async downloadDocument(
    id: number,
    asOriginal = false
  ): Promise<AxiosResponse<ArrayBuffer>> {
    const query = asOriginal ? "?original=true" : "";
    const response = await axios.get<ArrayBuffer>(
      `${this.baseUrl}/api/documents/${id}/download/${query}`,
      {
        headers: {
          Authorization: `Token ${this.token}`,
        },
        responseType: "arraybuffer",
      }
    );
    return response;
  }

  async getThumbnail(id: number): Promise<AxiosResponse<ArrayBuffer>> {
    const response = await axios.get<ArrayBuffer>(
      `${this.baseUrl}/api/documents/${id}/thumb/`,
      {
        headers: {
          Authorization: `Token ${this.token}`,
        },
        responseType: "arraybuffer",
      }
    );
    return response;
  }

  // Document note operations

  /**
   * Retrieve all notes attached to a document.
   * @param id - The document ID.
   * @returns The document's notes.
   */
  async getDocumentNotes(id: number): Promise<Note[]> {
    return this.request<Note[]>(`/documents/${id}/notes/`);
  }

  /**
   * Create a note on a document.
   * @param id - The document ID.
   * @param note - The note text to add.
   * @returns The document's full notes list after creation.
   */
  async createDocumentNote(id: number, note: string): Promise<Note[]> {
    return this.request<Note[]>(`/documents/${id}/notes/`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  }

  /**
   * Delete a note from a document by its note ID.
   * @param id - The document ID.
   * @param noteId - The ID of the note to delete.
   * @returns The document's remaining notes after deletion.
   */
  async deleteDocumentNote(id: number, noteId: number): Promise<Note[]> {
    return this.request<Note[]>(`/documents/${id}/notes/?id=${noteId}`, {
      method: "DELETE",
    });
  }

  // Tag operations
  async getTags(): Promise<GetTagsResponse> {
    return this.request<GetTagsResponse>("/tags/");
  }

  async createTag(data: Partial<Tag>): Promise<Tag> {
    return this.request<Tag>("/tags/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTag(id: number, data: Partial<Tag>): Promise<Tag> {
    return this.request<Tag>(`/tags/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id: number): Promise<void> {
    return this.request<void>(`/tags/${id}/`, {
      method: "DELETE",
    });
  }

  // Correspondent operations
  async getCorrespondents(
    queryString?: string
  ): Promise<GetCorrespondentsResponse> {
    const url = queryString
      ? `/correspondents/?${queryString}`
      : "/correspondents/";
    return this.request<GetCorrespondentsResponse>(url);
  }

  async getCorrespondent(id: number): Promise<Correspondent> {
    return this.request<Correspondent>(`/correspondents/${id}/`);
  }

  async createCorrespondent(
    data: Partial<Correspondent>
  ): Promise<Correspondent> {
    return this.request<Correspondent>("/correspondents/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCorrespondent(
    id: number,
    data: Partial<Correspondent>
  ): Promise<Correspondent> {
    return this.request<Correspondent>(`/correspondents/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteCorrespondent(id: number): Promise<void> {
    return this.request<void>(`/correspondents/${id}/`, {
      method: "DELETE",
    });
  }

  // Document type operations
  async getDocumentTypes(): Promise<GetDocumentTypesResponse> {
    return this.request<GetDocumentTypesResponse>("/document_types/");
  }

  async createDocumentType(data: Partial<DocumentType>): Promise<DocumentType> {
    return this.request<DocumentType>("/document_types/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateDocumentType(
    id: number,
    data: Partial<DocumentType>
  ): Promise<DocumentType> {
    return this.request<DocumentType>(`/document_types/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteDocumentType(id: number): Promise<void> {
    return this.request<void>(`/document_types/${id}/`, {
      method: "DELETE",
    });
  }

  // Mail account operations
  async getMailAccounts(queryString?: string): Promise<GetMailAccountsResponse> {
    const url = queryString
      ? `/mail_accounts/?${queryString}`
      : "/mail_accounts/";
    return this.request<GetMailAccountsResponse>(url);
  }

  async getMailAccount(id: number): Promise<MailAccount> {
    return this.request<MailAccount>(`/mail_accounts/${id}/`);
  }

  async processMailAccount(id: number): Promise<void> {
    return this.request<void>(`/mail_accounts/${id}/process/`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  // Mail rule operations
  async getMailRules(queryString?: string): Promise<GetMailRulesResponse> {
    const url = queryString ? `/mail_rules/?${queryString}` : "/mail_rules/";
    return this.request<GetMailRulesResponse>(url);
  }

  async getMailRule(id: number): Promise<MailRule> {
    return this.request<MailRule>(`/mail_rules/${id}/`);
  }

  async createMailRule(data: Partial<MailRule>): Promise<MailRule> {
    return this.request<MailRule>("/mail_rules/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateMailRule(id: number, data: Partial<MailRule>): Promise<MailRule> {
    return this.request<MailRule>(`/mail_rules/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteMailRule(id: number): Promise<void> {
    return this.request<void>(`/mail_rules/${id}/`, {
      method: "DELETE",
    });
  }

  // Custom field operations
  async getCustomFields(): Promise<GetCustomFieldsResponse> {
    return this.request<GetCustomFieldsResponse>("/custom_fields/");
  }

  async getCustomField(id: number): Promise<CustomField> {
    return this.request<CustomField>(`/custom_fields/${id}/`);
  }

  async createCustomField(data: Partial<CustomField>): Promise<CustomField> {
    return this.request<CustomField>("/custom_fields/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCustomField(
    id: number,
    data: Partial<CustomField>
  ): Promise<CustomField> {
    return this.request<CustomField>(`/custom_fields/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteCustomField(id: number): Promise<void> {
    return this.request<void>(`/custom_fields/${id}/`, {
      method: "DELETE",
    });
  }

  // Bulk object operations
  async bulkEditObjects(objects, objectType, operation, parameters = {}) {
    return this.request("/bulk_edit_objects/", {
      method: "POST",
      body: JSON.stringify({
        objects,
        object_type: objectType,
        operation,
        ...parameters,
      }),
    });
  }
}
