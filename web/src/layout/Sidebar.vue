<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Odometer } from '@element-plus/icons-vue'
import { useLayoutStore } from '@/stores/layout'

const route = useRoute()
const layoutStore = useLayoutStore()
const active = computed(() => route.path)
</script>

<template>
  <aside class="sidebar" :class="{ 'is-collapsed': !layoutStore.sidebarOpened }">
    <div class="logo">{{ layoutStore.sidebarOpened ? '职业健康监测' : 'HN' }}</div>
    <el-menu
      :default-active="active"
      :collapse="!layoutStore.sidebarOpened"
      :collapse-transition="false"
      router
      background-color="#07111d"
      text-color="#8fa7c3"
      active-text-color="#eef7ff"
    >
      <el-menu-item index="/home">
        <el-icon><Odometer /></el-icon>
        <span>工作台</span>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #07111d;
  border-right: 1px solid var(--border-soft);
  transition: width 160ms ease;
}

.sidebar.is-collapsed {
  width: 64px;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  color: var(--accent);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border-soft);
}

.sidebar :deep(.el-menu) {
  border-right: 0;
}
</style>
