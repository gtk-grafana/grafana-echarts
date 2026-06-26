// todo pull from env variable || build arg
export const CONSOLE_OUTPUT = true;
export enum LOG_LEVELS {
  debug,
  info,
  warn,
  error,
}
export const LOG_LEVEL = LOG_LEVELS.debug;

export const debug = (msg: string, level = LOG_LEVELS.info, data?: unknown) => {
  if (CONSOLE_OUTPUT){
    if (level === LOG_LEVELS.debug) {
      // eslint-ignore (no-console)
      console.debug(msg, data);
    }
    if (level === LOG_LEVELS.info) {
      console.log(msg, data);
    }
    if (level === LOG_LEVELS.warn) {
      console.warn(msg, data);
    }
    if (level === LOG_LEVELS.error) {
      console.error(msg, data);
    }
  }
};
