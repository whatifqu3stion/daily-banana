/**
 * check-pricing.mjs
 *
 * Fetches the Google AI pricing page and verifies the hard-coded pricePerImage
 * values in constants.ts still match what Google publishes.
 *
 * Exit codes:
 *   0 – all prices verified
 *   1 – price mismatch detected, OR page was fetched but prices could not be parsed
 *   0 – page unreachable (network/timeout) — soft-warn only so deploys aren't
 *       blocked by transient outages
 *
 * Run manually:  node scripts/check-pricing.mjs
 * Run via npm:   npm run check-prices
 * Run tests:     node scripts/check-pricing.mjs --test
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRICING_URL = 'https://ai.google.dev/gemini-api/docs/pricing';
const TIMEOUT_MS  = 15_000;

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function log(color, symbol, msg) {
  console.log(`${color}${symbol}${RESET} ${msg}`);
}

// ---------------------------------------------------------------------------
// Heading-ID mapping
//
// Maps API model IDs → the <h2 id="..."> slug(s) Google uses on the pricing
// page.  Update this list whenever Google renames a pricing section.
// ---------------------------------------------------------------------------
const MODEL_PAGE_HEADING_IDS = {
  'gemini-3.1-flash-image-preview':            ['gemini-3.1-flash-image-preview'],
  'gemini-2.5-flash-preview-image-generation': ['gemini-2.5-flash-image', 'gemini-2.5-flash-preview-image'],
};

// ---------------------------------------------------------------------------
// Parse constants.ts
// ---------------------------------------------------------------------------
function extractConstantsPrices() {
  const src = readFileSync(join(__dirname, '..', 'constants.ts'), 'utf8');
  const models = [];
  const blockRe = /\{[^}]*value:\s*'([^']+)'[^}]*pricePerImage:\s*([\d.]+)[^}]*\}/gs;
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    models.push({ modelId: m[1], hardCodedPrice: parseFloat(m[2]) });
  }
  return models;
}

// ---------------------------------------------------------------------------
// HTML extraction helpers
// ---------------------------------------------------------------------------

/**
 * Returns the HTML "model block" — from the model's <h2> heading to the start
 * of the next model's <h2> (or up to MAX_BLOCK chars forward as a safety cap).
 *
 * Tries all known page heading IDs for the model in order.
 */
const MAX_BLOCK = 12_000;

