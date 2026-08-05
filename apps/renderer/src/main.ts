import './lib/logger'
import { addCollection } from '@iconify/vue/dist/offline'
import carbon from '@iconify-json/carbon/icons.json'
import ic from '@iconify-json/ic/icons.json'
import logos from '@iconify-json/logos/icons.json'
import mdi from '@iconify-json/mdi/icons.json'
import selfhst from '@iconify-json/selfhst/icons.json'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'
import { syncThemeToShell } from '@/composables/useTheme'

// 离线图标集预加载：@iconify/vue 默认走在线 API，使用 dist/offline 版时需手动注入本地集合
addCollection(mdi)
addCollection(ic)
addCollection(carbon)
addCollection(logos)
addCollection(selfhst)

console.debug('[main] 启动：创建 app 实例并挂载插件')
const app = createApp(App).use(createPinia()).use(router)

syncThemeToShell().then(() => {
  console.debug('[main] 主题同步完成，挂载根组件')
  app.mount('#app')
})
