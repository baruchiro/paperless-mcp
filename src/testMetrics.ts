import { register } from "./metrics";

/**
 * The `_count` of one histogram series, read from the text that /metrics
 * serves. A series with that label set that does not exist yet counts 0.
 */
export async function histogramCount(
  name: string,
  labels: Record<string, string>
): Promise<number> {
  const wanted = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  for (const line of (await register.metrics()).split("\n")) {
    if (!line.startsWith(`${name}_count{`)) continue;
    if (wanted.every((pair) => line.includes(pair))) {
      return Number(line.slice(line.lastIndexOf(" ") + 1));
    }
  }
  return 0;
}
