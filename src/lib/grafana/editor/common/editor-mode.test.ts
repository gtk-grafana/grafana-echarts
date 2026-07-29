import { editorModeOptions } from 'editor/constants';
import { isAdvancedEditorMode, isApiEditorMode, resolveEditorMode } from 'lib/grafana/editor/common/editor-mode';

describe('resolveEditorMode', () => {
  it('defaults to "default" when unset', () => {
    expect(resolveEditorMode({})).toBe('default');
    expect(resolveEditorMode({ editorMode: undefined })).toBe('default');
  });

  it('passes each value through unchanged', () => {
    expect(resolveEditorMode({ editorMode: 'default' })).toBe('default');
    expect(resolveEditorMode({ editorMode: 'advanced' })).toBe('advanced');
    expect(resolveEditorMode({ editorMode: 'api' })).toBe('api');
  });
});

describe('isAdvancedEditorMode', () => {
  it('is true only for "advanced"', () => {
    expect(isAdvancedEditorMode({ editorMode: 'advanced' })).toBe(true);
    expect(isAdvancedEditorMode({ editorMode: 'default' })).toBe(false);
    expect(isAdvancedEditorMode({ editorMode: 'api' })).toBe(false);
    expect(isAdvancedEditorMode({})).toBe(false);
  });
});

describe('isApiEditorMode', () => {
  it('is true only for "api"', () => {
    expect(isApiEditorMode({ editorMode: 'api' })).toBe(true);
    expect(isApiEditorMode({ editorMode: 'default' })).toBe(false);
    expect(isApiEditorMode({ editorMode: 'advanced' })).toBe(false);
    expect(isApiEditorMode({})).toBe(false);
  });
});

describe('editorModeOptions', () => {
  it('offers only Default and Advanced in the UI ("api" is JSON-only)', () => {
    expect(editorModeOptions.map((o) => o.value)).toEqual(['default', 'advanced']);
  });
});
