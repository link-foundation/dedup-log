import path from 'node:path';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const formatDate = (date) => {
  const yyyy = date.getUTCFullYear().toString().padStart(4, '0');
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = date.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const parseDate = (str) => {
  if (!DATE_RE.test(str)) {
    throw new Error(`Invalid date "${str}"; expected YYYY-MM-DD`);
  }
  return new Date(`${str}T00:00:00Z`);
};

export const dayDiff = (a, b) => {
  const ms =
    parseDate(formatDate(a)).getTime() - parseDate(formatDate(b)).getTime();
  return Math.round(ms / 86_400_000);
};

export const logPath = (dir, date) => path.join(dir, `${formatDate(date)}.log`);
export const linoPath = (dir, date) =>
  path.join(dir, `${formatDate(date)}.log.lino`);
export const dictionaryPath = (dir) => path.join(dir, 'dictionary.log.lino');
