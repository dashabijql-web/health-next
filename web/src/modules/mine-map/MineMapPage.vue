<script setup lang="ts">
import MineGisMap from './MineGisMap.vue'

defineOptions({ name: 'MineMapPage' })
</script>

<template>
  <section class="map-page">
    <header class="map-page__bar">
      <div>
        <span class="map-page__kicker">演示页 · 位置数据未接入</span>
        <h1>井下态势</h1>
        <p>真实巷道 CAD 底图。没有人员点、热区和 SOS 标记。</p>
      </div>
      <span class="map-page__badge">演示</span>
    </header>
    <div class="map-page__stage">
      <MineGisMap />
    </div>
  </section>
</template>

<style scoped>
.map-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  gap: 10px;
}

.map-page__bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 0;
}

.map-page__kicker {
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

.map-page__kicker::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--signal-cyan);
  opacity: 0.8;
}

.map-page__bar h1 {
  margin: 3px 0 2px;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.map-page__bar p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.map-page__badge {
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

.map-page__stage {
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-dim);
}

@media (max-width: 768px) {
  .map-page {
    gap: 6px;
  }

  .map-page__bar {
    padding: 0;
    align-items: center;
  }

  .map-page__kicker,
  .map-page__bar p {
    display: none;
  }

  .map-page__bar h1 {
    margin: 0;
    font-size: 16px;
  }
}
</style>
