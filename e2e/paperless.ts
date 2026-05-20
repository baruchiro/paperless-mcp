import FormData from "form-data";
import axios from "axios";

const http = axios.create({ timeout: 15000 });

interface TaskResult {
  status: string;
  related_document?: string;
  result?: string;
}

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

  async createTag(name: string): Promise<PaperlessTag> {
    const res = await http.post<PaperlessTag>(
      `${this.baseUrl}/api/tags/`,
      { name },
      { headers: this.headers }
    );
    return res.data;
  }

  async createCorrespondent(name: string): Promise<PaperlessCorrespondent> {
    const res = await http.post<PaperlessCorrespondent>(
      `${this.baseUrl}/api/correspondents/`,
      { name },
      { headers: this.headers }
    );
    return res.data;
  }

  async createDocumentType(name: string): Promise<PaperlessDocumentType> {
    const res = await http.post<PaperlessDocumentType>(
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
    const res = await http.post<string>(
      `${this.baseUrl}/api/documents/post_document/`,
      form,
      { headers: { ...form.getHeaders(), Authorization: `Token ${this.token}` } }
    );
    return String(res.data);
  }

  async waitForDocument(taskId: string, timeoutMs = 60000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await http.get<unknown>(
        `${this.baseUrl}/api/tasks/?task_id=${taskId}`,
        { headers: this.headers }
      );
      const data = res.data;
      let tasks: TaskResult[];
      if (Array.isArray(data)) {
        tasks = data as TaskResult[];
      } else if (data && typeof data === "object" && Array.isArray((data as any).results)) {
        tasks = (data as any).results as TaskResult[];
      } else {
        tasks = [];
      }
      const task = tasks[0];
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
  const res = await http.post<{ token: string }>(`${baseUrl}/api/token/`, {
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
