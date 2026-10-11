/** JSON-Schema keywords Claude structured outputs don't accept; they are enforced afterwards by zod. */
const UNSUPPORTED_KEYWORDS = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'default',
  '$schema',
]);

/**
 * Adapts a JSON Schema (as produced by zod) to the subset accepted by structured outputs:
 * drops numeric/length constraints and requires `additionalProperties: false` on objects.
 * AiService still validates the response with the original zod schema.
 */
export function toStructuredOutputSchema(schema: unknown): Record<string, unknown> {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (node === null || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED_KEYWORDS.has(key)) continue;
      out[key] =
        key === 'properties' && value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, visit(v)]),
            )
          : visit(value);
    }
    if (out.type === 'object') {
      out.additionalProperties = false;
      if (out.properties && typeof out.properties === 'object' && !out.required) {
        out.required = Object.keys(out.properties);
      }
    }
    return out;
  };
  return visit(schema) as Record<string, unknown>;
}
