import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/app/App.vue'
import { installAuthBridge } from '@/app/authBridge'
import router, { setAuthGuardStateProvider } from '@/router'
import { useAuthStore } from '@/stores/auth'
import '@/styles/tailwind.css'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)

// 会话恢复必须在首次导航前完成（路由守卫依赖 auth 状态）
const auth = useAuthStore()
auth.restoreSession()

// 路由守卫的认证状态提供者（守卫不直接解析 Pinia）
setAuthGuardStateProvider(() => useAuthStore().isAuthenticated)

// 401 统一登出 + 跳登录（API 层 → 路由/会话的唯一装配点）
installAuthBridge(router)

app.use(router)

app.mount('#app')
