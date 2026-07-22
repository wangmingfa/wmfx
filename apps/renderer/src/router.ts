import { createRouter, createWebHashHistory } from 'vue-router'

import ChromeUI from './components/ChromeUI.vue'
import PanelRoot from './panel/PanelRoot.vue'
import BookmarkView from './views/BookmarkView.vue'
import CertWarningView from './views/CertWarningView.vue'
import DownloadsView from './views/DownloadsView.vue'
import ErrorView from './views/ErrorView.vue'
import FilesView from './views/files/FilesView.vue'
import HistoryView from './views/HistoryView.vue'
import InterceptorView from './views/interceptor/InterceptorView.vue'
import NewTabView from './views/NewTab.vue'
import PasswordsView from './views/PasswordsView.vue'
import ProxyPage from './views/ProxyPage.vue'
import ReaderView from './views/ReaderView.vue'
import SettingsView from './views/settings/SettingsView.vue'

console.debug('[Router] 创建 hash 路由并注册路由表')

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: ChromeUI },
    { path: '/settings', redirect: '/settings/appearance' },
    { path: '/settings/appearance', component: SettingsView },
    { path: '/settings/general', component: SettingsView },
    { path: '/settings/downloads', component: SettingsView },
    { path: '/settings/about', component: SettingsView },
    { path: '/settings/privacy', component: SettingsView },
    { path: '/settings/shortcuts', component: SettingsView },
    { path: '/history', component: HistoryView },
    { path: '/bookmarks', component: BookmarkView },
    { path: '/passwords', component: PasswordsView },
    { path: '/downloads', component: DownloadsView },
    { path: '/proxy', component: ProxyPage },
    { path: '/interceptor', component: InterceptorView },
    { path: '/reader', component: ReaderView },
    { path: '/newtab', component: NewTabView },
    { path: '/panel', component: PanelRoot },
    { path: '/error', component: ErrorView },
    { path: '/cert-warning', component: CertWarningView },
    { path: '/files/:pathMatch(.*)*', component: FilesView },
    { path: '/ftp/:pathMatch(.*)*', component: FilesView },
    { path: '/sftp/:pathMatch(.*)*', component: FilesView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to, from) => {
  console.debug('[Router] 导航：-> ', from.fullPath, to.fullPath)
})
router.afterEach((to) => {
  console.debug('[Router] 导航完成：', to.fullPath)
})
