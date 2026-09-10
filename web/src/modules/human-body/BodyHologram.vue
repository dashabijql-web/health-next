<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

interface Vitals {
  heartRate?: number | null
  bloodOxygen?: number | null
  temperature?: number | null
}

const props = withDefaults(defineProps<{
  personName?: string
  vitals?: Vitals
  freshnessStatus?: string
  lastCollected?: string
  reducedMotion?: boolean
  autoRotate?: boolean
}>(), {
  personName: '',
  vitals: () => ({}),
  freshnessStatus: 'no_data',
  lastCollected: '',
  reducedMotion: false,
  autoRotate: true,
})



const canvasHost = ref<HTMLElement | null>(null)
const modelLoading = ref(true)
const sceneError = ref('')

let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let renderer: THREE.WebGLRenderer | undefined
let modelPivot: THREE.Group | undefined
let particleField: THREE.Points | undefined
let scanLine: THREE.Mesh | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
let dragging = false
let lastPointerX = 0
let particleVelocity = new Float32Array(0)
const orbitRings: THREE.Mesh[] = []

const statusTone = computed(() => {
  if (props.freshnessStatus === 'fresh') return 'normal'
  if (props.freshnessStatus === 'stale') return 'warning'
  if (props.freshnessStatus === 'offline') return 'offline'
  return 'unknown'
})

const statusLabel = computed(() => ({
  fresh: '数据新鲜',
  stale: '数据陈旧',
  offline: '设备离线',
  no_data: '演示 / 未接后端',
}[props.freshnessStatus] || '演示 / 未接后端'))

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '' || Number(value) === 0) return '--'
  return value
}

function initScene() {
  if (!canvasHost.value) return
  try {
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 1.48, 6)
    camera.lookAt(0, 1.42, 0)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    modelLoading.value = false
    sceneError.value = '当前浏览器未提供可用的 WebGL。'
    return
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
  renderer.setClearColor(0x000000, 0)
  canvasHost.value.appendChild(renderer.domElement)

  const canvas = renderer.domElement
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)

  scene.add(new THREE.HemisphereLight(0x9bdcff, 0x061120, 1.6))
  const rim = new THREE.PointLight(0x35c7ff, 3.2, 8)
  rim.position.set(2.2, 3.1, 2.5)
  scene.add(rim)
  const fill = new THREE.PointLight(0x2655c8, 2, 7)
  fill.position.set(-2.5, 1.2, -2)
  scene.add(fill)

  addPlatform()
  addOrbitRings()
  addParticleField()
  addScanLine()
  loadModel()

  resizeObserver = new ResizeObserver(resizeScene)
  resizeObserver.observe(canvasHost.value)
  resizeScene()
  animate()
}

function addPlatform() {
  if (!scene) return
  const group = new THREE.Group()
  group.position.y = 0.03
  scene.add(group)
  group.add(new THREE.Mesh(
    new THREE.CylinderGeometry(1.62, 1.76, 0.12, 96),
    new THREE.MeshStandardMaterial({ color: 0x071728, metalness: 0.8, roughness: 0.32, emissive: 0x061a31, emissiveIntensity: 0.6 }),
  ))
  ;[1.05, 0.78, 0.52].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({ color: index === 1 ? 0x58d7f4 : 0x1674a8, transparent: true, opacity: index === 1 ? 0.82 : 0.58 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.085 + index * 0.018
    group.add(ring)
  })
}

function addOrbitRings() {
  if (!scene) return
  ;[
    { radius: 1.32, y: 1.52, tilt: 0.08, color: 0x1c94c9, opacity: 0.42 },
    { radius: 1.08, y: 2.12, tilt: -0.28, color: 0x4bd7ef, opacity: 0.28 },
    { radius: 0.88, y: 1.04, tilt: 0.24, color: 0x55d6b7, opacity: 0.24 },
  ].forEach((item) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(item.radius, 0.012, 8, 96),
      new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: item.opacity }),
    )
    ring.rotation.x = Math.PI / 2 + item.tilt
    ring.position.y = item.y
    scene!.add(ring)
    orbitRings.push(ring)
  })
}

