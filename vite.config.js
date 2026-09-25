import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Dùng đường dẫn tuyệt đối vì có router (/dang-nhap, /admin/...). Triển khai ở thư mục con thì đặt VITE_BASE, ví dụ /khbd/.
  base: process.env.VITE_BASE || '/',
  server: {
    // Khi dev, chuyển /api sang backend để frontend và API cùng origin (cookie httpOnly hoạt động bình thường).
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://localhost:4000',
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
