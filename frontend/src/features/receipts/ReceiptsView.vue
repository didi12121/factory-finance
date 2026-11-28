<script setup lang="ts">
/**
 * 加工费回款（收款单列表 + 登记回款 + 多对多核销）页面 —— 正式业务页面。
 *
 * 跨页路由契约（contracts/navigation.ts，冻结）：
 *   /business/processing-fee?action=create[&customerId=...][&receivableId=...]
 * 参数经 parseProcessingFeeRouteQuery 验证后预填（无效参数安全处理，不误核销）。
 *
 * 数据来源：useBusinessStore（真实后端 + MySQL）；金额红线见 utils/decimal.ts。
 */
import { onMounted, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'

import { AlertTriangle } from '@lucide/vue'

import Button from '@/components/ui/button/Button.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import type { EntityId } from '@/features/prototype/contracts'
import { useBusinessStore } from '@/features/business/businessStore'
import ReceiptListSection from './ReceiptListSection.vue'
import ReceiptRegistrationForm from './ReceiptRegistrationForm.vue'
import { parseProcessingFeeRouteQuery } from './receiptModel'

const route = useRoute()
const store = useBusinessStore()

const registrationOpen = ref(false)
const routeNotices: Ref<string[]> = ref([])
const prefill: Ref<{ customerId: EntityId | null; receivableId: EntityId | null } | null> = ref(null)
const ready = ref(false)

/** 识别并应用跨页路由参数（action=create 展开登记表单并预填；无效参数提示并忽略） */
function applyRouteParams(): void {
  const parsed = parseProcessingFeeRouteQuery(route.query, {
    customers: store.customers,
    receivables: store.receivableViews,
  })
  routeNotices.value = parsed.notices
  if (parsed.openRegistration) {
    registrationOpen.value = true
    prefill.value = {
      customerId: parsed.prefillCustomerId,
      receivableId: parsed.prefillReceivableId,
    }
  }
}

onMounted(async () => {
  try {
    await store.load()
  } finally {
    ready.value = true
  }
})

watch(
  () => route.query,
  () => {
    if (ready.value) {
      applyRouteParams()
    }
  },
  { immediate: true, deep: true },
)

watch(ready, (value) => {
  if (value) {
    applyRouteParams()
  }
})

function openRegistration(): void {
  registrationOpen.value = true
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="加工费回款" description="登记实际到账款项，并与未结清应收单多对多核销；一笔收款只记一次资金流入。">
      <template #actions>
        <Button data-testid="open-registration" @click="openRegistration">登记回款</Button>
      </template>
    </PageHeader>

    <!-- 路由参数提示（无效参数安全处理） -->
    <ul
      v-if="routeNotices.length > 0"
      class="flex flex-col gap-1 rounded-control border border-warning bg-warning-subtle px-3 py-2"
      role="alert"
      data-testid="route-notice"
    >
      <li v-for="(notice, index) in routeNotices" :key="index" class="flex items-start gap-2 text-caption text-warning-foreground">
        <AlertTriangle class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ notice }}</span>
      </li>
    </ul>

    <ReceiptRegistrationForm
      v-if="ready"
      :open="registrationOpen"
      :prefill="prefill"
      @update:open="registrationOpen = $event"
      @confirmed="store.refreshReceivables()"
    />
    <div v-else class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="4" label="回款数据加载中" />
    </div>

    <ReceiptListSection v-if="ready" />
  </div>
</template>
