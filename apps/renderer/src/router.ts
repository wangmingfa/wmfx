import { createRouter, createWebHashHistory } from 'vue-router'

import ChromeUI from './components/ChromeUI.vue'
import PanelRoot from './panel/PanelRoot.vue'
import BookmarkView from './views/BookmarkView.vue'
import CertWarningView from './views/CertWarningView.vue'
import DownloadsView from './views/DownloadsView.vue'
import ErrorView from './views/ErrorView.vue'
import HistoryView from './views/HistoryView.vue'
import NewTabView from './views/NewTab.vue'
import ProxyPage from './views/ProxyPage.vue'
import SettingsView from './views/settings/SettingsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: ChromeUI },
    { path: '/settings', redirect: '/settings/appearance' },
    { path: '/settings/appearance', component: SettingsView },
    { path: '/settings/general', component: SettingsView },
    { path: '/settings/downloads', component: SettingsView },
    { path: '/settings/about', component: SettingsView },
    { path: '/history', component: HistoryView },
    { path: '/bookmarks', component: BookmarkView },
    { path: '/downloads', component: DownloadsView },
    { path: '/proxy', component: ProxyPage },
    { path: '/newtab', component: NewTabView },
    { path: '/panel', component: PanelRoot },
    { path: '/error', component: ErrorView },
    { path: '/cert-warning', component: CertWarningView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
