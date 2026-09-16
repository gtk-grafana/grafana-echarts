import { type StandardEditorProps } from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';

import React from 'react';
import { type PanelOptions } from 'types';
import { LINK_COLOR_PRECEDENCE_HELP, RelationsLinkColorEditor } from './RelationsLinkColorEditor';

import { type RelationsLinkColor } from 'editor/relations/types';
class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}
globalThis.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver;

const RECT = { width: 120, height: 120, top: 0, left: 0, bottom: 120, right: 120, x: 0, y: 0, toJSON: () => {} };
Object.defineProperty(Element.prototype, 'getBoundingClientRect', { value: () => RECT, configurable: true });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => RECT.width, configurable: true });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get: () => RECT.height, configurable: true });

const renderEditor = (value: RelationsLinkColor | undefined, panelOptions: Partial<PanelOptions> = {}) => {
  const onChange = jest.fn();
  const props = {
    value,
    onChange,
    id: 'relationsLinkColor',
    item: { id: 'relationsLinkColor', path: 'relationsLinkColor', name: 'Link color', editor: () => null },
    context: { data: [], options: panelOptions },
  } as unknown as StandardEditorProps<RelationsLinkColor, unknown, PanelOptions>;

  render(<RelationsLinkColorEditor {...props} />);
  return { onChange };
};

describe('RelationsLinkColorEditor', () => {
  it('shows the stored mode, and the default when nothing is stored', () => {
    renderEditor('target', { seriesType: 'sankey' });
    expect(screen.getByRole('combobox')).toHaveValue('Target');

    renderEditor(undefined, { seriesType: 'sankey' });
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('Gradient');
  });

  it('labels Gradient by what the current variant and layout will draw', () => {
    renderEditor('gradient', { seriesType: 'graph', relationsLayout: 'none' });
    expect(screen.getByRole('combobox')).toHaveValue('Gradient');

    renderEditor('gradient', { seriesType: 'graph', relationsLayout: 'circular' });
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('Gradient (draws as "Source")');

    renderEditor('gradient', { seriesType: 'chord' });
    expect(screen.getAllByRole('combobox')[2]).toHaveValue('Gradient');
  });

  it('reports the picked mode at the option path', () => {
    const { onChange } = renderEditor('gradient', { seriesType: 'sankey' });

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Source' }));

    expect(onChange).toHaveBeenCalledWith('source');
  });

  it('carries the caveat once, on hover, with nothing standing or native', () => {
    renderEditor('source', { seriesType: 'graph' });

    const trigger = screen.getByTestId('info-circle').parentElement!;
    expect(document.querySelectorAll('[title]')).toHaveLength(0);
    expect(screen.queryByText(LINK_COLOR_PRECEDENCE_HELP)).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('tabindex', '0');

    fireEvent.mouseEnter(trigger);

    expect(screen.getByRole('tooltip')).toHaveTextContent(LINK_COLOR_PRECEDENCE_HELP);
    // Once in the whole document: the tooltip, and nowhere else.
    expect(screen.getAllByText(LINK_COLOR_PRECEDENCE_HELP)).toHaveLength(1);
  });
});
