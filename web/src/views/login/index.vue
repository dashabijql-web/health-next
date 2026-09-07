<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

defineOptions({ name: 'LoginPage' })

interface LoginForm {
  username: string
  password: string
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive<LoginForm>({
  username: 'admin',
  password: 'admin123',
})
const rules: FormRules<LoginForm> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await userStore.login(form.username, form.password)
    await userStore.getInfo()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/home'
    await router.push(redirect === '/login' ? '/home' : redirect)
  } catch {
    // request() already shows the error message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="panel">
      <h1>职业健康监测</h1>
      <p>HealthNext 脚手架</p>
      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="密码"
            :prefix-icon="Lock"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button class="submit" type="primary" :loading="loading" native-type="submit">
          登录
        </el-button>
      </el-form>
      <div class="hint">本地账号 admin / admin123</div>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background:
    radial-gradient(circle at 20% 20%, rgba(62, 183, 255, 0.16), transparent 42%),
    radial-gradient(circle at 80% 80%, rgba(54, 211, 153, 0.12), transparent 46%),
    var(--bg-root);
}

.panel {
  width: 420px;
  max-width: calc(100vw - 32px);
  padding: 40px 36px 28px;
  border: 1px solid var(--border-soft);
  border-radius: 20px;
  background: var(--bg-surface);
  box-shadow: 0 24px 60px rgba(2, 8, 20, 0.42);
}

h1 {
  margin: 0;
  color: var(--text-strong);
  font-size: 22px;
}

p {
  margin: 8px 0 28px;
  color: var(--text-muted);
}

.submit {
  width: 100%;
  height: 40px;
}

.hint {
  margin-top: 16px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
</style>
