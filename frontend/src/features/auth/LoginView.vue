<script setup lang="ts">
/**
 * 登录页（真实认证 API）。
 * - 复用 FormField / Input / Button 视觉；用户名 + 密码；
 * - 后端校验为最终防线：401 展示「用户名或密码错误」，400 展示字段级/消息错误；
 * - 登录成功跳转原目标路由（redirect，应用内路径校验后回跳，默认 /workbench）。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import FormField from '@/components/shared/FormField.vue'
import { apiErrorMessage, fieldErrorOf } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import {
  emptyLoginForm,
  resolveLoginRedirect,
  validateLoginForm,
  type LoginFormErrors,
} from './loginModel'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const form = ref(emptyLoginForm())
const errors = ref<LoginFormErrors>({ username: '', password: '' })
const submitting = ref(false)
const errorText = ref('')

const canSubmit = computed(() => form.value.username.trim() !== '' && form.value.password !== '')

function onSubmit(): void {
  const validation = validateLoginForm(form.value)
  errors.value = validation
  if (validation.username !== '' || validation.password !== '') {
    return
  }
  submitting.value = true
  errorText.value = ''
  void auth
    .login(form.value.username.trim(), form.value.password)
    .then(() => {
      void router.replace(resolveLoginRedirect(route.query.redirect))
    })
    .catch((error: unknown) => {
      errorText.value =
        apiErrorMessage(error, '登录失败，请稍后重试。') ||
        '登录失败，请稍后重试。'
      errors.value = {
        username: fieldErrorOf(error, 'username') ?? '',
        password: fieldErrorOf(error, 'password') ?? '',
      }
    })
    .finally(() => {
      submitting.value = false
    })
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <div class="w-full max-w-sm rounded-panel border border-border bg-surface p-8" data-testid="login-panel">
      <h1 class="text-page-title font-semibold text-text-primary">工厂财务</h1>
      <p class="mt-1 text-body text-text-secondary">请登录后继续使用财务系统</p>

      <form class="mt-6 flex flex-col gap-4" data-testid="login-form" @submit.prevent="onSubmit">
        <FormField id="login-username" label="用户名" required :error="errors.username">
          <Input
            id="login-username"
            v-model="form.username"
            data-testid="login-username"
            placeholder="请输入用户名"
            :invalid="errors.username !== ''"
            aria-label="用户名"
          />
        </FormField>

        <FormField id="login-password" label="密码" required :error="errors.password">
          <Input
            id="login-password"
            v-model="form.password"
            data-testid="login-password"
            type="password"
            placeholder="请输入密码"
            :invalid="errors.password !== ''"
            aria-label="密码"
          />
        </FormField>

        <p
          v-if="errorText !== ''"
          class="text-caption text-danger-foreground"
          role="alert"
          data-testid="login-error"
        >
          {{ errorText }}
        </p>

        <Button type="submit" :disabled="!canSubmit || submitting" data-testid="login-submit">
          {{ submitting ? '登录中…' : '登录' }}
        </Button>
      </form>
    </div>
  </div>
</template>
