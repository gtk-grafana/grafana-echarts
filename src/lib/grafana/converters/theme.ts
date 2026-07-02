export const convertThemePxToNumeric = (value: string) => {
  return parseInt(value.slice(0, -2), 10);
};
