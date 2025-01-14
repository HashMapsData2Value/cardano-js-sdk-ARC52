import { deepEquals, sameArrayItems, strictEquals } from '../src';

describe('equals', () => {
  test('deepEquals', () => {
    expect(deepEquals([], [])).toBe(true);
    expect(deepEquals({}, {})).toBe(true);
    expect(deepEquals([{ prop: 'prop' }], [{ prop: 'prop' }])).toBe(true);
    expect(deepEquals([{ prop: 'prop' }], [{ prop: 'prop2' }])).toBe(false);
  });

  test('strictEquals', () => {
    expect(strictEquals('1', 1 as unknown as string)).toBe(false);
    expect(strictEquals('1', '1')).toBe(true);
  });

  test('sameArrayItems', () => {
    expect(sameArrayItems([], [], strictEquals)).toBe(true);
    expect(sameArrayItems(['a'], ['a', 'b'], strictEquals)).toBe(false);
    expect(sameArrayItems(['a', 'b'], ['a', 'b'], strictEquals)).toBe(true);
    expect(sameArrayItems(['a', 'b'], ['b', 'a'], strictEquals)).toBe(true);
  });
});
