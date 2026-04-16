import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerSavedViewTools } from "./savedViews";
import { createMockServer, createMockApi, getTextContent } from "./test-helpers";

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
