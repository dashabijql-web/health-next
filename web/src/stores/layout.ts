import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useLayoutStore = defineStore('layout', () => {
  const sidebarOpened = ref(true)

  function toggleSidebar() {
    sidebarOpened.value = !sidebarOpened.value
  }

  return { sidebarOpened, toggleSidebar }
})
