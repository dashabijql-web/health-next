<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface MapText {
  t: string
  x: number
  y: number
  s: number
  a?: number
}

interface MineMapData {
  origin: [number, number]
  extent: [number, number, number, number]
  lineCount: number
  pointCount: number
  textCount: number
  lines: number[][][]
  texts: MapText[]
}

interface SelectedLabel {
  t: string
  x: number
  y: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const mapData = ref<MineMapData | null>(null)
const loading = ref(true)
const error = ref('')
const searchText = ref('')
const showLines = ref(true)
const showTexts = ref(true)
const selectedLabel = ref<SelectedLabel | null>(null)
const hitPosition = ref({ x: 0, y: 0 })
const coordinateText = ref('X —  Y —')
const scaleText = ref('比例尺')

const state = {
  scale: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  startX: 0,
  startY: 0,
}

let ctx: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | undefined
let searchTimer = 0

const hitStyle = computed(() => ({
  left: `${hitPosition.value.x + 12}px`,
  top: `${hitPosition.value.y + 12}px`,
}))

function formatNumber(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '—'
}

function dpr() {
  return Math.min(window.devicePixelRatio || 1, 2)
}

function extent() {
  const data = mapData.value
  if (!data) return { w: 1, h: 1 }
  return { w: data.extent[2], h: data.extent[3] }
}

function worldToScreen(x: number, y: number) {
  return { x: x * state.scale + state.panX, y: (extent().h - y) * state.scale + state.panY }
}

function screenToWorld(x: number, y: number) {
  return { x: (x - state.panX) / state.scale, y: extent().h - (y - state.panY) / state.scale }
}

function labelRank(text: string) {
  if (/(工作面|井底车场|炸药库|西风井|东风井|主井|付井|新付井)$/.test(text)) return 0
  if (/巷|上山|下山|车场|硐室|石门|风道/.test(text)) return 1
  if (text.length <= 1 || /^[+\-]?\d+(\.\d+)?$/.test(text)) return 3
  return 2
}

function isMajor(text: string) {
  return labelRank(text) === 0
}

function isMedium(text: string) {
  return labelRank(text) === 1
}

function isNoise(text: string) {
  return labelRank(text) === 3
}

function fitTo(x0: number, y0: number, x1: number, y1: number, pad = 48) {
  if (!mapData.value || !canvasRef.value) return
  const width = Math.max(20, x1 - x0)
  const height = Math.max(20, y1 - y0)
  const top = 72
  const viewportWidth = canvasRef.value.clientWidth - pad * 2
  const viewportHeight = canvasRef.value.clientHeight - pad * 2 - top
  state.scale = Math.min(viewportWidth / width, viewportHeight / height)
  const worldHeight = extent().h
  const sx = x0 * state.scale
  const sy = (worldHeight - y1) * state.scale
  state.panX = (canvasRef.value.clientWidth - width * state.scale) / 2 - sx
  state.panY = top + (canvasRef.value.clientHeight - top - height * state.scale) / 2 - sy
  draw()
}

function fitMap() {
  if (!mapData.value) return
  fitTo(0, 0, extent().w, extent().h)
}

function fitSearch() {
  const query = searchText.value.trim()
  if (!query) return fitMap()
  const hits = mapData.value?.texts.filter((item) => item.t.includes(query)) || []
  if (!hits.length) return draw()
  const bounds = hits.reduce((acc, item) => ({
    x0: Math.min(acc.x0, item.x),
    y0: Math.min(acc.y0, item.y),
    x1: Math.max(acc.x1, item.x),
    y1: Math.max(acc.y1, item.y),
  }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
  fitTo(bounds.x0 - 400, bounds.y0 - 300, bounds.x1 + 400, bounds.y1 + 300)
}

function zoomAt(sx: number, sy: number, factor: number) {
  if (!mapData.value) return
  const before = screenToWorld(sx, sy)
  state.scale = Math.min(48, Math.max(0.02, state.scale * factor))
  const after = worldToScreen(before.x, before.y)
  state.panX += sx - after.x
  state.panY += sy - after.y
  draw()
}

function zoomAtCenter(factor: number) {
  if (!canvasRef.value) return
  zoomAt(canvasRef.value.clientWidth / 2, canvasRef.value.clientHeight / 2, factor)
}

function niceScale() {
  const steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  const value = steps.find((item) => item * state.scale >= 60) || steps[steps.length - 1]
  scaleText.value = value >= 1000 ? `${value / 1000} km` : `${value} m`
}

function draw() {
  if (!ctx || !mapData.value || !canvasRef.value) return
  const width = canvasRef.value.clientWidth
  const height = canvasRef.value.clientHeight
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0)
  ctx.clearRect(0, 0, width, height)
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 40, width * 0.5, height * 0.5, Math.max(width, height) * 0.7)
  gradient.addColorStop(0, '#122433')
  gradient.addColorStop(1, '#081018')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  if (showLines.value) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(143,212,232,.82)'
    ctx.lineWidth = Math.max(0.6, Math.min(1.8, state.scale * 0.9))
    ctx.beginPath()
    mapData.value.lines.forEach((line) => {
      const start = worldToScreen(line[0][0], line[0][1])
      ctx!.moveTo(start.x, start.y)
      for (let i = 1; i < line.length; i += 1) {
        const point = worldToScreen(line[i][0], line[i][1])
        ctx!.lineTo(point.x, point.y)
      }
    })
    ctx.stroke()
  }

