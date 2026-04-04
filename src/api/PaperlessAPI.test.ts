import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PaperlessAPI } from "./PaperlessAPI";

describe("PaperlessAPI", () => {
  const api = new PaperlessAPI("http://localhost:8000", "test-token");

  describe("API method signatures", () => {
    test("has deleteDocument method", () => {
      assert.equal(typeof api.deleteDocument, "function");
      assert.equal(api.deleteDocument.length, 1); // takes 1 arg: id
    });

    test("has getTag method", () => {
      assert.equal(typeof api.getTag, "function");
      assert.equal(api.getTag.length, 1);
    });

    // Storage paths CRUD
    test("has storage path CRUD methods", () => {
      assert.equal(typeof api.getStoragePaths, "function");
      assert.equal(typeof api.getStoragePath, "function");
      assert.equal(typeof api.createStoragePath, "function");
      assert.equal(typeof api.updateStoragePath, "function");
      assert.equal(typeof api.deleteStoragePath, "function");
    });

    // Saved views CRUD
    test("has saved view CRUD methods", () => {
      assert.equal(typeof api.getSavedViews, "function");
      assert.equal(typeof api.getSavedView, "function");
      assert.equal(typeof api.createSavedView, "function");
      assert.equal(typeof api.updateSavedView, "function");
      assert.equal(typeof api.deleteSavedView, "function");
    });

    // requestRaw
    test("has requestRaw method", () => {
      assert.equal(typeof api.requestRaw, "function");
    });

    // Existing methods still present
    test("has all existing document methods", () => {
      assert.equal(typeof api.bulkEditDocuments, "function");
      assert.equal(typeof api.postDocument, "function");
      assert.equal(typeof api.getDocuments, "function");
      assert.equal(typeof api.getDocument, "function");
      assert.equal(typeof api.updateDocument, "function");
      assert.equal(typeof api.searchDocuments, "function");
      assert.equal(typeof api.downloadDocument, "function");
      assert.equal(typeof api.getThumbnail, "function");
    });

    test("has all existing tag methods", () => {
      assert.equal(typeof api.getTags, "function");
      assert.equal(typeof api.createTag, "function");
      assert.equal(typeof api.updateTag, "function");
      assert.equal(typeof api.deleteTag, "function");
    });

    test("has all existing correspondent methods", () => {
      assert.equal(typeof api.getCorrespondents, "function");
      assert.equal(typeof api.getCorrespondent, "function");
      assert.equal(typeof api.createCorrespondent, "function");
      assert.equal(typeof api.updateCorrespondent, "function");
      assert.equal(typeof api.deleteCorrespondent, "function");
    });

    test("has all existing document type methods", () => {
      assert.equal(typeof api.getDocumentTypes, "function");
      assert.equal(typeof api.createDocumentType, "function");
      assert.equal(typeof api.updateDocumentType, "function");
      assert.equal(typeof api.deleteDocumentType, "function");
    });

    test("has all existing custom field methods", () => {
      assert.equal(typeof api.getCustomFields, "function");
      assert.equal(typeof api.getCustomField, "function");
      assert.equal(typeof api.createCustomField, "function");
      assert.equal(typeof api.updateCustomField, "function");
      assert.equal(typeof api.deleteCustomField, "function");
    });

    test("has bulkEditObjects method", () => {
      assert.equal(typeof api.bulkEditObjects, "function");
    });
  });

  describe("error handling against a non-existent server", () => {
    test("request throws on connection refused", async () => {
      await assert.rejects(
        () => api.request("/test/"),
        (err: Error) => {
          // Should get a connection error, not "(HTTP undefined)"
          assert.ok(!err.message.includes("HTTP undefined"));
          return true;
        }
      );
    });

    test("requestRaw throws on connection refused", async () => {
      await assert.rejects(
        () => api.requestRaw("/test/"),
        (err: Error) => {
          assert.ok(!err.message.includes("HTTP undefined"));
          return true;
        }
      );
    });

    test("deleteDocument throws on connection refused", async () => {
      await assert.rejects(() => api.deleteDocument(999));
    });
  });
});