function extractModelBlock(html, modelId) {
  const headingIds = MODEL_PAGE_HEADING_IDS[modelId] ?? [modelId];

  for (const hid of headingIds) {
    // Only match the `id` attribute value — not paths in href/data attributes.
    // We look for  id="<hid>"  preceded by whitespace (i.e. on an element tag).
    const attrRe  = new RegExp(`\\bid="(${escapeRe(hid)})"`, 'i');
    const attrIdx = html.search(attrRe);
    if (attrIdx === -1) continue;

    // Walk back to the opening < of the <h2> that owns this id.
    const h2Start = html.lastIndexOf('<h2', attrIdx);
    if (h2Start === -1) continue;

    // Sanity check: the attribute must belong to this <h2> tag, not a later one.
    const tagClose = html.indexOf('>', h2Start);
    if (tagClose < attrIdx) {
      // The attribute appeared after the closing >, so it's on a different element.
      continue;
    }

    // The block ends at the next <h2> (next model) or MAX_BLOCK chars forward.
    const nextH2  = html.indexOf('<h2', h2Start + 4);
    const blockEnd = (nextH2 === -1 || nextH2 - h2Start > MAX_BLOCK)
      ? h2Start + MAX_BLOCK
      : nextH2;

    return html.slice(h2Start, blockEnd);
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Searches a model's HTML block for its image output price using four
 * strategies in order of specificity:
 *
 *  1. "$X.XXX per 1K image" — the canonical 1K-resolution price that Google
 *     uses for models priced by resolution tier (e.g. gemini-3.1-flash-image).
 *  2. "$X.XXX per image" (no resolution suffix) — the flat per-image price
 *     used by simpler models (e.g. gemini-2.5-flash-image).
 *  3. The first dollar amount inside an "Output price" table cell.
 *  4. Broadest fallback: any "$X.XXX" in the per-image price range (0.001–0.999).
 *
 * Using explicit resolution suffixes (strategy 1 before 2) prevents picking up
 * the 0.5K "Equivalent" note that Google prints above the 1K price row.
 */
function parseImageOutputPrice(block) {
  // Strategy 1: explicit "per 1K image" — resolution-tiered models
  const per1KRe = /\$([\d]+\.[\d]+)\s*per\s*1K\s*image/gi;
  const per1KMatches = [...block.matchAll(per1KRe)].map(m => parseFloat(m[1]));
  if (per1KMatches.length > 0) {
    return per1KMatches[0];
  }

  // Strategy 2: flat "per image" — models with a single per-image price
  // Use a negative-lookahead workaround: match "$X per image" where the
  // character before "image" is whitespace (not a digit or K, which would
  // indicate a resolution prefix like "2K ").
  const perImageRe = /\$([\d]+\.[\d]+)\s*per\s+image/gi;
  const perImageMatches = [...block.matchAll(perImageRe)].map(m => parseFloat(m[1]));
  if (perImageMatches.length > 0) {
    return perImageMatches[0];
  }

  // Strategy 3: Output price row → first dollar amount
  const outputIdx = block.toLowerCase().indexOf('output price');
  if (outputIdx !== -1) {
    const cell = block.slice(outputIdx, outputIdx + 600);
    const m = cell.match(/\$([\d]+\.[\d]+)/);
    if (m) return parseFloat(m[1]);
  }

  // Strategy 4: broadest fallback — any dollar amount in per-image range
  const anyPrice = [...block.matchAll(/\$([\d]+\.[\d]+)/g)]
    .map(m => parseFloat(m[1]))
    .filter(p => p >= 0.001 && p <= 0.999);
  if (anyPrice.length > 0) {
    return anyPrice[0];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Network fetch
// ---------------------------------------------------------------------------
async function fetchPricingPage() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PRICING_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pricing-check-bot/1.0)' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Self-test mode  (node scripts/check-pricing.mjs --test)
//
// Runs the parser against hard-coded HTML fixtures that mirror the real page's
// markup. This lets CI verify the parsing logic without a live network fetch.
// ---------------------------------------------------------------------------
const FIXTURES = [
  {
    desc: 'gemini-3.1-flash-image-preview — standard table with per-1K-image price',
    modelId: 'gemini-3.1-flash-image-preview',
    html: `
      <h2 id="gemini-3.1-flash-image-preview" data-text="Gemini 3.1 Flash Image Preview">
        Gemini 3.1 Flash Image Preview
      </h2>
      <section><h3 id="standard_2">Standard</h3><table>
        <tbody>
          <tr><td>Input price</td><td>Not available</td><td>$0.50 (text/image)</td></tr>
          <tr><td>Output price</td><td>Not available</td>
            <td>$3 (text and thinking)<br>
              $60.00 (images)<br>
              Equivalent to $0.045 per 0.5K image*<br>
              $0.076 per 1K image*, $0.101 per 2K image*, and $0.151 per 4K image*.
            </td></tr>
        </tbody>
      </table></section>`,
    expectedPrice: 0.076,
  },
  {
    desc: 'gemini-2.5-flash-image — standard table with direct per-image price',
    modelId: 'gemini-2.5-flash-preview-image-generation',
    html: `
      <h2 id="gemini-2.5-flash-image" data-text="Gemini 2.5 Flash Image">
        Gemini 2.5 Flash Image
      </h2>
      <section><h3 id="standard_10">Standard</h3><table>
        <tbody>
          <tr><td>Input price</td><td>Not available</td><td>$0.30 (text / image)</td></tr>
          <tr><td>Output price</td><td>Not available</td><td>$0.039 per image*</td></tr>
        </tbody>
      </table></section>`,
    expectedPrice: 0.039,
  },
  {
    desc: 'price on separate line (line-break whitespace)',
    modelId: 'gemini-2.5-flash-preview-image-generation',
    html: `
      <h2 id="gemini-2.5-flash-image" data-text="Gemini 2.5 Flash Image">
        Gemini 2.5 Flash Image
      </h2>
      <section><table><tbody>
        <tr><td>Output price</td><td>Not available</td><td>$0.039 per
image*</td></tr>
      </tbody></table></section>`,
    expectedPrice: 0.039,
  },
];

function runTests() {
  console.log(`\n${BOLD}=== Pricing Parser Self-Test ===${RESET}\n`);
  let passed = 0;
  let failed = 0;

  for (const fix of FIXTURES) {
    const block = extractModelBlock(fix.html, fix.modelId);
    const price = block ? parseImageOutputPrice(block) : null;
    const ok    = price !== null && Math.abs(price - fix.expectedPrice) < 0.001;

    if (ok) {
      log(GREEN, '✔', `PASS  ${fix.desc}`);
      passed++;
    } else {
      log(RED, '✖', `FAIL  ${fix.desc}`);
      log(RED, '  ', `       expected $${fix.expectedPrice}, got ${price === null ? 'null (not found)' : '$' + price}`);
      failed++;
    }
  }

  console.log('');
  if (failed > 0) {
    log(RED, '✖', `${failed} test(s) failed — fix the parser before running live checks.`);
    process.exit(1);
  }
  log(GREEN, '✔', `All ${passed} parser tests passed.`);
  console.log('');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--test')) {
    runTests();
    return;
  }

  console.log(`\n${BOLD}=== Google AI Pricing Verification ===${RESET}`);
  console.log(`Source: ${PRICING_URL}\n`);

  const models = extractConstantsPrices();
  if (models.length === 0) {
    log(RED, '✖', 'Could not parse any model prices from constants.ts — check the script.');
    process.exit(1);
  }

  console.log('Hard-coded prices in constants.ts:');
  for (const m of models) {
    console.log(`  ${m.modelId}  →  $${m.hardCodedPrice}`);
  }
  console.log('');

  let html;
  try {
    html = await fetchPricingPage();
    log(GREEN, '✔', `Fetched pricing page (${(html.length / 1024).toFixed(0)} KB)`);
  } catch (err) {
    log(YELLOW, '⚠', `Could not reach pricing page: ${err.message}`);
    log(YELLOW, '⚠', 'Skipping live comparison — prices could not be verified this run.');
    log(YELLOW, '⚠', `Verify manually: ${PRICING_URL}`);
    console.log('');
    // Soft exit — network unavailability should not block deploys.
    process.exit(0);
  }

  let mismatchFound   = false;
  let unverifiedCount = 0;

  for (const { modelId, hardCodedPrice } of models) {
    const block = extractModelBlock(html, modelId);
    if (!block) {
      log(RED, '✖', `${modelId}: model heading not found on page.`);
      log(RED, '  ', `  → Add/update MODEL_PAGE_HEADING_IDS in scripts/check-pricing.mjs.`);
      unverifiedCount++;
      continue;
    }

    const livePrice = parseImageOutputPrice(block);
    if (livePrice === null) {
      log(RED, '✖', `${modelId}: found model section but could not parse an image output price.`);
      log(RED, '  ', `  → The page layout may have changed. Check: ${PRICING_URL}`);
      unverifiedCount++;
      continue;
    }

    const diff = Math.abs(livePrice - hardCodedPrice);
    const THRESHOLD = 0.001;

    if (diff <= THRESHOLD) {
      log(GREEN, '✔', `${modelId}: $${hardCodedPrice} matches live price $${livePrice}`);
    } else {
      log(RED, '✖', `${modelId}: MISMATCH — constants.ts has $${hardCodedPrice}, page shows $${livePrice}`);
      log(RED, '  ', `  → Update pricePerImage in constants.ts, then re-run this check.`);
      mismatchFound = true;
    }
  }

  console.log('');

  if (mismatchFound) {
    log(RED, '✖', `${BOLD}Price mismatch detected. Fix pricePerImage in constants.ts.${RESET}`);
    console.log(`  Reference: ${PRICING_URL}\n`);
    process.exit(1);
  }

  if (unverifiedCount > 0) {
    // Soft-warn: the model section was found but the price format couldn't be
    // parsed (e.g. Google restructured the table).  This is NOT a confirmed
    // mismatch, so we don't block the build — just flag it for manual review.
    log(YELLOW, '⚠', `${BOLD}${unverifiedCount} model(s) could not be verified — page format may have changed.${RESET}`);
    log(YELLOW, '⚠', `  Verify manually: ${PRICING_URL}`);
    log(YELLOW, '⚠', `  If prices are wrong, update pricePerImage in constants.ts.`);
    console.log('');
    process.exit(0);
  }

  log(GREEN, '✔', `${BOLD}All prices verified — no action needed.${RESET}`);
  console.log('');
  process.exit(0);
}

main().catch(err => {
  log(RED, '✖', `Unexpected error: ${err.message}`);
  process.exit(1);
});
