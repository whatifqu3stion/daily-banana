/** Conservative English monetary parsing. No floating-point amount comparison. */
export interface MoneyMention {
  raw: string;
  start: number;
  end: number;
  value?: string;
  currency?: string;
  quantum?: string;
}

const units: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const word = `(?:${Object.keys(units).join('|')}|hundred|and|point)`;
const number = `(?:\\d[\\d,]*(?:\\.\\d+)?|(?:${Object.keys(units).join('|')})(?:[ -]+${word})*)`;
const prefix = '(?:US\\$|CA\\$|C\\$|AU\\$|A\\$|NZ\\$|USD|EUR|GBP|CAD|AUD|NZD|JPY|[$€£])';
const suffix = '(?:US dollars?|Canadian dollars?|Australian dollars?|New Zealand dollars?|dollars?|euros?|pounds?|yen|USD|EUR|GBP|CAD|AUD|NZD|JPY)';
const currencyCode = (raw: string): string | undefined => {
  const key = raw.toLowerCase().replace(/\s+/g, ' ');
  if (/^(ca\$|c\$|cad|canadian dollars?)$/.test(key)) return 'CAD';
  if (/^(au\$|a\$|aud|australian dollars?)$/.test(key)) return 'AUD';
  if (/^(nz\$|nzd|new zealand dollars?)$/.test(key)) return 'NZD';
  if (/^(€|eur|euros?)$/.test(key)) return 'EUR';
  if (/^(£|gbp|pounds?)$/.test(key)) return 'GBP';
  if (/^(jpy|yen)$/.test(key)) return 'JPY';
  if (/^(\$|us\$|usd|(?:us )?dollars?)$/.test(key)) return 'USD';
};

function decimalNumber(raw: string): string | undefined {
  if (/^\d/.test(raw)) {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) return;
    return raw.replace(/,/g, '');
  }
  const tokens = raw.toLowerCase().split(/[ -]+/);
  const point = tokens.indexOf('point');
  if (point >= 0 && tokens.lastIndexOf('point') !== point) return;
  let whole = point < 0 ? tokens : tokens.slice(0, point);
  let value = 0;
  if (whole.includes('hundred')) {
    if (whole.indexOf('hundred') !== 1 || whole.lastIndexOf('hundred') !== 1 || !units[whole[0]] || units[whole[0]] > 9) return;
    value = units[whole[0]] * 100;
    whole = whole.slice(2);
    if (whole[0] === 'and') whole = whole.slice(1);
  }
  if (whole.length === 1 && units[whole[0]] !== undefined) value += units[whole[0]];
  else if (whole.length === 2 && units[whole[0]] >= 20 && units[whole[0]] % 10 === 0
    && units[whole[1]] > 0 && units[whole[1]] < 10) value += units[whole[0]] + units[whole[1]];
  else if (whole.length || !value) return;
  if (tokens.at(-1) === 'and') return;
  if (point < 0) {
    return String(value);
  }
  const digits = tokens.slice(point + 1);
  if (!digits.length || digits.some(token => units[token] === undefined || units[token] > 9)) return;
  return `${value}.${digits.map(token => units[token]).join('')}`;
}

const scalePowers: Record<string, number> = { k: 3, thousand: 3, m: 6, million: 6, bn: 9, b: 9, billion: 9, tn: 12, trillion: 12 };
function scaledDecimal(decimal: string, power: number): string {
  const [whole, fraction = ''] = decimal.split('.');
  const digits = (whole + fraction).replace(/^0+(?=\d)/, '');
  const shift = power - fraction.length;
  if (shift >= 0) return BigInt(digits + '0'.repeat(shift)).toString();
  const padded = digits.padStart(-shift + 1, '0');
  return `${BigInt(padded.slice(0, shift))}.${padded.slice(shift)}`.replace(/\.?0+$/, '');
}

export function moneyMentions(text: string): MoneyMention[] {
  const expression = new RegExp(`(?<![\\w.])(${prefix})?\\s*(${number})(?:\\s*(trillion|billion|million|thousand|bn|tn|[kmb])\\b)?(?:\\s*(${suffix})\\b)?`, 'gi');
  const mentions: MoneyMention[] = [];
  for (const match of text.matchAll(expression)) {
    if (!match[1] && !match[3] && !match[4]) continue;
    // Scaled counts are not money. Unknown units are left for explicit review.
    if (!match[1] && !match[4] && /^\s*(?:%|percent|votes?|voters?|people|users?|jobs?|employees?|minutes?|years?|tons?|tonnes?|barrels?|doses?)\b/i.test(text.slice(match.index! + match[0].length))) continue;
    const raw = match[0].trim();
    const decimal = decimalNumber(match[2]);
    const power = scalePowers[(match[3] || '').toLowerCase()] || 0;
    const left = match[1] ? currencyCode(match[1]) : undefined;
    const right = match[4] ? currencyCode(match[4]) : undefined;
    const fraction = decimal?.split('.')[1]?.length || 0;
    mentions.push({
      raw, start: match.index! + match[0].indexOf(raw), end: match.index! + match[0].length,
      value: decimal !== undefined && !(left && right && left !== right) ? scaledDecimal(decimal, power) : undefined,
      currency: left || right,
      quantum: decimal !== undefined ? scaledDecimal('1', power - fraction) : undefined,
    });
  }
  return mentions;
}

/** Nearest displayed unit, less than 1% relative error, and explicit human approval. */
export function isPermittedRounding(source: string, mention: MoneyMention): boolean {
  if (!mention.value || !mention.quantum) return false;
  const a = Number(source), b = Number(mention.value), q = Number(mention.quantum);
  return Number.isFinite(a) && Number.isFinite(b) && a > 0 && q > 0 && a !== b
    && Math.abs(a - b) / a <= 0.01 && Math.abs(a - b) <= q / 2
    && Math.round(a / q) * q === b;
}
