<script setup lang="ts">
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
</script>

<template>
  <section class="home">
    <h1>工作台</h1>
    <p>这是 HealthNext 的第一页。当前用户：{{ userStore.name || '未登录' }}</p>
    <ul>
      <li>前端：http://localhost:9531/</li>
      <li>后端：http://localhost:8081/api</li>
      <li>健康检查：http://localhost:8081/api/actuator/health</li>
    </ul>
    <p class="note">现有 HealthShow / HealthData 仍是对照实现，业务页从这一页开始按需重写，不要整页搬迁旧代码。</p>
  </section>
</template>

<style scoped>
.home {
  max-width: 720px;
  padding: 28px;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  background: var(--bg-surface);
}

h1 {
  margin: 0 0 12px;
  color: var(--text-strong);
}

p,
li {
  color: var(--text-secondary);
  line-height: 1.7;
}

.note {
  margin-top: 16px;
  color: var(--text-muted);
}
</style>
