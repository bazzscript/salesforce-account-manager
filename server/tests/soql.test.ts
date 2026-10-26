import { describe, expect, it } from 'vitest';
import { escapeSoqlString } from '../src/salesforce/soql.js';

describe('escapeSoqlString', () => {
  it('escapes single quotes so a value cannot terminate the SOQL literal', () => {
    expect(escapeSoqlString("001' OR Name != '")).toBe("001\\' OR Name != \\'");
  });

  it('escapes backslashes before quotes (no double-escaping bug)', () => {
    expect(escapeSoqlString("a\\'b")).toBe("a\\\\\\'b");
  });

  it('leaves Salesforce ids untouched', () => {
    const id = '001000000000001AAA';
    expect(escapeSoqlString(id)).toBe(id);
  });
});