  if (showTexts.value) {
    const query = searchText.value.trim()
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    mapData.value.texts.slice().sort((a, b) => labelRank(a.t) - labelRank(b.t)).forEach((item) => {
      if (!query) {
        if (isNoise(item.t) && state.scale < 0.22) return
        if (!isMajor(item.t) && !isMedium(item.t) && state.scale < 0.14) return
        if (!isMajor(item.t) && state.scale < 0.09) return
      } else if (!item.t.includes(query)) return

      const point = worldToScreen(item.x, item.y)
      if (point.x < -80 || point.y < -40 || point.x > width + 80 || point.y > height + 40) return
      const fontSize = Math.max(state.scale < 0.18 ? 10 : 9, Math.min(16, item.s * state.scale * 0.9))
      const box = { x: point.x - 4, y: point.y - fontSize - 4, w: item.t.length * fontSize * 0.92 + 8, h: fontSize + 8 }
      if (!query && boxes.some((other) => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y)) return
      boxes.push(box)
      ctx!.save()
      ctx!.translate(point.x, point.y)
      ctx!.rotate(-((item.a || 0) * Math.PI) / 180)
      ctx!.font = `${isMajor(item.t) ? 600 : 400} ${fontSize}px "PingFang SC","Noto Sans SC",sans-serif`
      ctx!.lineWidth = 3
      ctx!.strokeStyle = 'rgba(8,16,24,.85)'
      ctx!.fillStyle = query && item.t.includes(query) ? '#f0c36a' : (isMajor(item.t) ? '#3ee0c4' : '#d7ecf4')
      ctx!.strokeText(item.t, 0, 0)
      ctx!.fillText(item.t, 0, 0)
      ctx!.restore()
    })
  }

  niceScale()
}

function pickLabel(x: number, y: number): MapText | null {
  if (!showTexts.value || !mapData.value) return null
  let best: MapText | null = null
  let distance = 18
  for (const item of mapData.value.texts) {
    const point = worldToScreen(item.x, item.y)
    const current = Math.hypot(point.x - x, point.y - y)
    if (current < distance) {
      best = item
      distance = current
    }
  }
  return best
}

function resize() {
  if (!canvasRef.value || !ctx) return
  const ratio = dpr()
  canvasRef.value.width = Math.floor(canvasRef.value.clientWidth * ratio)
  canvasRef.value.height = Math.floor(canvasRef.value.clientHeight * ratio)
  draw()
}

