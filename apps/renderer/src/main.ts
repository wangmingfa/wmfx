import './lib/logger'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'
import { syncThemeToShell } from '@/composables/useTheme'

const app = createApp(App).use(createPinia()).use(router)

syncThemeToShell().then(() => {
  app.mount('#app')
})
