import './lib/logger'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'
import { syncThemeToShell } from '@/composables/useTheme'

console.debug('[main] 启动：创建 app 实例并挂载插件')
const app = createApp(App).use(createPinia()).use(router)

syncThemeToShell().then(() => {
  console.debug('[main] 主题同步完成，挂载根组件')
  app.mount('#app')
})
