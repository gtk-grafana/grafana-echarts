import { render, screen } from '@testing-library/react';
import { type ChartNotice } from 'lib/echarts/charts/types';
import React from 'react';
import { ChartNotices } from './ChartNotices';

/**
 * The panel-corner advisory badge, and today's only user-visible signal that a chart had
 * to change the user's data to draw it: the sankey cycle policy deletes back-edges, and
 * without this the panel just quietly renders a graph missing links the query returned.
 *
 * The tooltip content is not asserted by opening the tooltip — `@grafana/ui`'s `Tooltip`
 * is a Popper portal that needs a real hover and a layout engine jsdom does not have.
 * The text is on the trigger's `aria-label` instead, which is what a screen reader gets
 * and is the same string, so asserting there covers both the accessible name and the
 * tooltip's content.
 */

const notice = (text: string, severity: ChartNotice['severity'] = 'warning'): ChartNotice => ({ severity, text });

describe('ChartNotices', () => {
  // Nothing to say means nothing rendered — not an empty absolutely-positioned strip
  // over the corner of every chart in the dashboard.
  it('renders nothing at all when there are no notices', () => {
    const { container } = render(<ChartNotices notices={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders one badge per notice, labelled with its text', () => {
    render(<ChartNotices notices={[notice('1 link hidden to remove cycles'), notice('and another', 'info')]} />);

    const badges = screen.getAllByRole('note');
    expect(badges).toHaveLength(2);
    expect(badges.map((badge) => badge.getAttribute('aria-label'))).toEqual([
      '1 link hidden to remove cycles',
      'and another',
    ]);
  });

  // Reachable by keyboard, so the tooltip can be opened without a pointer: an advisory
  // whose whole content is behind a hover is invisible to anyone who cannot hover.
  it('puts each badge in the tab order', () => {
    render(<ChartNotices notices={[notice('1 link hidden to remove cycles')]} />);

    expect(screen.getByRole('note')).toHaveAttribute('tabindex', '0');
  });

  /**
   * Warning and info are drawn with different icons, which is the only difference a
   * reader sees before hovering. Read off `data-testid`, which is where `@grafana/ui`'s
   * `Icon` puts its name — the icon itself is decorative and carries no accessible name,
   * the notice's own `aria-label` being what a screen reader announces.
   */
  it('picks the icon from the severity', () => {
    const iconNames = (notices: ChartNotice[]) => {
      const { container, unmount } = render(<ChartNotices notices={notices} />);
      const names = [...container.querySelectorAll('svg')].map((svg) => svg.getAttribute('data-testid'));
      unmount();
      return names;
    };

    expect(iconNames([notice('cycles', 'warning')])).toEqual(['exclamation-triangle']);
    expect(iconNames([notice('heads up', 'info')])).toEqual(['info-circle']);
  });

  // Two notices with the same text and severity would collide on the React key, which
  // React reports as a console error rather than a failure — so it is asserted directly.
  it('keys each badge by severity and text', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ChartNotices notices={[notice('same text'), notice('same text', 'info')]} />);

    expect(screen.getAllByRole('note')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