function addParticleField() {
  if (!scene) return
  const count = 150
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  particleVelocity = new Float32Array(count)
  const palette = [new THREE.Color(0x39d7ff), new THREE.Color(0x63a5ff), new THREE.Color(0x6de3c1)]
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = 1.05 + Math.random() * 1.45
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = 0.18 + Math.random() * 3.35
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.52
    const color = palette[i % palette.length]
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    particleVelocity[i] = 0.035 + Math.random() * 0.07
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  particleField = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.042,
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  }))
  scene.add(particleField)
}

function addScanLine() {
  if (!scene) return
  scanLine = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.009, 0.012),
    new THREE.MeshBasicMaterial({ color: 0x42d9ff, transparent: true, opacity: 0.34 }),
  )
  scanLine.position.set(0, 0.62, 0.35)
  scene.add(scanLine)
}

function loadModel() {
  if (!scene) return
  new GLTFLoader().load('/models/wireframe_man.glb', (gltf: GLTF) => {
    const model = gltf.scene
    const box = new THREE.Box3().setFromObject(model)
    const height = Math.max(box.max.y - box.min.y, 0.1)
    model.scale.setScalar(2.48 / height)
    const after = new THREE.Box3().setFromObject(model)
    model.position.set(-((after.min.x + after.max.x) / 2), 0.18 - after.min.y, -((after.min.z + after.max.z) / 2))
    model.traverse((child: THREE.Object3D) => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0x35d9ff,
        emissive: 0x0c9fc5,
        emissiveIntensity: 1.42,
        metalness: 0.2,
        roughness: 0.42,
        transparent: true,
        opacity: 0.93,
      })
    })
    modelPivot = new THREE.Group()
    modelPivot.add(model)
    scene?.add(modelPivot)
    modelLoading.value = false
  }, undefined, () => {
    modelLoading.value = false
    sceneError.value = '人体模型资源加载失败，请检查静态资源服务。'
  })
}

function onPointerDown(event: PointerEvent) {
  if (!renderer) return
  dragging = true
  lastPointerX = event.clientX
  renderer.domElement.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging || !modelPivot) return
  modelPivot.rotation.y += (event.clientX - lastPointerX) * 0.008
  lastPointerX = event.clientX
}

function onPointerUp(event: PointerEvent) {
  dragging = false
  if (event.pointerId !== undefined && renderer?.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId)
  }
}

function animate() {
  animationFrame = requestAnimationFrame(animate)
  const time = performance.now() * 0.001
  const quiet = props.reducedMotion
  if (modelPivot && props.autoRotate && !quiet && !dragging) modelPivot.rotation.y += 0.0032
  if (particleField) {
    const positions = particleField.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < particleVelocity.length; i += 1) {
      const yIndex = i * 3 + 1
      positions[yIndex] += (quiet ? particleVelocity[i] * 0.12 : particleVelocity[i]) * 0.016
      if (positions[yIndex] > 3.7) positions[yIndex] = 0.18
    }
    particleField.geometry.attributes.position.needsUpdate = true
    particleField.rotation.y = quiet ? 0 : time * 0.018
  }
  if (scanLine) {
    scanLine.position.y = 0.5 + ((time * (quiet ? 0.03 : 0.11)) % 2.65)
    const material = scanLine.material as THREE.MeshBasicMaterial
    material.opacity = quiet ? 0.16 : 0.28 + Math.sin(time * 0.55) * 0.05
  }
  orbitRings.forEach((ring, index) => {
    ring.rotation.z += (quiet ? 0.0006 : 0.0022) * (index % 2 ? -1 : 1)
  })
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function resizeScene() {
  if (!renderer || !camera || !canvasHost.value) return
  const width = canvasHost.value.clientWidth
  const height = Math.max(canvasHost.value.clientHeight, 1)
  const aspect = width / height
  const fov = THREE.MathUtils.degToRad(camera.fov * 0.5)
  const verticalDistance = 3.42 / (2 * Math.tan(fov))
  const horizontalDistance = 3.82 / (2 * Math.tan(fov) * Math.max(aspect, 0.1))
  camera.aspect = aspect
  camera.position.z = Math.max(verticalDistance, horizontalDistance)
  camera.lookAt(0, 1.42, 0)
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, true)
}

