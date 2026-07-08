/** Dev-only logging gated by build environment. */
export const CONSOLE_OUTPUT = process.env.NODE_ENV !== 'production';

export enum LOG_LEVELS {
  debug,
  info,
  warn,
  error,
}

export const LOG_LEVEL = LOG_LEVELS.warn;

// @todo rename to not fight autocomplete with webpack
export const debug = (msg: string, level = LOG_LEVELS.info, data?: unknown) => {
  if (!CONSOLE_OUTPUT || level < LOG_LEVEL) {
    return;
  }
  if (level === LOG_LEVELS.debug) {
    console.log(msg, data);
  } else if (level === LOG_LEVELS.info) {
    console.log(msg, data);
  } else if (level === LOG_LEVELS.warn) {
    console.warn(msg, data);
  } else if (level === LOG_LEVELS.error) {
    console.error(msg, data);
  }
};
