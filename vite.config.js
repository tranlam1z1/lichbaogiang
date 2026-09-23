import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Đường dẫn tương đối để có thể mở bản build ở thư mục con hoặc trên GitHub Pages.
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
