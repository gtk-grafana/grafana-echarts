import { type StandardEditorProps } from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { type RelationsLinkColor } from 'editor/types';
import React from 'react';
import { type PanelOptions } from 'types';
import { LINK_COLOR_PRECEDENCE_HELP, RelationsLinkColorEditor } from './RelationsLinkColorEditor';

/**
 * `Select` renders its menu through `ScrollContainer`, which observes its own scroll
 * edges — and jsdom has no `IntersectionObserver`. Stubbed rather than mocking the widget
 * away, so a pick goes through the real control on its way to `onChange`.
 */
class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}
globalThis.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver;

/**
 * `Combobox`'s menu is virtualised, and a virtualiser given jsdom's zero-height elements
 * renders **no rows** — the menu opens and the options are not in the DOM. Grafana's own
 * Combobox suite stubs the same two measurements (`mockComboboxRect`, not reachable from
 * here: `@grafana/ui/test-utils` is not in the package's exports map).
 */
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

    // Unset reads as the family default rather than as an empty picker, which is what the
    // render path does with it too (`?? RELATIONS_LINK_COLOR_DEFAULT`).
    renderEditor(undefined, { seriesType: 'sankey' });
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('Gradient');
  });

  /**
   * The whole reason this is a component rather than the standard `select` editor id: the
   * choices are read on every render, so switching layout relabels the entry. A
   * `settings.getOptions` list would not — `SelectValueEditor` re-runs it only when
   * `context.data` changes.
   */
  it('labels Gradient by what the current variant and layout will draw', () => {
    renderEditor('gradient', { seriesType: 'graph', relationsLayout: 'none' });
    expect(screen.getByRole('combobox')).toHaveValue('Gradient');

    renderEditor('gradient', { seriesType: 'graph', relationsLayout: 'circular' });
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('Gradient (draws as Source here)');
  });

  it('reports the picked mode at the option path', () => {
    const { onChange } = renderEditor('gradient', { seriesType: 'sankey' });

    // What is under test is the value that reaches the panel options, not `Combobox`'s own
    // event plumbing — so the menu is opened the cheapest way that works in jsdom.
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Source' }));

    expect(onChange).toHaveBeenCalledWith('source');
  });

  /**
   * The caveat is reachable but not standing: an `info-circle` carrying it as its
   * accessible name, rather than the always-rendered `description` an option's help text
   * would be. Focusable, so it is not mouse-only.
   */
  it('carries the precedence caveat on an info icon instead of in standing help text', () => {
    renderEditor('source', { seriesType: 'graph' });

    const help = screen.getByRole('img', { name: LINK_COLOR_PRECEDENCE_HELP });
    expect(help).toHaveAttribute('tabindex', '0');
    expect(help.querySelector('[data-testid="info-circle"]')).toBeInTheDocument();
    // Nowhere in the standing text: the accessible name and the tooltip are the only
    // copies of it, which is the whole point of moving it off `description`.
    expect(screen.queryByText(LINK_COLOR_PRECEDENCE_HELP)).not.toBeInTheDocument();
  });
});
