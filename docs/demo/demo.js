/**
 * Browser-only line-level deduplication that mirrors deduplino's behaviour
 * for the common case (whole repeated lines collapsed into a numeric Lino
 * dictionary). The full deduplino algorithm also extracts repeated sub-line
 * fragments — that part is intentionally out of scope for the static demo,
 * which exists to give visitors a feel for the .log.lino layout without
 * shipping a Node bundle.
 */

const SAMPLE = [
  '[2026-01-01T12:00:00.000Z] [INFO] request handled in 12ms',
  '[2026-01-01T12:00:01.117Z] [INFO] request handled in 12ms',
  '[2026-01-01T12:00:02.310Z] [WARN] cache miss for key user:42',
  '[2026-01-01T12:00:03.554Z] [INFO] request handled in 12ms',
  '[2026-01-01T12:00:04.887Z] [INFO] request handled in 12ms',
  '[2026-01-01T12:00:05.001Z] [WARN] cache miss for key user:42',
  '[2026-01-01T12:00:06.412Z] [ERROR] upstream timeout after 30000ms',
  '[2026-01-01T12:00:07.998Z] [INFO] request handled in 12ms',
  '[2026-01-01T12:00:09.221Z] [WARN] cache miss for key user:42',
  '[2026-01-01T12:00:10.402Z] [INFO] request handled in 12ms',
].join('\n');

const TIMESTAMP_RE =
  /^(\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\])\s*(.*)$/;

const escapeForLino = (value) => {
  if (/^[\d_a-z]+$/i.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "\\'")}'`;
};

const dedupe = (input, threshold) => {
  const lines = input.split('\n').filter((l) => l.length > 0);
  const split = lines.map((line) => {
    const match = TIMESTAMP_RE.exec(line);
    if (match) {
      return { prefix: match[1], rest: match[2] };
    }
    return { prefix: '', rest: line };
  });

  const counts = new Map();
  for (const { rest } of split) {
    counts.set(rest, (counts.get(rest) ?? 0) + 1);
  }

  const dictionary = new Map();
  let nextId = 1;
  for (const [body, count] of counts) {
    if (count >= threshold && body.length > 0) {
      dictionary.set(body, nextId++);
    }
  }

  const dictLines = Array.from(dictionary.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([body, id]) => `${id}: ${body}`);

  const bodyLines = split.map(({ prefix, rest }) => {
    const id = dictionary.get(rest);
    const tail = id !== undefined ? String(id) : escapeForLino(rest);
    if (!prefix) {
      return tail;
    }
    return `${escapeForLino(prefix)} ${tail}`;
  });

  return {
    output: [...dictLines, ...bodyLines].join('\n'),
    patterns: dictionary.size,
    rawLines: lines.length,
    rawBytes: new Blob([input]).size,
    outputBytes: new Blob([[...dictLines, ...bodyLines].join('\n')]).size,
  };
};

const $ = (id) => document.getElementById(id);

const render = () => {
  const threshold = Math.max(1, Number($('threshold').value) || 2);
  const result = dedupe($('input').value, threshold);
  $('output').value = result.output;
  const ratio =
    result.rawBytes > 0
      ? ((1 - result.outputBytes / result.rawBytes) * 100).toFixed(1)
      : '0.0';
  $('stats').textContent =
    `${result.rawLines} lines · ${result.rawBytes} → ${result.outputBytes} bytes` +
    ` · ${result.patterns} pattern${result.patterns === 1 ? '' : 's'} extracted` +
    ` · ${ratio}% smaller`;
};

const reset = () => {
  $('input').value = SAMPLE;
  $('threshold').value = '2';
  render();
};

$('run').addEventListener('click', render);
$('reset').addEventListener('click', reset);
$('input').addEventListener('input', render);
$('threshold').addEventListener('input', render);

reset();