function disposeObject(object?: THREE.Object3D) {
  object?.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose?.()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose?.())
    else material?.dispose?.()
  })
}

function resetView() {
  if (modelPivot) modelPivot.rotation.set(0, 0, 0)
}

defineExpose({ resetView })

onMounted(async () => {
  await nextTick()
  initScene()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
  renderer?.domElement.removeEventListener('pointermove', onPointerMove)
  renderer?.domElement.removeEventListener('pointerup', onPointerUp)
  renderer?.domElement.removeEventListener('pointercancel', onPointerUp)
  disposeObject(scene)
  renderer?.dispose()
})
</script>

<template>
  <section class="portrait-hologram" aria-label="三维人体健康信号展示">
    <div class="hologram-grid"></div>
    <div class="hologram-vignette"></div>
    <!-- 四角精密标尺微标记 -->
    <div class="hologram-corner hologram-corner--tl"></div>
    <div class="hologram-corner hologram-corner--tr"></div>
    <div class="hologram-corner hologram-corner--bl"></div>
    <div class="hologram-corner hologram-corner--br"></div>

    <header class="hologram-header">
      <div class="hologram-person">
        <span class="hologram-eyebrow">3D BODY SIGNAL VIEW</span>
        <div class="hologram-person-name">
          <span class="hologram-status-dot"></span>
          <strong>{{ personName || '未选择人员' }}</strong>
        </div>
      </div>
    </header>

    <div ref="canvasHost" class="hologram-canvas">
      <div v-if="sceneError" class="hologram-error" role="status">
        <strong>三维人体视图暂不可用</strong>
        <span>{{ sceneError }}</span>
      </div>
      <div v-else-if="modelLoading" class="hologram-loading" role="status">正在加载三维人体模型…</div>
    </div>

    <!-- 工业仪表感体征读数牌（待机石板灰无发光，等宽数字） -->
    <div class="hologram-label hologram-label--heart">
      <span class="hologram-dot hologram-dot--heart"></span>
      <div class="hologram-label__metric">
        <b>心率</b>
        <span class="hologram-label__val-group">
          <strong>{{ formatValue(vitals?.heartRate) }}</strong>
          <small>BPM</small>
        </span>
      </div>
    </div>
    <div class="hologram-label hologram-label--oxygen">
      <span class="hologram-dot hologram-dot--oxygen"></span>
      <div class="hologram-label__metric">
        <b>血氧</b>
        <span class="hologram-label__val-group">
          <strong>{{ formatValue(vitals?.bloodOxygen) }}</strong>
          <small>%</small>
        </span>
      </div>
    </div>
    <div class="hologram-label hologram-label--temp">
      <span class="hologram-dot hologram-dot--temp"></span>
      <div class="hologram-label__metric">
        <b>体温</b>
        <span class="hologram-label__val-group">
          <strong>{{ formatValue(vitals?.temperature) }}</strong>
          <small>°C</small>
        </span>
      </div>
    </div>

    <footer class="hologram-footer">
      <span class="hologram-footer__time">采集时间 {{ lastCollected || '暂无记录' }}</span>
      <span :class="['hologram-status', `is-${statusTone}`]">{{ statusLabel }}</span>
    </footer>
  </section>
</template>

<style scoped>
.portrait-hologram {
  position: relative;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-md);
  background: var(--bg-canvas);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.7), 0 8px 32px rgba(0, 0, 0, 0.4);
}

.hologram-grid {
  position: absolute;
  inset: 0;
  opacity: 0.28;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.9) 30%, transparent 85%);
}

