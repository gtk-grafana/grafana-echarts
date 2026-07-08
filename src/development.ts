/** Dev-only logging gated by build environment. */
// `process.env.NODE_ENV` is inlined at build time by webpack's `mode` (via DefinePlugin).
// `process` itself is undefined in the browser, so any other lookup (e.g. CI, only present
// under Jest/Node) must be guarded with `typeof` to avoid a runtime ReferenceError.
const isCI = typeof process !== 'undefined' && Boolean(process.env.CI);
const CONSOLE_OUTPUT = !isCI && (localStorage.getItem('echarts-debug') ?? process.env.NODE_ENV !== 'production');

export enum LOG_LEVELS {
  debug,
  info,
  warn,
  error,
}

/**
 * localStorage.setItem('echarts-debug', '1')
 * localStorage.setItem('echarts-debug-level', 'debug')
 */
function getLogLevelFromLocalStorage(): LOG_LEVELS {
  const raw = localStorage.getItem('echarts-debug-level');
  if (raw === 'debug' || raw === '0') {
    return LOG_LEVELS.debug;
  }
  if (raw === 'info' || raw === '1') {
    return LOG_LEVELS.info;
  }
  if (raw === 'warn' || raw === '2') {
    return LOG_LEVELS.error;
  }
  if (raw === 'error' || raw === '3') {
    return LOG_LEVELS.error;
  }
  return LOG_LEVELS.warn;
}

// @todo rename to not fight autocomplete with webpack
export const debug = (msg: string, level = LOG_LEVELS.info, data?: unknown) => {
  if (!CONSOLE_OUTPUT || level < getLogLevelFromLocalStorage()) {
    return;
  }
  if (level === LOG_LEVELS.debug) {
    console.debug(msg, data); // eslint-disable-line no-console
  } else if (level === LOG_LEVELS.info) {
    console.log(msg, data);
  } else if (level === LOG_LEVELS.warn) {
    console.warn(msg, data);
  } else if (level === LOG_LEVELS.error) {
    console.error(msg, data);
  }
};
