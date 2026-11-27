<script setup lang="ts">
/**
 * 应用头部：页面标题 + 当前用户区（真实认证）。
 * - 显示登录用户（displayName 回退 username）；
 * - 修改密码（PUT /auth/password，后端校验为最终防线）；
 * - 退出登录：调用登出（服务端记录 + 本地会话清理）后跳转登录页。
 */
import { computed, ref } from 'vue'

import { Menu, UserRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import FormField from '@/components/shared/FormField.vue'
import Button from '@/components/ui/button/Button.vue'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import Input from '@/components/ui/input/Input.vue'
import { useToast } from '@/components/ui/toast/useToast'
import { apiErrorMessage } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const auth = useAuthStore()
const toast = useToast()

const pageTitle = computed(() => String(route.meta.title ?? ''))
const userName = computed(() => auth.displayName)

/* ------------------------------- 修改密码 ------------------------------- */

const passwordDialogOpen = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordSubmitting = ref(false)

function openPasswordDialog(): void {
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  passwordError.value = ''
  passwordDialogOpen.value = true
}

function submitPassword(): void {
  if (oldPassword.value === '' || newPassword.value === '') {
    passwordError.value = '请输入原密码与新密码'
    return
  }
  if (newPassword.value.length > 128) {
    passwordError.value = '新密码长度不能超过 128'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  passwordSubmitting.value = true
  passwordError.value = ''
  void auth
    .changePassword(oldPassword.value, newPassword.value)
    .then(() => {
      passwordDialogOpen.value = false
      toast.success('密码修改成功')
    })
    .catch((error: unknown) => {
      passwordError.value = apiErrorMessage(error, '密码修改失败，请稍后重试。')
    })
    .finally(() => {
      passwordSubmitting.value = false
    })
}

/* -------------------------------- 登出 -------------------------------- */

const loggingOut = ref(false)

function onLogout(): void {
  loggingOut.value = true
  void auth
    .logout()
    .finally(() => {
      loggingOut.value = false
      void router.replace('/login')
    })
}
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-header items-center justify-between gap-4 border-b border-border bg-surface px-4"
    data-testid="header"
  >
    <div class="flex min-w-0 items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        class="lg:hidden"
        aria-label="打开导航菜单"
        data-testid="mobile-nav-open"
        @click="appStore.openMobileNav()"
      >
        <Menu class="size-4" />
      </Button>
      <p class="truncate text-body font-medium text-text-primary">{{ pageTitle }}</p>
    </div>

    <!-- 用户区：真实登录用户 + 修改密码 + 退出登录 -->
    <div class="flex items-center gap-1 sm:gap-2" data-testid="user-area">
      <div class="flex items-center gap-1.5 text-caption text-text-muted">
        <UserRound class="size-4" aria-hidden="true" />
        <span data-testid="user-name">{{ userName }}</span>
      </div>
      <Button variant="ghost" size="sm" data-testid="change-password-button" @click="openPasswordDialog">
        修改密码
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="logout-button"
        :disabled="loggingOut"
        @click="onLogout"
      >
        退出登录
      </Button>
    </div>
  </header>

  <Dialog
    v-model:open="passwordDialogOpen"
    title="修改密码"
    description="修改成功后请使用新密码登录。"
  >
    <form class="flex flex-col gap-4" data-testid="change-password-form" @submit.prevent="submitPassword">
      <FormField id="password-old" label="原密码" required>
        <Input
          id="password-old"
          v-model="oldPassword"
          type="password"
          aria-label="原密码"
          autocomplete="current-password"
        />
      </FormField>
      <FormField id="password-new" label="新密码" required>
        <Input
          id="password-new"
          v-model="newPassword"
          type="password"
          aria-label="新密码"
          autocomplete="new-password"
        />
      </FormField>
      <FormField id="password-confirm" label="确认新密码" required :error="passwordError">
        <Input
          id="password-confirm"
          v-model="confirmPassword"
          type="password"
          aria-label="确认新密码"
          autocomplete="new-password"
        />
      </FormField>
    </form>

    <template #footer>
      <Button variant="secondary" @click="passwordDialogOpen = false">取消</Button>
      <Button :disabled="passwordSubmitting" data-testid="change-password-submit" @click="submitPassword">
        {{ passwordSubmitting ? '提交中…' : '确认修改' }}
      </Button>
    </template>
  </Dialog>
</template>
