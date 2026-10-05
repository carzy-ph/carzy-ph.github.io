// Starts the portal app for one area. Admins use /admin/, agents use /portal/; both run this same app,
// and the database rules decide what each person can see.
import { createApp } from 'vue';
import '@/styles/tokens.css';
import '@/styles/admin.css';
import App from './App.vue';
import { router } from './router';
import { boot, store, type Area } from './store';

export function start(area: Area) {
  store.area = area;
  createApp(App).use(router).mount('#app');
  boot();
}
