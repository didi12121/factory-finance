import { readonly, ref } from 'vue'

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger'

export interface ToastMessage {
  id: number
  variant: ToastVariant
  title: string
  description?: string
}

const toasts = ref<ToastMessage[]>([])
let nextId = 1

/**
 * 轻量 Toast（模块级单例状态）。
 * 由 App 根部挂载的 Toaster.vue 统一渲染。
 */
export function useToast() {
  function show(input: { title: string; description?: string; variant?: ToastVariant; duration?: number }): number {
    const id = nextId++
    toasts.value = [
      ...toasts.value,
      { id, variant: input.variant ?? 'info', title: input.title, description: input.description },
    ]
    window.setTimeout(() => dismiss(id), input.duration ?? 5000)
    return id
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  return {
    toasts: readonly(toasts),
    show,
    dismiss,
    success: (title: string, description?: string) => show({ title, description, variant: 'success' }),
    warning: (title: string, description?: string) => show({ title, description, variant: 'warning' }),
    error: (title: string, description?: string) => show({ title, description, variant: 'danger' }),
    info: (title: string, description?: string) => show({ title, description, variant: 'info' }),
  }
}
