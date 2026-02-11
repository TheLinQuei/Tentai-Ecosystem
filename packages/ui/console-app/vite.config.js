var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var basePath = ((_a = process.env.VITE_BASE) === null || _a === void 0 ? void 0 : _a.trim()) || '/console/';
export default defineConfig({
    base: basePath,
    plugins: [react()],
    server: {
        port: 5173,
    },
});
