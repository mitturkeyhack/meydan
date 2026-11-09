import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  define: {
    __BUILD__: JSON.stringify(process.env.GITHUB_RUN_NUMBER || '0'),
    __REPO__: JSON.stringify(process.env.GITHUB_REPOSITORY || ''),
  },
});
