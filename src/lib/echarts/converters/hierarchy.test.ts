import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { frameToHierarchy, isFlameGraphFrame } from 'lib/echarts/converters/hierarchy';

const theme = createTheme();

// A small flame-graph nested-set frame: total > render > draw, with an io
// sibling under total. See data-plane/flame-graph.md.
const nestedSetFrame = (): DataFrame =>
  toDataFrame({
    meta: { preferredVisualisationType: 'flamegraph' },
    fields: [
      { name: 'level', type: FieldType.number, values: [0, 1, 2, 1] },
      { name: 'value', type: FieldType.number, values: [100, 60, 40, 30] },
      { name: 'self', type: FieldType.number, values: [10, 20, 40, 30] },
      { name: 'label', type: FieldType.string, values: ['total', 'render', 'draw', 'io'] },
    ],
  });

describe('isFlameGraphFrame', () => {
  it('detects the frame via meta.preferredVisualisationType', () => {
    expect(isFlameGraphFrame(nestedSetFrame())).toBe(true);
  });

  it('detects the frame by nested-set field shape (level + value + label)', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: [0, 1] },
        { name: 'value', type: FieldType.number, values: [10, 4] },
        { name: 'label', type: FieldType.string, values: ['root', 'child'] },
      ],
    });
    expect(isFlameGraphFrame(frame)).toBe(true);
  });

  it('does not detect a plain categorical frame', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['A', 'B'] },
        { name: 'value', type: FieldType.number, values: [1, 2] },
      ],
    });
    // No `level` field, so this is not a flame graph.
    expect(isFlameGraphFrame(frame)).toBe(false);
  });
});

describe('frameToHierarchy (nested set)', () => {
  it('reconstructs the tree from row order and level, retaining self', () => {
    const result = frameToHierarchy([nestedSetFrame()], theme);

    expect(result).toEqual({
      roots: [
        {
          name: 'total',
          value: 100,
          self: 10,
          children: [
            {
              name: 'render',
              value: 60,
              self: 20,
              children: [{ name: 'draw', value: 40, self: 40 }],
            },
            { name: 'io', value: 30, self: 30 },
          ],
        },
      ],
    });
  });

  it('resolves an enum label field through its display processor', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: [0, 1] },
        { name: 'value', type: FieldType.number, values: [10, 4] },
        {
          name: 'label',
          type: FieldType.enum,
          values: [0, 1],
          config: { type: { enum: { text: ['root', 'child'] } } },
        },
      ],
    });

    const result = frameToHierarchy([frame], theme);

    expect(result).toEqual({
      roots: [{ name: 'root', value: 10, children: [{ name: 'child', value: 4 }] }],
    });
  });

  it('omits self when the frame has no self field', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: [0, 1] },
        { name: 'value', type: FieldType.number, values: [10, 4] },
        { name: 'label', type: FieldType.string, values: ['root', 'child'] },
      ],
    });

    const result = frameToHierarchy([frame], theme);

    expect(result).toEqual({
      roots: [{ name: 'root', value: 10, children: [{ name: 'child', value: 4 }] }],
    });
  });

  it('reconstructs the TestData flame_graph shape (meta signal + enum label + self)', () => {
    // Mirrors Grafana TestData's built-in `flame_graph` scenario frame, which the
    // hierarchy provisioning dashboard renders: detected via the meta signal, with
    // an enum `label` resolved through its display processor and `self` retained.
    const frame = toDataFrame({
      meta: { preferredVisualisationType: 'flamegraph' },
      fields: [
        { name: 'level', type: FieldType.number, values: [0, 1, 2, 1] },
        { name: 'value', type: FieldType.number, values: [100, 60, 40, 30], config: { unit: 'short' } },
        { name: 'self', type: FieldType.number, values: [10, 20, 40, 30], config: { unit: 'short' } },
        {
          name: 'label',
          type: FieldType.enum,
          values: [0, 1, 2, 3],
          config: { type: { enum: { text: ['total', 'render', 'draw', 'io'] } } },
        },
      ],
    });

    expect(frameToHierarchy([frame], theme)).toEqual({
      roots: [
        {
          name: 'total',
          value: 100,
          self: 10,
          children: [
            { name: 'render', value: 60, self: 20, children: [{ name: 'draw', value: 40, self: 40 }] },
            { name: 'io', value: 30, self: 30 },
          ],
        },
      ],
    });
  });
});

describe('frameToHierarchy (flat categorical)', () => {
  it('maps each category to a single-level node valued by the first numeric field', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['A', 'B', 'C'] },
        { name: 'v', type: FieldType.number, values: [5, 3, 2] },
      ],
    });

    const result = frameToHierarchy([frame], theme);

    expect(result).toEqual({
      roots: [
        { name: 'A', value: 5 },
        { name: 'B', value: 3 },
        { name: 'C', value: 2 },
      ],
    });
  });

  it('coerces missing values to null', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['A', 'B'] },
        { name: 'v', type: FieldType.number, values: [5, null] },
      ],
    });

    const result = frameToHierarchy([frame], theme);

    expect(result).toEqual({
      roots: [
        { name: 'A', value: 5 },
        { name: 'B', value: null },
      ],
    });
  });
});

describe('frameToHierarchy (no usable data)', () => {
  it('returns null for no frames', () => {
    expect(frameToHierarchy([], theme)).toBeNull();
  });

  it('returns null when no numeric field is present', () => {
    const frame = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['A', 'B'] }],
    });
    expect(frameToHierarchy([frame], theme)).toBeNull();
  });
});
