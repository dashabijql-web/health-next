<script setup lang="ts">
import { ref } from 'vue'
import BodyHologram from './BodyHologram.vue'

defineOptions({ name: 'Body360Page' })

const hologram = ref<{ resetView: () => void } | null>(null)
const reducedMotion = ref(false)
const autoRotate = ref(true)

function resetView() {
  hologram.value?.resetView()
}
</script>

<template>
  <section class="body-page">
    <header class="body-page__bar">
      <div>
        <span class="body-page__kicker">演示页 · 未接后端</span>
        <h1>360° 人体</h1>
        <p>未选择人员。体征显示为 --，不是示例读数。</p>
      </div>
      <span class="body-page__badge">演示</span>
    </header>

    <div class="body-page__stage">
      <BodyHologram
        ref="hologram"
        person-name="未选择人员"
        freshness-status="no_data"
        last-collected=""
        :reduced-motion="reducedMotion"
        :auto-rotate="autoRotate"
      />
    </div>

    <footer class="body-page__controls">
      <label>
        <input v-model="autoRotate" type="checkbox" />
        自动旋转
      </label>
      <button type="button" @click="resetView">重置视角</button>
      <label>
        <input v-model="reducedMotion" type="checkbox" />
        减少动态
      </label>
    </footer>
  </section>
</template>

<style scoped>
.body-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  gap: 10px;
}

.body-page__bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 0;
}

.body-page__kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--signal-cyan);
  opacity: 0.85;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.body-page__kicker::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--signal-cyan);
  opacity: 0.8;
}

.body-page__bar h1 {
  margin: 3px 0 2px;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.body-page__bar p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.body-page__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.05em;
}

.body-page__stage {
  min-height: 0;
}

.body-page__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 14px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 12px;
}

.body-page__controls label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.body-page__controls input[type='checkbox'] {
  accent-color: var(--signal-cyan);
  cursor: pointer;
}

.body-page__controls button {
  padding: 4px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.body-page__controls button:hover {
  background: rgba(56, 189, 248, 0.12);
  border-color: var(--border-interactive);
  color: #fff;
}

.body-page__controls button:active {
  transform: translateY(1px);
}

@media (max-width: 720px) {
  .body-page__bar {
    align-items: flex-start;
  }

  .body-page__controls {
    justify-content: center;
    gap: 16px;
    padding: 6px 10px;
  }
}
</style>
