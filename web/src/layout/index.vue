<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import Navbar from './Navbar.vue'
import Sidebar from './Sidebar.vue'
import { useLayoutStore } from '@/stores/layout'

const layoutStore = useLayoutStore()

function syncSidebar() {
  if (window.innerWidth < 900) {
    layoutStore.sidebarOpened = false
  }
}

onMounted(() => {
  syncSidebar()
  window.addEventListener('resize', syncSidebar)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncSidebar)
})
</script>

<template>
  <div class="shell" :class="{ 'is-collapsed': !layoutStore.sidebarOpened }">
    <Sidebar />
    <div class="main">
      <Navbar />
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg-root);
}

.main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.content {
  flex: 1;
  padding: 24px;
  overflow: auto;
}
</style>
