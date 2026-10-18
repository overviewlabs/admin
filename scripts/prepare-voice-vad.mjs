import { createRequire } from 'node:module';
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(root, 'ui/package.json'));
const dist = dirname(require.resolve('onnxruntime-web/wasm'));
for (const name of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copyFileSync(join(dist, name), join(root, 'ui/public/voice-vad', name));
}
