import { type StandardEditorProps } from '@grafana/data';
import { render } from '@testing-library/react';
import React from 'react';
import { RelationsStatsPicker } from './RelationsStatsPicker';

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
