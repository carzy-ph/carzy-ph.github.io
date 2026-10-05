import { createRouter, createWebHashHistory } from 'vue-router';
import { isAdmin, store } from './store';
import AgentsView from './views/AgentsView.vue';
import AgentEditView from './views/AgentEditView.vue';
import ApplicationsView from './views/ApplicationsView.vue';
import UnitsView from './views/UnitsView.vue';

// Hash URLs (/admin/#/applications) so GitHub Pages never needs to know about portal routes.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: () => (store.area === 'admin' ? '/agents' : '/my-card') },
    { path: '/agents', component: AgentsView, meta: { admin: true } },
    { path: '/agents/new', component: AgentEditView, meta: { admin: true }, props: { id: null } },
    { path: '/agents/:id', component: AgentEditView, meta: { admin: true }, props: true },
    { path: '/units', component: UnitsView, meta: { admin: true } },
    { path: '/my-card', component: AgentEditView, props: () => ({ id: store.me?.agent_id ?? null }) },
    { path: '/applications/:id?', component: ApplicationsView, props: true },
    { path: '/:rest(.*)*', redirect: '/' }
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 }
});

router.beforeEach(to => {
  if (store.phase === 'ready' && to.meta.admin && !isAdmin.value) return '/my-card';
  if (store.phase === 'ready' && to.path === '/my-card' && isAdmin.value) return '/agents';
});