.hologram-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.65);
}

/* 四角工程标尺装饰 */
.hologram-corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-color: rgba(255, 255, 255, 0.16);
  pointer-events: none;
  z-index: 2;
}

.hologram-corner--tl {
  top: 6px;
  left: 6px;
  border-top: 1px solid;
  border-left: 1px solid;
}

.hologram-corner--tr {
  top: 6px;
  right: 6px;
  border-top: 1px solid;
  border-right: 1px solid;
}

.hologram-corner--bl {
  bottom: 34px;
  left: 6px;
  border-bottom: 1px solid;
  border-left: 1px solid;
}

.hologram-corner--br {
  bottom: 34px;
  right: 6px;
  border-bottom: 1px solid;
  border-right: 1px solid;
}

.hologram-header {
  position: absolute;
  z-index: 3;
  top: 14px;
  left: 16px;
  right: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.hologram-person {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hologram-eyebrow {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

.hologram-person-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hologram-person-name strong {
  color: var(--text-strong);
  font-size: 14px;
  font-weight: 600;
}

.hologram-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-standby);
}

.hologram-canvas {
  position: absolute;
  inset: 0 0 32px 0;
}

.hologram-canvas canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.hologram-canvas canvas:active {
  cursor: grabbing;
}

.hologram-loading,
.hologram-error {
  position: absolute;
  inset: 50% auto auto 50%;
  z-index: 4;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 6px;
  width: min(80%, 260px);
  padding: 12px 16px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-md);
  background: rgba(13, 17, 23, 0.94);
  backdrop-filter: blur(8px);
  color: var(--text-secondary);
  text-align: center;
  font-size: 12px;
}

.hologram-error strong {
  color: var(--status-warning);
  font-size: 13px;
}

/* 工业仪表卡片（克制深色磨砂、等宽数字、无刺眼高发光） */
.hologram-label {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-sm);
  background: rgba(13, 17, 23, 0.88);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  transition: border-color 0.2s ease;
}

.hologram-label__metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hologram-label b {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.hologram-label__val-group {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.hologram-label strong {
  color: var(--text-strong);
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.hologram-label small {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

/* 待机状态圆点：深板岩灰，无发光 */
.hologram-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-standby);
  flex-shrink: 0;
}

/* 预留真实数据时的语义状态（不设全屏发光） */
.hologram-dot--heart.is-active { background: var(--status-danger); }
.hologram-dot--oxygen.is-active { background: var(--status-normal); }
.hologram-dot--temp.is-active { background: var(--status-warning); }

.hologram-label--heart { top: 38%; right: 14%; }
.hologram-label--oxygen { top: 44%; left: 12%; }
.hologram-label--temp { top: 58%; right: 14%; }

/* 底部状态条：嵌入式底栏，等宽时间，严谨指示 */
.hologram-footer {
  position: absolute;
  z-index: 3;
  left: 0;
  right: 0;
  bottom: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-top: 1px solid var(--border-dim);
  background: rgba(9, 12, 16, 0.85);
  backdrop-filter: blur(6px);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.hologram-footer__time {
  color: var(--text-muted);
}

.hologram-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
}

.hologram-status::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.hologram-status.is-normal { color: var(--status-normal); }
.hologram-status.is-warning { color: var(--status-warning); }
.hologram-status.is-offline,
.hologram-status.is-unknown { color: var(--status-standby); }

@media (max-width: 720px) {
  .hologram-header {
    top: 10px;
    left: 10px;
    right: 10px;
  }

  .hologram-label {
    padding: 4px 8px;
    transform: scale(0.92);
    transform-origin: center;
  }

  .hologram-label strong {
    font-size: 14px;
  }

  .hologram-label--heart { right: 4px; top: 36%; }
  .hologram-label--oxygen { left: 4px; top: 48%; }
  .hologram-label--temp { right: 4px; top: 60%; }

  .hologram-footer {
    padding: 0 10px;
    font-size: 10px;
  }
}
</style>
