<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Navbar from './Navbar.vue'
import Sidebar from './Sidebar.vue'
import { useLayoutStore } from '@/stores/layout'

const route = useRoute()
const layoutStore = useLayoutStore()
const fillContent = computed(() => Boolean(route.meta.fill))

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
      <main class="content" :class="{ 'content--fill': fillContent }">
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

.content--fill {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 16px 16px;
  overflow: hidden;
}

.content--fill > * {
  flex: 1;
  min-height: 0;
}
</style>
