import { createRouter, createWebHashHistory } from 'vue-router'

import ChromeUI from './components/ChromeUI.vue'
import BookmarkView from './views/BookmarkView.vue'
import DownloadsView from './views/DownloadsView.vue'
import HistoryView from './views/HistoryView.vue'
import NewTabView from './views/NewTab.vue'
import ProxyPage from './views/ProxyPage.vue'
import AboutView from './views/settings/AboutView.vue'
import AppearanceView from './views/settings/AppearanceView.vue'
import GeneralView from './views/settings/GeneralView.vue'
import SettingsDownloadsView from './views/settings/SettingsDownloadsView.vue'
import SettingsLayout from './views/settings/SettingsLayout.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: ChromeUI },
    {
      path: '/settings',
      component: SettingsLayout,
      redirect: '/settings/appearance',
      children: [
        { path: 'appearance', component: AppearanceView },
        { path: 'general', component: GeneralView },
        { path: 'downloads', component: SettingsDownloadsView },
        { path: 'about', component: AboutView },
      ],
    },
    { path: '/history', component: HistoryView },
    { path: '/bookmarks', component: BookmarkView },
    { path: '/downloads', component: DownloadsView },
    { path: '/proxy', component: ProxyPage },
    { path: '/newtab', component: NewTabView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