function onPointerDown(event: PointerEvent) {
  if (!canvasRef.value) return
  state.dragging = true
  state.lastX = event.clientX
  state.lastY = event.clientY
  state.startX = event.clientX
  state.startY = event.clientY
  canvasRef.value.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!mapData.value || !canvasRef.value) return
  const point = screenToWorld(event.offsetX, event.offsetY)
  const [originX, originY] = mapData.value.origin
  coordinateText.value = `X ${(originX + point.x).toFixed(2)}   Y ${(originY + point.y).toFixed(2)}`
  if (!state.dragging) return
  state.panX += event.clientX - state.lastX
  state.panY += event.clientY - state.lastY
  state.lastX = event.clientX
  state.lastY = event.clientY
  selectedLabel.value = null
  draw()
}

function onPointerUp(event: PointerEvent) {
  const moved = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
  state.dragging = false
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) canvasRef.value.releasePointerCapture(event.pointerId)
  if (moved >= 4 || !mapData.value) return
  const item = pickLabel(event.offsetX, event.offsetY)
  if (!item) return
  const [originX, originY] = mapData.value.origin
  selectedLabel.value = { t: item.t, x: originX + item.x, y: originY + item.y }
  hitPosition.value = { x: event.offsetX, y: event.offsetY }
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  zoomAt(event.offsetX, event.offsetY, event.deltaY > 0 ? 0.9 : 1.11)
}

onMounted(async () => {
  await nextTick()
  const canvas = canvasRef.value
  if (!canvas) return
  ctx = canvas.getContext('2d')
  if (!ctx) {
    loading.value = false
    error.value = '当前浏览器不支持 Canvas。'
    return
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  try {
    const response = await fetch('/maps/mine-map.json')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    mapData.value = await response.json() as MineMapData
    loading.value = false
    resize()
    fitMap()
  } catch {
    loading.value = false
    error.value = '矿井 GIS 数据加载失败，请检查静态资源。'
  }
})

watch([showLines, showTexts], draw)
watch(searchText, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(fitSearch, 180)
})

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer)
  resizeObserver?.disconnect()
  const canvas = canvasRef.value
  canvas?.removeEventListener('pointerdown', onPointerDown)
  canvas?.removeEventListener('pointermove', onPointerMove)
  canvas?.removeEventListener('pointerup', onPointerUp)
  canvas?.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <section class="mine-gis" aria-label="矿井巷道 GIS 地图">
    <canvas ref="canvasRef" class="mine-gis__canvas"></canvas>

    <!-- 顶部 HUD：左侧测绘台账摘要，右侧精密操作面板 -->
    <div class="mine-gis__hud mine-gis__hud--top">
      <div class="mine-gis__card mine-gis__summary">
        <div class="mine-gis__summary-head">
          <span class="mine-gis__status-indicator"></span>
          <strong>矿井巷道 GIS</strong>
        </div>
        <span class="mine-gis__coord-sys">CAD 平面坐标，不是经纬度</span>
        <div class="mine-gis__stats">
          <span>巷道 <b>{{ formatNumber(mapData?.lineCount) }}</b></span>
          <span class="mine-gis__stat-divider">|</span>
          <span>顶点 <b>{{ formatNumber(mapData?.pointCount) }}</b></span>
          <span class="mine-gis__stat-divider">|</span>
          <span>注记 <b>{{ formatNumber(mapData?.textCount) }}</b></span>
        </div>
      </div>

      <div class="mine-gis__card mine-gis__controls">
        <div class="mine-gis__search-wrap">
          <svg class="mine-gis__search-icon" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04z" clip-rule="evenodd" />
          </svg>
          <input v-model="searchText" type="search" placeholder="搜索巷道 / 水平 / 井筒" aria-label="搜索巷道、水平或井筒" />
        </div>
        <div class="mine-gis__toolbar-actions">
          <div class="mine-gis__layer-toggles">
            <label><input v-model="showLines" type="checkbox" /> 巷道</label>
            <label><input v-model="showTexts" type="checkbox" /> 注记</label>
          </div>
          <div class="mine-gis__btn-group">
            <button type="button" title="适应窗口" @click="fitMap">适应</button>
            <button type="button" title="放大" @click="zoomAtCenter(1.25)">＋</button>
            <button type="button" title="缩小" @click="zoomAtCenter(0.8)">−</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 点击注记测绘坐标气泡 -->
    <div v-if="selectedLabel" class="mine-gis__hit" :style="hitStyle">
      <div class="mine-gis__hit-title">{{ selectedLabel.t }}</div>
      <div class="mine-gis__hit-coord">
        <span>CAD X</span> <b>{{ selectedLabel.x.toFixed(2) }}</b>
      </div>
      <div class="mine-gis__hit-coord">
        <span>CAD Y</span> <b>{{ selectedLabel.y.toFixed(2) }}</b>
      </div>
    </div>

    <!-- 底部 HUD：操作规范与坐标标尺 -->
    <div class="mine-gis__hud mine-gis__hud--bottom">
      <div class="mine-gis__card mine-gis__hint">
        <span>滚轮缩放 · 拖动平移 · 点击注记查看 CAD 坐标</span>
        <span class="mine-gis__hint-sub">演示 / 位置数据未接入 · Y 轴北向上</span>
      </div>
      <div class="mine-gis__card mine-gis__coord">
        <div class="mine-gis__coord-readout">
          <span class="mine-gis__crosshair-icon">⌖</span>
          <span>{{ coordinateText }}</span>
        </div>
        <div class="mine-gis__scale-readout">
          <span class="mine-gis__scale-bar"></span>
          <small>{{ scaleText }}</small>
        </div>
      </div>
    </div>

    <div v-if="loading || error" class="mine-gis__state" role="status">
      <strong v-if="loading">正在载入矿井 GIS 矢量底图…</strong>
      <strong v-else>GIS 图暂不可用</strong>
      <span v-if="error">{{ error }}</span>
    </div>
  </section>
