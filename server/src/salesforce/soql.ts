/**
 * Escapes a value before it is interpolated into a SOQL string literal.
 *
 * The account id is already validated by a regex before it reaches this
 * function, but keeping one obvious escape point makes the intent impossible
 * to miss — and keeps this safe if the helper is reused for user input later.
 */
export function escapeSoqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
