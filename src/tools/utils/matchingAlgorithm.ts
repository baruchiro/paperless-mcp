import { z } from "zod";
import {
  MATCHING_ALGORITHM_DESCRIPTION,
  MatchingAlgorithm,
} from "../../api/types";

// The 0-6 range the API declares is exactly the set `MatchingAlgorithm`
// enumerates, so narrowing to it after the check lets the PaperlessAPI request
// types take the parsed value without a cast at every call site.
export const matchingAlgorithmSchema = z
  .number()
  .int()
  .min(0)
  .max(6)
  .transform((value) => value as MatchingAlgorithm)
  .describe(MATCHING_ALGORITHM_DESCRIPTION);
