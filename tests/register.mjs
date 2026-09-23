// Cho phép `import x from './file.json'` (cú pháp Vite) chạy được trong node --test.
import { register } from 'node:module';

register('./json-hooks.mjs', import.meta.url);
