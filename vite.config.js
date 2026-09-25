import {defineConfig} from 'vite';

export default defineConfig(({command,isPreview})=>({
  // Development stays at localhost's root; builds are hosted as a project site.
  base:command==='serve'&&!isPreview?'/':'/water-studio/',
}));
