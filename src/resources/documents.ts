import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  BlobResourceContents,
  ReadResourceResult,
  TextResourceContents,
} from "@modelcontextprotocol/sdk/types";
import type { AxiosResponse } from "axios";
import { PaperlessAPI } from "../api/PaperlessAPI";

type TemplateVariables = Record<string, string | string[]>;

export function registerDocumentResources(server: McpServer, api: PaperlessAPI) {
  server.resource(
    "paperless-document-resource",
    new ResourceTemplate("paperless://documents/{id}/{resource}", {
      list: undefined,
    }),
    async (uri, variables) => readDocumentResource(api, uri, variables)
  );

  server.resource(
    "paperless-document-original-download",
    new ResourceTemplate("paperless://documents/{id}/download{?original}", {
      list: undefined,
    }),
    async (uri, variables) =>
      readDocumentDownloadResource(
        api,
        uri,
        parseDocumentId(readVariable(variables, "id")),
        isTrueQueryValue(readVariable(variables, "original"))
      )
  );
}

export async function readDocumentResource(
  api: PaperlessAPI,
  uri: URL,
  variables: TemplateVariables
): Promise<ReadResourceResult> {
  assertPaperlessDocumentsUri(uri);

  const id = parseDocumentId(readVariable(variables, "id"));
  const resource = readVariable(variables, "resource").split("?")[0];

  switch (resource) {
    case "download":
      return readDocumentDownloadResource(
        api,
        uri,
        id,
        isTrueQueryValue(uri.searchParams.get("original") || undefined)
      );
    case "thumbnail":
    case "thumb":
      return readDocumentThumbnailResource(api, uri, id);
    default:
      throw new Error(`Unsupported Paperless document resource: ${resource}`);
  }
}

async function readDocumentDownloadResource(
  api: PaperlessAPI,
  uri: URL,
  id: number,
  original: boolean
): Promise<ReadResourceResult> {
  const response = await api.downloadDocument(id, original);
  return {
    contents: [
      responseToResourceContents(uri.href, response, "application/octet-stream"),
    ],
  };
}

async function readDocumentThumbnailResource(
  api: PaperlessAPI,
  uri: URL,
  id: number
): Promise<ReadResourceResult> {
  const response = await api.getThumbnail(id);
  return {
    contents: [responseToResourceContents(uri.href, response, "image/webp")],
  };
}

function responseToResourceContents(
  uri: string,
  response: AxiosResponse<ArrayBuffer>,
  fallbackMimeType: string
): TextResourceContents | BlobResourceContents {
  const mimeType = getHeader(response, "content-type") || fallbackMimeType;
  const data = Buffer.from(response.data);

  if (isTextMimeType(mimeType)) {
    return {
      uri,
      mimeType,
      text: data.toString("utf8"),
    };
  }

  return {
    uri,
    mimeType,
    blob: data.toString("base64"),
  };
}

function assertPaperlessDocumentsUri(uri: URL): void {
  if (uri.protocol !== "paperless:" || uri.hostname !== "documents") {
    throw new Error(`Unsupported Paperless resource URI: ${uri.href}`);
  }
}

function parseDocumentId(idValue: string): number {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid Paperless document id in resource URI: ${idValue}`);
  }
  return id;
}

function readVariable(variables: TemplateVariables, name: string): string {
  const value = variables[name];
  const stringValue = Array.isArray(value) ? value[0] : value;
  if (!stringValue) {
    throw new Error(`Missing ${name} in Paperless resource URI`);
  }
  return stringValue;
}

function isTrueQueryValue(value?: string): boolean {
  return value === "true" || value === "1";
}

function getHeader(
  response: AxiosResponse<ArrayBuffer>,
  headerName: string
): string | undefined {
  const headers = response.headers as Record<string, unknown> & {
    get?: (name: string) => unknown;
  };

  if (typeof headers.get === "function") {
    const value = headers.get(headerName);
    if (typeof value === "string") {
      return value;
    }
  }

  const value = headers[headerName] || headers[headerName.toLowerCase()];
  if (Array.isArray(value)) {
    return String(value[0]);
  }
  return typeof value === "string" ? value : undefined;
}

function isTextMimeType(mimeType: string): boolean {
  const normalizedMimeType = mimeType.split(";")[0].trim().toLowerCase();
  return (
    normalizedMimeType.startsWith("text/") ||
    normalizedMimeType === "application/json" ||
    normalizedMimeType === "application/xml" ||
    normalizedMimeType.endsWith("+json") ||
    normalizedMimeType.endsWith("+xml")
  );
}
