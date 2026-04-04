import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerSystemTools } from "./system";
import { createMockServer, createMockApi, getTextContent } from "./test-helpers";

describe("System tools registration", () => {
  test("registers all expected system tools", () => {
    const { server, tools } = createMockServer();
    const api = createMockApi();
    registerSystemTools(server, api);

    const expectedTools = [
      "get_statistics",
      "get_document_suggestions",
      "get_document_metadata",
      "list_document_notes",
      "create_document_note",
      "delete_document_note",
      "delete_document",
      "list_trash",
      "restore_from_trash",
      "empty_trash",
      "search_autocomplete",
      "get_next_asn",
      "list_tasks",
      "acknowledge_tasks",
      "bulk_download",
    ];

    for (const name of expectedTools) {
      assert.ok(tools.has(name), `Tool '${name}' should be registered`);
    }
  });
});

describe("delete_document tool", () => {
  test("requires confirm=true", async () => {
    const { server, tools } = createMockServer();
    const api = createMockApi({
      deleteDocument: async () => {},
    });
    registerSystemTools(server, api);

    const tool = tools.get("delete_document")!;
    await assert.rejects(
      () => tool.callback({ id: 1, confirm: false }),
      (err: Error) => {
        assert.match(err.message, /[Cc]onfirmation required/);
        return true;
      }
    );
  });

  test("calls deleteDocument when confirmed", async () => {
    let deletedId: number | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      deleteDocument: async (id: number) => {
        deletedId = id;
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("delete_document")!;
    const result = await tool.callback({ id: 42, confirm: true });
    assert.equal(deletedId, 42);
    assert.deepEqual(getTextContent(result), { status: "deleted" });
  });
});

describe("delete_document_note tool", () => {
  test("requires confirm=true", async () => {
    const { server, tools } = createMockServer();
    const api = createMockApi();
    registerSystemTools(server, api);

    const tool = tools.get("delete_document_note")!;
    await assert.rejects(
      () => tool.callback({ id: 1, note_id: 2, confirm: false }),
      (err: Error) => {
        assert.match(err.message, /[Cc]onfirmation required/);
        return true;
      }
    );
  });

  test("calls correct endpoint with path segment (not query param)", async () => {
    let calledPath: string | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (path: string, opts: any) => {
        calledPath = path;
        return {};
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("delete_document_note")!;
    await tool.callback({ id: 5, note_id: 10, confirm: true });

    // Should use path segment, NOT query parameter
    assert.equal(calledPath, "/documents/5/notes/10/");
    assert.ok(!calledPath!.includes("?id="), "Should not use query param for note_id");
  });
});

describe("empty_trash tool", () => {
  test("requires confirm=true", async () => {
    const { server, tools } = createMockServer();
    const api = createMockApi();
    registerSystemTools(server, api);

    const tool = tools.get("empty_trash")!;
    await assert.rejects(
      () => tool.callback({ confirm: false }),
      (err: Error) => {
        assert.match(err.message, /[Cc]onfirmation required/);
        return true;
      }
    );
  });

  test("uses 'empty' action (not 'delete')", async () => {
    let sentBody: any;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (_path: string, opts: any) => {
        sentBody = JSON.parse(opts.body);
        return {};
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("empty_trash")!;
    await tool.callback({ documents: [1, 2], confirm: true });

    assert.equal(sentBody.action, "empty");
    assert.notEqual(sentBody.action, "delete");
  });

  test("allows omitting documents array (empty entire trash)", async () => {
    let sentBody: any;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (_path: string, opts: any) => {
        sentBody = JSON.parse(opts.body);
        return {};
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("empty_trash")!;
    await tool.callback({ confirm: true });

    assert.equal(sentBody.action, "empty");
    assert.equal(sentBody.documents, undefined);
  });
});

describe("list_tasks tool", () => {
  test("uses supported filter parameters", async () => {
    let calledPath: string | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (path: string) => {
        calledPath = path;
        return [];
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("list_tasks")!;
    await tool.callback({ status: "complete", task_name: "consume" });

    assert.ok(calledPath!.includes("status=complete"));
    assert.ok(calledPath!.includes("task_name=consume"));
    // Should NOT have task_id
    assert.ok(!calledPath!.includes("task_id"));
  });

  test("works with no filters", async () => {
    let calledPath: string | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (path: string) => {
        calledPath = path;
        return [];
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("list_tasks")!;
    await tool.callback({});

    assert.equal(calledPath, "/tasks/");
  });
});

describe("create_document_note tool", () => {
  test("sends note in request body", async () => {
    let sentBody: any;
    let calledPath: string | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (path: string, opts: any) => {
        calledPath = path;
        sentBody = JSON.parse(opts.body);
        return { id: 1, note: "test note" };
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("create_document_note")!;
    await tool.callback({ id: 5, note: "my note" });

    assert.equal(calledPath, "/documents/5/notes/");
    assert.deepEqual(sentBody, { note: "my note" });
  });
});

describe("restore_from_trash tool", () => {
  test("sends restore action with document IDs", async () => {
    let sentBody: any;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (_path: string, opts: any) => {
        sentBody = JSON.parse(opts.body);
        return {};
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("restore_from_trash")!;
    await tool.callback({ documents: [1, 2, 3] });

    assert.equal(sentBody.action, "restore");
    assert.deepEqual(sentBody.documents, [1, 2, 3]);
  });
});

describe("get_statistics tool", () => {
  test("calls statistics endpoint", async () => {
    let calledPath: string | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      request: async (path: string) => {
        calledPath = path;
        return { documents_total: 100 };
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("get_statistics")!;
    const result = await tool.callback({});

    assert.equal(calledPath, "/statistics/");
    assert.deepEqual(getTextContent(result), { documents_total: 100 });
  });
});

describe("bulk_download tool", () => {
  test("calls requestRaw with POST and arraybuffer responseType", async () => {
    let calledPath: string | undefined;
    let calledOpts: any;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      requestRaw: async (path: string, opts: any) => {
        calledPath = path;
        calledOpts = opts;
        return { data: Buffer.from("fake-zip") };
      },
    });
    registerSystemTools(server, api);

    const tool = tools.get("bulk_download")!;
    const result = await tool.callback({ documents: [1, 2] });

    assert.equal(calledPath, "/documents/bulk_download/");
    assert.equal(calledOpts.method, "POST");
    assert.equal(calledOpts.responseType, "arraybuffer");

    const resource = result.content.find((c: any) => c.type === "resource");
    assert.ok(resource);
    assert.equal(resource.resource.mimeType, "application/zip");
  });
});
