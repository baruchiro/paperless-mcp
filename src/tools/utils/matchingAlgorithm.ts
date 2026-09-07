import { z } from "zod";
import {
  MATCHING_ALGORITHM_DESCRIPTION,
  MATCHING_ALGORITHM_OPTIONS,
  MatchingAlgorithm,
} from "../../api/types";

const MATCHING_ALGORITHM_VALUES = Object.keys(MATCHING_ALGORITHM_OPTIONS).map(
  Number
) as MatchingAlgorithm[];

// `MatchingAlgorithm` in the OpenAPI spec is an integer enum, so the schema is
// built from the option map rather than a 0-6 range: that keeps the advertised
// values in step with the map and infers `MatchingAlgorithm` instead of `number`,
// which is what the PaperlessAPI request types require.
export const matchingAlgorithmSchema = z
  .literal(MATCHING_ALGORITHM_VALUES)
  .describe(MATCHING_ALGORITHM_DESCRIPTION);
