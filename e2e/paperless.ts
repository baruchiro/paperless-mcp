import FormData from "form-data";
import axios from "axios";

export interface PaperlessTag {
  id: number;
  name: string;
}

export interface PaperlessCorrespondent {
  id: number;
  name: string;
}

export interface PaperlessDocumentType {
  id: number;
  name: string;
}

export interface PaperlessDocument {
  id: number;
  title: string;
}

export class PaperlessClient {
  private readonly headers: Record<string, string>;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {
    this.headers = {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json; version=5",
    };
  }

  async getToken(username: string, password: string): Promise<string> {
    const res = await axios.post<{ token: string }>(
      `${this.baseUrl}/api/token/`,
      { username, password }
    );
    return res.data.token;
  }

  async createTag(name: string): Promise<PaperlessTag> {
    const res = await axios.post<PaperlessTag>(
      `${this.baseUrl}/api/tags/`,
      { name },
      { headers: this.headers }
    );
    return res.data;
  }

  async createCorrespondent(name: string): Promise<PaperlessCorrespondent> {
    const res = await axios.post<PaperlessCorrespondent>(
      `${this.baseUrl}/api/correspondents/`,
      { name },
      { headers: this.headers }
    );
    return res.data;
  }

  async createDocumentType(name: string): Promise<PaperlessDocumentType> {
    const res = await axios.post<PaperlessDocumentType>(
      `${this.baseUrl}/api/document_types/`,
      { name },
      { headers: this.headers }
    );
    return res.data;
  }

  async uploadDocument(
    content: Buffer,
    filename: string,
    title: string
  ): Promise<string> {
    const form = new FormData();
    form.append("document", content, { filename });
    form.append("title", title);
    const res = await axios.post<string>(
      `${this.baseUrl}/api/documents/post_document/`,
      form,
      { headers: { ...form.getHeaders(), Authorization: `Token ${this.token}` } }
    );
    return String(res.data);
  }

  async waitForDocument(
    taskId: string,
    timeoutMs = 60000
  ): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await axios.get<{ status: string; related_document?: string }>(
        `${this.baseUrl}/api/tasks/?task_id=${taskId}`,
        { headers: this.headers }
      );
      const tasks = (res.data as any).results ?? res.data;
      const task = Array.isArray(tasks) ? tasks[0] : tasks;
      if (task?.status === "SUCCESS" && task.related_document) {
        return Number(task.related_document);
      }
      if (task?.status === "FAILURE") {
        throw new Error(`Document processing failed: ${task.result}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Timed out waiting for document task ${taskId}`);
  }
}

export async function getApiToken(
  baseUrl: string,
  username: string,
  password: string
): Promise<string> {
  const res = await axios.post<{ token: string }>(`${baseUrl}/api/token/`, {
    username,
    password,
  });
  return res.data.token;
}

export const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n" +
    "2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n" +
    "3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>\nendobj\n" +
    "xref\n0 4\n" +
    "0000000000 65535 f \n" +
    "0000000009 00000 n \n" +
    "0000000058 00000 n \n" +
    "0000000115 00000 n \n" +
    "trailer\n<</Size 4 /Root 1 0 R>>\n" +
    "startxref\n190\n%%EOF"
);
