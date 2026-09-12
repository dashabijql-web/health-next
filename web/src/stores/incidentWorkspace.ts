import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { IncidentDemoScene } from '@/mock/types'

export const useIncidentWorkspace = defineStore('incidentWorkspace', () => {
  const open = ref(false)
  const incidentId = ref<string | null>(null)
  const panel = ref<'event' | 'person'>('event')
  const scene = ref<IncidentDemoScene>('default')

  const hasIncident = computed(() => Boolean(incidentId.value))

  function openIncident(id: string, nextScene?: IncidentDemoScene) {
    if (nextScene) scene.value = nextScene
    incidentId.value = id
    panel.value = 'event'
    open.value = true
  }

  function showPerson() {
    panel.value = 'person'
  }

  function backToEvent() {
    panel.value = 'event'
  }

  function closeDrawer() {
    open.value = false
    panel.value = 'event'
  }

  function clearIncident() {
    incidentId.value = null
    open.value = false
    panel.value = 'event'
  }

  return {
    open,
    incidentId,
    panel,
    scene,
    hasIncident,
    openIncident,
    showPerson,
    backToEvent,
    closeDrawer,
    clearIncident,
  }
})