</template>

<style scoped>
.mine-gis {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #06090e;
  color: var(--text-primary);
  font-size: 11px;
}

.mine-gis__canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.mine-gis__canvas:active {
  cursor: grabbing;
}

.mine-gis__hud {
  position: absolute;
  z-index: 3;
  display: flex;
  gap: 8px;
  pointer-events: none;
}

.mine-gis__hud--top {
  top: 10px;
  left: 10px;
  right: 10px;
  justify-content: space-between;
  align-items: flex-start;
}

.mine-gis__hud--bottom {
  right: 10px;
  bottom: 10px;
  left: 10px;
  justify-content: space-between;
  align-items: flex-end;
}

.mine-gis__card {
  pointer-events: auto;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* 左上角摘要卡片 */
.mine-gis__summary {
  display: grid;
  gap: 3px;
  padding: 8px 12px;
  min-width: 210px;
}

.mine-gis__summary-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mine-gis__status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--signal-cyan);
  opacity: 0.85;
}

.mine-gis__summary strong {
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.mine-gis__coord-sys {
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.02em;
}

.mine-gis__stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 10px;
}

.mine-gis__stat-divider {
  color: var(--border-dim);
}

.mine-gis__stats b {
  color: var(--text-strong);
  font-family: var(--font-mono);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 右上角控制工具条 */
.mine-gis__controls {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
}

.mine-gis__search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.mine-gis__search-icon {
  position: absolute;
  left: 8px;
  width: 12px;
  height: 12px;
  color: var(--text-muted);
  pointer-events: none;
}

.mine-gis__controls input[type='search'] {
  width: 160px;
  height: 28px;
  min-width: 0;
  padding: 4px 8px 4px 26px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  outline: none;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-strong);
  font-size: 11px;
  transition: all 0.15s ease;
}

