export const arrayNotEmpty = <T>(array: T[] | undefined): T[] | undefined =>
  array?.length ? array : undefined;
export const objectNotEmpty = <T>(object: T): T | undefined =>
  object && Object.keys(object).length ? object : undefined;
