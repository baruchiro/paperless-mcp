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
