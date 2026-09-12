import { z } from "zod";

/**
 * Parses with a zod schema and, on failure, throws the first issue's message —
 * something a person can act on — instead of zod's full JSON issue list.
 */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Check the form and try again.");
  }
  return result.data;
}
