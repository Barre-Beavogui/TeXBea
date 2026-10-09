import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';
export default defineConfig({base:process.env.VITE_BASE_PATH||'/',plugins:[react()],server:{proxy:{'/api':'http://localhost:8787','/ws':{target:'ws://localhost:8787',ws:true}}}})
