import { type StandardEditorProps } from '@grafana/data';
import { render } from '@testing-library/react';
import React from 'react';
import { RelationsStatsPicker } from './RelationsStatsPicker';

/**
 * `StatsPicker` is stubbed so the test can report a selection the way the real widget would,
 * without driving Grafana's combobox — what is under test is what reaches the panel options.
 */
const pickerProps: { stats?: string[]; onChange?: (stats: string[]) => void } = {};

jest.mock('@grafana/ui', () => ({
  StatsPicker: (props: { stats: string[]; onChange: (stats: string[]) => void }) => {
    pickerProps.stats = props.stats;
    pickerProps.onChange = props.onChange;
    return null;
  },
}));

const renderPicker = (value?: string[]) => {
  const onChange = jest.fn();
  const props = {
    value,
    onChange,
    item: { id: 'reduceOptions.calcs', path: 'reduceOptions.calcs', name: 'Calculation', editor: () => null },
    context: { data: [], options: {} },
  } as unknown as StandardEditorProps<string[]>;

  render(<RelationsStatsPicker {...props} />);
  return { onChange, select: (stats: string[]) => pickerProps.onChange?.(stats) };
};

describe('RelationsStatsPicker', () => {
  it('shows the stored calcs, and an empty list when there are none', () => {
    renderPicker(['max', 'min']);
    expect(pickerProps.stats).toEqual(['max', 'min']);

    renderPicker(undefined);
    expect(pickerProps.stats).toEqual([]);
  });

  /**
   * **No maximum.** The control was clamped to two, on the reasoning that a mark has one main
   * stat slot and one secondary. Only the first half holds: `calcs[0]` sizes the node and
   * weighs the edge, so it is singular, but every calc after it is a tooltip row and the
   * tooltip has as many rows as it needs.
   *
   * The clamp also misbehaved on its own terms — it kept the *last* two, so adding a third to
   * `[max, min]` produced `[min, mean]`, silently promoting `min` to the main stat and changing
   * the node sizes and colours the panel drew.
   */
  it('passes a third and fourth selection straight through', () => {
    const { onChange, select } = renderPicker(['max', 'min']);

    select(['max', 'min', 'mean']);
    expect(onChange).toHaveBeenLastCalledWith(['max', 'min', 'mean']);

    select(['max', 'min', 'mean', 'sum']);
    expect(onChange).toHaveBeenLastCalledWith(['max', 'min', 'mean', 'sum']);
  });

  it('keeps the main stat first, whatever is added after it', () => {
    const { onChange, select } = renderPicker(['max', 'min']);

    select(['max', 'min', 'mean']);
    expect(onChange.mock.lastCall?.[0][0]).toBe('max');
  });

  it('lets the selection be cleared', () => {
    const { onChange, select } = renderPicker(['max']);

    select([]);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
