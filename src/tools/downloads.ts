import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { Downloads } from "../downloads";
import { withErrorHandling } from "./utils/middlewares";

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

// The link uses the caller's own token, so a document the caller cannot view
// must never get a link: this check fails when Paperless would refuse it.
async function checkCaller(api: PaperlessAPI, documentId: number) {
  await api.request(`/documents/${documentId}/?fields=id`);
}

export function registerDownloadTools(
  server: McpServer,
  api: PaperlessAPI,
  downloads: Downloads,
  callerToken: string
) {
  server.tool(
    "request_download",
    "Make a single-use link to download the file of one document from Paperless. Use it instead of get_document_content to hand the file to a person, for example on a phone. " +
      "The link works one time and expires after 15 minutes.",
    {
      document_id: z.number().describe("The ID of the document to download"),
      original: z
        .boolean()
        .optional()
        .describe("Download the original file instead of the archived PDF"),
    },
    withErrorHandling(async (args) => {
      await checkCaller(api, args.document_id);
      const link = downloads.request(
        args.document_id,
        callerToken,
        args.original ?? false
      );
      return jsonResult({
        ...link,
        note: "The link works once, for 15 minutes.",
      });
    })
  );
}
