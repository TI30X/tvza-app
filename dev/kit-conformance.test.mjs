import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

// Opt-in: a page joins this list in the commit that migrates it onto the
// Bausatz. Never remove an entry — a page that regresses fails its own line.
const MIGRIERT = [
  'pages/bereiche.html',
  // 'pages/skitracker.html',   ← add on migration
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const STYLE_ATTR_RE = /\sstyle\s*=\s*["']/;
const STYLE_TAG_RE = /<style[\s>]/i;
const RADIUS_TOKENS = ['var(--r-icon)', 'var(--r-row)', 'var(--r-panel)', 'var(--r-pill)'];

// theme-color and the favicon are unavoidably hex — a <meta> value and a
// data: URI can't reference a CSS custom property. Every page in MIGRIERT
// carries one theme-color meta, including pages/bereiche.html, so it's
// stripped before the hex scan rather than treated as a violation.
function stripAllowedHex(html) {
  return html
    .replace(/<meta[^>]*name=["']theme-color["'][^>]*>/gi, '')
    .replace(/<link[^>]*rel=["']icon["'][^>]*>/gi, '');
}

// HTML comments can legitimately mention "<style>" in prose (bereiche.html
// does, explaining why it has none) — strip comments before any text scan
// so prose never counts as markup.
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function extractFeatureCssLinks(html) {
  const links = [...html.matchAll(/<link[^>]*href=["']([^"']*assets\/css\/feature\/[^"']+\.css)[^"']*["'][^>]*>/gi)];
  return links.map(([, href]) => 'assets/css/feature/' + href.split('assets/css/feature/')[1].split('?')[0]);
}

for (const relative of MIGRIERT) {
  test(`${relative}: 0 bytes of <style>`, async () => {
    const html = await read(relative);
    assert.doesNotMatch(stripComments(html), STYLE_TAG_RE);
  });

  test(`${relative}: every module script carries src, none inline`, async () => {
    const html = await read(relative);
    const scripts = [...html.matchAll(/<script\b([^>]*)type=["']module["']([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const [, before, after, body] of scripts) {
      const hasSrc = /\bsrc\s*=/.test(before) || /\bsrc\s*=/.test(after);
      assert.ok(hasSrc, `${relative} has a <script type="module"> without src`);
      assert.equal(body.trim(), '', `${relative} has a non-empty inline module body`);
    }
  });

  test(`${relative}: 0 style="…" attributes`, async () => {
    const html = await read(relative);
    assert.doesNotMatch(stripComments(html), STYLE_ATTR_RE);
  });

  test(`${relative}: 0 hex colours`, async () => {
    const html = await read(relative);
    assert.doesNotMatch(stripAllowedHex(stripComments(html)), HEX_RE);
  });

  test(`${relative}: 0 emoji as function symbols`, async () => {
    const html = await read(relative);
    assert.doesNotMatch(html, EMOJI_RE);
  });

  // CSS content checks, scoped to exactly the assets/css/feature/*.css
  // files this page links (not the whole feature/ directory, and not
  // kit.css). Other feature/*.css files (access.css, calendar.css, …)
  // still carry pre-existing radius/box-shadow/hover-transform debt
  // inherited verbatim from the pre-kit style.css monolith (Auftrag 01's
  // "cut and paste only, no value changes" rule) — their own page hasn't
  // been through Phase C yet, so their CSS isn't in scope until it is.
  // kit.css has the same kind of debt (see e.g. .card/.tile/.link-list > a
  // and .nav__item/.modal) and is excluded for the same reason — cleaning
  // it is a separate, later session's work, not this page migration's.
  const cssFiles = await extractFeatureCssLinks(await read(relative));

  test(`${relative}: linked feature CSS — every border-radius is a scale token`, async () => {
    for (const cssRelative of cssFiles) {
      const css = await read(cssRelative);
      const declarations = [...css.matchAll(/border-radius\s*:\s*([^;]+);/g)].map(m => m[1].trim());
      for (const value of declarations) {
        assert.ok(
          RADIUS_TOKENS.includes(value),
          `${cssRelative} has border-radius: ${value} — not one of ${RADIUS_TOKENS.join(', ')}`
        );
      }
    }
  });

  test(`${relative}: linked feature CSS — box-shadow only inside .reorder-clone`, async () => {
    for (const cssRelative of cssFiles) {
      const css = await read(cssRelative);
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      for (const [, selector, body] of rules) {
        if (/box-shadow/.test(body)) {
          assert.match(selector, /\.reorder-clone/, `${cssRelative} has box-shadow outside .reorder-clone: ${selector.trim()}`);
        }
      }
    }
  });

  test(`${relative}: linked feature CSS — no :hover rule contains transform`, async () => {
    for (const cssRelative of cssFiles) {
      const css = await read(cssRelative);
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      for (const [, selector, body] of rules) {
        if (/:hover/.test(selector)) {
          assert.doesNotMatch(body, /transform\s*:/, `${cssRelative} has a :hover rule with transform: ${selector.trim()}`);
        }
      }
    }
  });
}