.mine-gis__controls input[type='search']::placeholder {
  color: var(--text-muted);
}

.mine-gis__controls input[type='search']:focus {
  border-color: var(--border-interactive);
  background: rgba(255, 255, 255, 0.07);
}

.mine-gis__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mine-gis__layer-toggles {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mine-gis__layer-toggles label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}

.mine-gis__layer-toggles input[type='checkbox'] {
  accent-color: var(--signal-cyan);
  cursor: pointer;
}

.mine-gis__btn-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mine-gis__btn-group button {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.mine-gis__btn-group button:hover {
  background: rgba(56, 189, 248, 0.12);
  border-color: var(--border-interactive);
  color: #fff;
}

.mine-gis__btn-group button:active {
  transform: translateY(1px);
}

/* 底部操作提示 */
.mine-gis__hint {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  color: var(--text-secondary);
  font-size: 10px;
}

.mine-gis__hint-sub {
  color: var(--text-muted);
}

/* 底部右侧坐标与比例尺 */
.mine-gis__coord {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 12px;
  min-width: 140px;
}

.mine-gis__coord-readout {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}

.mine-gis__crosshair-icon {
  color: var(--signal-cyan);
  font-size: 12px;
}

.mine-gis__scale-readout {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.mine-gis__scale-bar {
  display: inline-block;
  width: 24px;
  height: 2px;
  background: var(--signal-cyan);
  opacity: 0.6;
}

.mine-gis__coord small {
  color: var(--signal-cyan);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
}

/* 注记交互弹出层 */
.mine-gis__hit {
  position: absolute;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--signal-cyan);
  border-radius: var(--radius-sm);
  background: rgba(13, 17, 23, 0.94);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  color: var(--text-primary);
  pointer-events: none;
}

.mine-gis__hit-title {
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-dim);
  padding-bottom: 3px;
}

.mine-gis__hit-coord {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
}

.mine-gis__hit-coord span {
  color: var(--text-muted);
}

.mine-gis__hit-coord b {
  color: var(--signal-cyan);
  font-variant-numeric: tabular-nums;
}

/* 加载 / 错误状态 */
.mine-gis__state {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-content: center;
  gap: 6px;
  text-align: center;
  background: rgba(6, 9, 14, 0.85);
  backdrop-filter: blur(8px);
  color: var(--text-secondary);
}

.mine-gis__state strong {
  color: var(--text-strong);
  font-size: 13px;
}

.mine-gis__state span {
  color: var(--status-warning);
  font-size: 11px;
}

/* 窄屏自适应（彻底解决横向截断溢出） */
@media (max-width: 768px) {
  .mine-gis__hud--top {
    flex-direction: column;
    left: 6px;
    right: 6px;
    top: 6px;
    gap: 4px;
  }

  .mine-gis__summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    gap: 8px;
    padding: 4px 8px;
  }

  .mine-gis__summary-head,
  .mine-gis__coord-sys {
    display: none;
  }

  .mine-gis__stats {
    margin: 0;
  }

  .mine-gis__controls {
    width: 100%;
    box-sizing: border-box;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
  }

  .mine-gis__search-wrap {
    flex: 1 1 140px;
    min-width: 0;
  }

  .mine-gis__controls input[type='search'] {
    width: 100%;
    height: 26px;
  }

  .mine-gis__toolbar-actions {
    flex: 1 1 auto;
    justify-content: space-between;
    min-width: 0;
  }

  .mine-gis__hint {
    display: none;
  }

  .mine-gis__hud--bottom {
    left: 6px;
    right: 6px;
    bottom: 6px;
    justify-content: flex-end;
  }

  .mine-gis__coord {
    padding: 4px 8px;
    min-width: 0;
  }
}
</style>
