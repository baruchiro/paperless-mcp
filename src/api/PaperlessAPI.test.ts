import { test } from "node:test";
import assert from "node:assert/strict";
import axios, { AxiosResponse } from "axios";
import { PaperlessAPI } from "./PaperlessAPI";

interface CapturedRequest {
  url?: string;
  body?: { getBuffer: () => Buffer };
  headers?: Record<string, unknown>;
}

test(
  "postDocument serializes numeric metadata as multipart strings",
  async () => {
    const api = new PaperlessAPI("http://paperless.local", "token");
    const axiosClient = axios as unknown as { post: typeof axios.post };
    const originalPost = axiosClient.post;
    const captured: CapturedRequest = {};

    axiosClient.post = (async (
      url: string,
      data?: unknown,
      config?: unknown
    ): Promise<AxiosResponse<string>> => {
      captured.url = url;
      captured.body = data as { getBuffer: () => Buffer };
      captured.headers =
        (config as { headers?: Record<string, unknown> })?.headers ?? {};

      return {
        data: "123",
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as AxiosResponse<string>["config"],
      };
    }) as typeof axios.post;

    try {
      const response = await api.postDocument(Buffer.from("file"), "test.pdf", {
        title: "Doc",
        correspondent: 7,
        document_type: 9,
        storage_path: 12,
        tags: [5, 6],
        archive_serial_number: 0,
        custom_fields: [3, 4],
      });

      assert.equal(response, "123");
      assert.equal(
        captured.url,
        "http://paperless.local/api/documents/post_document/"
      );
      assert.equal(captured.headers?.Authorization, "Token token");

      const multipartBody = captured.body?.getBuffer().toString("utf8") ?? "";
      assert.match(multipartBody, /name="title"\r\n\r\nDoc\r\n/);
      assert.match(multipartBody, /name="correspondent"\r\n\r\n7\r\n/);
      assert.match(multipartBody, /name="document_type"\r\n\r\n9\r\n/);
      assert.match(multipartBody, /name="storage_path"\r\n\r\n12\r\n/);
      assert.match(multipartBody, /name="archive_serial_number"\r\n\r\n0\r\n/);
      assert.match(multipartBody, /name="tags"\r\n\r\n5\r\n/);
      assert.match(multipartBody, /name="tags"\r\n\r\n6\r\n/);
      assert.match(multipartBody, /name="custom_fields"\r\n\r\n3\r\n/);
      assert.match(multipartBody, /name="custom_fields"\r\n\r\n4\r\n/);
    } finally {
      axiosClient.post = originalPost;
    }
  }
);
