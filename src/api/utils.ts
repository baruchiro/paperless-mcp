import { validateHeaderName, validateHeaderValue } from "node:http";
import { MATCHING_ALGORITHM_OPTIONS, MatchingAlgorithm } from "./types";

export const headersToObject = (headers: any): Record<string, string> => {
  if (!headers) return {};
  if (typeof headers.forEach === "function") {
    const obj: Record<string, string> = {};
    headers.forEach((value: string, key: string) => {
      obj[key] = value;
    });
    return obj;
  }
  return headers;
};

export interface NamedItem {
  id: number;
  name: string;
}

export function enhanceMatchingAlgorithm<
  T extends { matching_algorithm: MatchingAlgorithm }
>(obj: T): T & { matching_algorithm: NamedItem } {
  return {
    ...obj,
    matching_algorithm: {
      id: obj.matching_algorithm,
      name:
        MATCHING_ALGORITHM_OPTIONS[obj.matching_algorithm] ||
        String(obj.matching_algorithm),
    },
  };
}

export function enhanceMatchingAlgorithmArray<
  T extends { matching_algorithm: MatchingAlgorithm }
>(objects: T[]): (T & { matching_algorithm: NamedItem })[] {
  return objects.map((obj) => enhanceMatchingAlgorithm(obj));
}

/**
 * Headers this client controls itself. `Authorization` carries the Paperless-NGX
 * API token; `Accept` pins the API version the client speaks; `Content-Type` is
 * chosen per request from the body. Letting configuration replace any of them
 * breaks requests in ways that are hard to trace back to the setting.
 */
const reservedHeaders = new Map<string, string>([
  ["authorization", "that header carries the Paperless-NGX API token"],
  ["accept", "that header pins the Paperless-NGX API version"],
  ["content-type", "that header is set per request from the body"],
]);

export const reservedHeaderNames: readonly string[] = Array.from(
  reservedHeaders.keys()
);

const loopbackHostnames = ["localhost", "localhost.", "[::1]"];
const loopbackIPv4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function isLoopbackHostname(hostname: string): boolean {
  return (
    loopbackHostnames.indexOf(hostname) !== -1 || loopbackIPv4.test(hostname)
  );
}

/** Whether requests to this base URL stay on the machine. */
export function isLoopbackUrl(baseUrl: string): boolean {
  try {
    return isLoopbackHostname(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

function assertUsableHeader(name: string, value: string, source: string): void {
  if (!name) {
    throw new Error(`${source} contains a header with an empty name.`);
  }
  const reservedReason = reservedHeaders.get(name.toLowerCase());
  if (reservedReason) {
    throw new Error(
      `${source} must not set the "${name}" header; ${reservedReason}.`
    );
  }
  if (name === "__proto__") {
    // Axios drops this name when building AxiosHeaders, so it would never be sent.
    throw new Error(`${source} cannot set a header named "__proto__".`);
  }
  try {
    validateHeaderName(name);
  } catch {
    throw new Error(`${source} contains an invalid header name: "${name}".`);
  }
  try {
    validateHeaderValue(name, value);
  } catch {
    // Node's own message quotes the offending value, which is a credential here.
    throw new Error(`${source} contains an invalid value for header "${name}".`);
  }
}

/**
 * Removes the named headers from a header set, comparing case-insensitively as
 * HTTP requires.
 */
export function omitHeaders(
  headers: Record<string, string>,
  names: readonly string[]
): Record<string, string> {
  const excluded = names.map((name) => name.toLowerCase());
  const remaining: Record<string, string> = {};
  for (const name of Object.keys(headers)) {
    if (excluded.indexOf(name.toLowerCase()) === -1) {
      remaining[name] = headers[name];
    }
  }
  return remaining;
}

/**
 * Whether configured headers may be sent to this base URL. They usually carry
 * proxy credentials, so cleartext HTTP is refused — except on loopback, where
 * nothing leaves the machine.
 */
export function canSendCredentials(baseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") {
    return true;
  }
  return parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
}

export function parseExtraHeaders(
  envValue?: string,
  cliHeaders: string[] = []
): Record<string, string> {
  const collected = new Map<string, [string, string]>();

  const collect = (name: string, value: string, source: string): void => {
    assertUsableHeader(name, value, source);
    collected.set(name.toLowerCase(), [name, value]);
  };

  if (envValue && envValue.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(envValue);
    } catch {
      throw new Error(
        "PAPERLESS_EXTRA_HEADERS is not valid JSON. Expected an object of header names to string values, " +
          'e.g. {"CF-Access-Client-Id":"<id>","CF-Access-Client-Secret":"<secret>"}.'
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        "PAPERLESS_EXTRA_HEADERS must be a JSON object of header names to string values."
      );
    }
    for (const [name, value] of Object.entries(parsed)) {
      const trimmedName = name.trim();
      if (typeof value !== "string") {
        throw new Error(
          `PAPERLESS_EXTRA_HEADERS value for "${trimmedName}" must be a string.`
        );
      }
      collect(trimmedName, value, "PAPERLESS_EXTRA_HEADERS");
    }
  }

  for (const entry of cliHeaders) {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(
        '--header expects "Name: value" but got an entry without a colon.'
      );
    }
    collect(
      entry.slice(0, separatorIndex).trim(),
      entry.slice(separatorIndex + 1).trim(),
      "--header"
    );
  }

  const headers: Record<string, string> = {};
  for (const [name, value] of collected.values()) {
    headers[name] = value;
  }
  return headers;
}
