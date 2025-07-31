import axios from "axios";
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
  GetTagsResponse,
  Tag,
} from "./types";
import { headersToObject } from "./utils";

export class PaperlessAPI {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request<T = any>(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/api${path}`;
    const isJson = !options.body || typeof options.body === "string";

    const mergedHeaders = {
      Authorization: `Token ${this.token}`,
      Accept: "application/json; version=5",
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
          options,
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
      console.error({
        error: "Error executing request",
        message: error instanceof Error ? error.message : String(error),
        url,
        options,
        responseData: (error as any)?.response?.data,
        status: (error as any)?.response?.status,
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
    file: File,
    metadata: Record<string, string | string[] | number | number[]> = {}
  ): Promise<string> {
    const formData = new FormData();
    formData.append("document", file);

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
      formData.append("archive_serial_number", metadata.archive_serial_number);
    }
    if (metadata.custom_fields) {
      (metadata.custom_fields as string[]).forEach((field) =>
        formData.append("custom_fields", field)
      );
    }

    const response = await axios.post<string>(
      `${this.baseUrl}/api/documents/post_document/`,
      formData,
      {
        headers: {
          Authorization: `Token ${this.token}`,
          ...formData.getHeaders(),
        },
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.data;
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

  async downloadDocument(id: number, asOriginal = false) {
    const query = asOriginal ? "?original=true" : "";
    const response = await axios.get(
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
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id: number): Promise<void> {
    return this.request<void>(`/tags/${id}/`, {
      method: "DELETE",
    });
  }

  // Correspondent operations
  async getCorrespondents(): Promise<GetCorrespondentsResponse> {
    return this.request<GetCorrespondentsResponse>("/correspondents/");
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
      method: "PUT",
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
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteDocumentType(id: number): Promise<void> {
    return this.request<void>(`/document_types/${id}/`, {
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
      method: "PUT",
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
