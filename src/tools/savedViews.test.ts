import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerSavedViewTools } from "./savedViews";
import { createMockServer, createMockApi, getTextContent } from "./test-helpers";

describe("Saved view tools registration", () => {
  test("registers all expected saved view tools", () => {
    const { server, tools } = createMockServer();
    const api = createMockApi();
    registerSavedViewTools(server, api);

    const expectedTools = [
      "list_saved_views",
      "get_saved_view",
      "create_saved_view",
      "update_saved_view",
      "delete_saved_view",
    ];

    for (const name of expectedTools) {
      assert.ok(tools.has(name), `Tool '${name}' should be registered`);
    }
  });
});

describe("list_saved_views tool", () => {
  test("calls getSavedViews API method", async () => {
    let called = false;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      getSavedViews: async () => {
        called = true;
        return { count: 0, results: [] };
      },
    });
    registerSavedViewTools(server, api);

    const tool = tools.get("list_saved_views")!;
    await tool.callback({});
    assert.ok(called);
  });
});

describe("get_saved_view tool", () => {
  test("calls getSavedView with correct ID", async () => {
    let calledId: number | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      getSavedView: async (id: number) => {
        calledId = id;
        return { id, name: "test view" };
      },
    });
    registerSavedViewTools(server, api);

    const tool = tools.get("get_saved_view")!;
    const result = await tool.callback({ id: 7 });

    assert.equal(calledId, 7);
    assert.deepEqual(getTextContent(result), { id: 7, name: "test view" });
  });
});

describe("create_saved_view tool", () => {
  test("calls createSavedView with provided data", async () => {
    let sentData: any;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      createSavedView: async (data: any) => {
        sentData = data;
        return { id: 1, ...data };
      },
    });
    registerSavedViewTools(server, api);

    const tool = tools.get("create_saved_view")!;
    await tool.callback({ name: "My View", show_on_dashboard: true });

    assert.equal(sentData.name, "My View");
    assert.equal(sentData.show_on_dashboard, true);
  });
});

describe("update_saved_view tool", () => {
  test("calls updateSavedView separating id from data", async () => {
    let calledId: number | undefined;
    let sentData: any;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      updateSavedView: async (id: number, data: any) => {
        calledId = id;
        sentData = data;
        return { id, ...data };
      },
    });
    registerSavedViewTools(server, api);

    const tool = tools.get("update_saved_view")!;
    await tool.callback({ id: 3, name: "Updated View" });

    assert.equal(calledId, 3);
    assert.equal(sentData.name, "Updated View");
    assert.equal(sentData.id, undefined); // id should NOT be in the data
  });
});

describe("delete_saved_view tool", () => {
  test("requires confirm=true", async () => {
    const { server, tools } = createMockServer();
    const api = createMockApi();
    registerSavedViewTools(server, api);

    const tool = tools.get("delete_saved_view")!;
    await assert.rejects(
      () => tool.callback({ id: 1, confirm: false }),
      (err: Error) => {
        assert.match(err.message, /[Cc]onfirmation required/);
        return true;
      }
    );
  });

  test("calls deleteSavedView when confirmed", async () => {
    let deletedId: number | undefined;
    const { server, tools } = createMockServer();
    const api = createMockApi({
      deleteSavedView: async (id: number) => {
        deletedId = id;
      },
    });
    registerSavedViewTools(server, api);

    const tool = tools.get("delete_saved_view")!;
    const result = await tool.callback({ id: 5, confirm: true });

    assert.equal(deletedId, 5);
    assert.deepEqual(getTextContent(result), { status: "deleted" });
  });
});
