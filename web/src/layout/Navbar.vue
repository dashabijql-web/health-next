<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand } from '@element-plus/icons-vue'
import { useLayoutStore } from '@/stores/layout'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const layoutStore = useLayoutStore()
const userStore = useUserStore()

async function onLogout() {
  await userStore.logout()
  await router.push('/login')
}
</script>

<template>
  <header class="navbar">
    <div class="brand">
      <button class="toggle" type="button" @click="layoutStore.toggleSidebar">
        <el-icon>
          <Fold v-if="layoutStore.sidebarOpened" />
          <Expand v-else />
        </el-icon>
      </button>
      <span class="title">HealthNext</span>
      <span class="divider">/</span>
      <span class="page">{{ route.meta.title || '工作台' }}</span>
    </div>
    <div class="actions">
      <span class="user">{{ userStore.name || '管理员' }}</span>
      <el-button size="small" @click="onLogout">退出</el-button>
    </div>
  </header>
</template>

<style scoped>
.navbar,
.brand,
.actions {
  display: flex;
  align-items: center;
}

.navbar {
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-soft);
  background: rgba(7, 17, 29, 0.96);
}

.brand {
  gap: 8px;
  min-width: 0;
}

.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--accent);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.title {
  color: var(--accent);
  font-weight: 700;
}

.divider,
.page {
  color: var(--text-secondary);
}

.actions {
  gap: 12px;
}

.user {
  color: var(--text-strong);
  font-size: 14px;
}
</style>
