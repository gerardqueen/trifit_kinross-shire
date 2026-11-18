// Builds the app's web content into www/ from the members page in the repo root, so the app and
// the website always share one codebase. The scripts are bundled into one file (supabase-js is
// included from npm rather than loaded from a CDN), and app.html becomes the app's index.html.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');      // the website
const out = join(here, '..', 'www');
const require = createRequire(import.meta.url);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'js'), { recursive: true });

// The website loads supabase-js from jsDelivr on demand; in the app it comes from npm instead.
const supabaseFromNpm = {
  name: 'supabase-from-npm',
  setup(b) {
    b.onResolve({ filter: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/ }, () => ({
      path: require.resolve('@supabase/supabase-js'),
    }));
  },
};
await build({
  entryPoints: [join(root, 'js', 'app.js')],
  outfile: join(out, 'js', 'app.js'),
  bundle: true, format: 'esm', target: ['safari15'], minify: true, sourcemap: false,
  plugins: [supabaseFromNpm], logLevel: 'warning',
});

cpSync(join(root, 'css'), join(out, 'css'), { recursive: true });
mkdirSync(join(out, 'img'), { recursive: true });
cpSync(join(root, 'img', 'logo.png'), join(out, 'img', 'logo.png'));

let html = readFileSync(join(root, 'app.html'), 'utf8');
html = html.replace('<meta name="robots" content="noindex">\n', '').replace('<title>TRI FIT members</title>', '<title>TRI FIT</title>');
if (!html.includes('<script type="module" src="js/app.js"></script>')) throw new Error('app.html script tag not found');
writeFileSync(join(out, 'index.html'), html);
console.log('Built www/ from app.html');
