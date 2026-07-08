import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { withErrorHandling } from "./utils/middlewares";

export function registerNoteTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_document_notes",
    "List all notes attached to a document. Notes are free-text comments on a document and are the natural place for an audit trail (e.g. \"invoice paid on X from account Y\") or progress notes on an action item.",
    {
      id: z.number().describe("The document ID"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const notes = await api.getDocumentNotes(args.id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(notes),
          },
        ],
      };
    })
  );

  server.tool(
    "create_document_note",
    "Add a note to a document. Use this to record an audit trail or progress note directly on the document. Returns the document's full list of notes after the note is added.",
    {
      id: z.number().describe("The document ID"),
      note: z.string().min(1).describe("The note text to add"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const notes = await api.createDocumentNote(args.id, args.note);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(notes),
          },
        ],
      };
    })
  );

  server.tool(
    "delete_document_note",
    "Delete a single note from a document by its note ID. Returns the document's remaining notes.",
    {
      id: z.number().describe("The document ID"),
      note_id: z.number().describe("The ID of the note to delete"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const notes = await api.deleteDocumentNote(args.id, args.note_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(notes),
          },
        ],
      };
    })
  );
}
