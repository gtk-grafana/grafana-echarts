import { FieldType, toDataFrame } from '@grafana/data';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { getComponent } from 'test/panel';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  PanelDataErrorView: () => <div>No data</div>,
}));

const emptyFrame = () =>
  toDataFrame({
    fields: [
      { name: 'source', type: FieldType.string, values: [] },
      { name: 'target', type: FieldType.string, values: [] },
      { name: 'value', type: FieldType.number, values: [] },
    ],
  });

describe('Panel empty view', () => {
  it.each([
    ['no frames', []],
    ['one empty frame', [emptyFrame()]],
    ['multiple empty frames', [emptyFrame(), emptyFrame()]],
  ])('shows No data for relations with %s', (_name, frames) => {
    render(getComponent(frames, 'graph', undefined, undefined, undefined, 'relations'));

    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
