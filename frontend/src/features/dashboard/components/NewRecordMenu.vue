<script setup lang="ts">
/**
 * 新建记录入口。
 * 只展示**已支持的演示业务**（回款登记），未开发的业务不放假按钮（UI 红线）。
 * 路径经冻结契约 buildProcessingFeeCreatePath() 构造。
 */
import { useRouter } from 'vue-router'

import Button from '@/components/ui/button/Button.vue'
import DropdownMenu from '@/components/ui/dropdown-menu/DropdownMenu.vue'
import { Plus } from '@lucide/vue'
import { buildNewRecordPath } from '../navigation'

const router = useRouter()

const items = [
  {
    label: '加工费回款登记',
    onSelect: () => {
      void router.push(buildNewRecordPath())
    },
  },
]
</script>

<template>
  <DropdownMenu :items="items">
    <template #trigger>
      <Button variant="primary" data-testid="new-record-trigger">
        <Plus class="size-4" aria-hidden="true" />
        新建记录
      </Button>
    </template>
  </DropdownMenu>
</template>
