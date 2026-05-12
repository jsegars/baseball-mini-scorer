<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import PartySocket from 'partysocket'

// ── Config ──────────────────────────────────────────────────────────────────
const config = ref(null)

async function loadConfig() {
  const res = await fetch('/config.json')
  config.value = await res.json()
  if (!loadState()) {
    resetToConfig()
  }
}

// ── Game state ───────────────────────────────────────────────────────────────
const offenseScore = ref(0)
const defenseScore = ref(0)
const outs = ref(0)
const secondsLeft = ref(0)
const inningDuration = ref(0)
const timerRunning = ref(false)
const lastAction = ref(null) // { offense, defense, outs } for single undo
const outsFlashing = ref(false)

function resetToConfig() {
  if (!config.value) return
  offenseScore.value = 0
  defenseScore.value = 0
  outs.value = 0
  inningDuration.value = config.value.inningMinutes * 60
  secondsLeft.value = inningDuration.value
  timerRunning.value = false
  lastAction.value = null
}

// ── localStorage persistence ─────────────────────────────────────────────────
const STORAGE_KEY = 'mini-game-scorer-state'

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    offenseScore: offenseScore.value,
    defenseScore: defenseScore.value,
    outs: outs.value,
    secondsLeft: secondsLeft.value,
    inningDuration: inningDuration.value,
  }))
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  try {
    const s = JSON.parse(raw)
    offenseScore.value = s.offenseScore ?? 0
    defenseScore.value = s.defenseScore ?? 0
    outs.value = s.outs ?? 0
    secondsLeft.value = s.secondsLeft ?? 0
    inningDuration.value = s.inningDuration ?? (config.value?.inningMinutes * 60 ?? 1200)
    timerRunning.value = false
    return true
  } catch {
    return false
  }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY)
}

watch([offenseScore, defenseScore, outs, secondsLeft, inningDuration], saveState)

// ── Timer ────────────────────────────────────────────────────────────────────
let timerInterval = null

function startTimer() {
  if (timerRunning.value || secondsLeft.value <= 0) return
  timerRunning.value = true
  timerInterval = setInterval(() => {
    if (secondsLeft.value > 0) {
      secondsLeft.value--
    } else {
      pauseTimer()
    }
  }, 1000)
}

function pauseTimer() {
  timerRunning.value = false
  clearInterval(timerInterval)
  timerInterval = null
}

function toggleTimer() {
  timerRunning.value ? pauseTimer() : startTimer()
}

function resetTimer() {
  pauseTimer()
  secondsLeft.value = inningDuration.value
}

const formattedTime = computed(() => {
  const m = Math.floor(secondsLeft.value / 60)
  const s = secondsLeft.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const timerWarning = computed(() => secondsLeft.value > 0 && secondsLeft.value <= 120)
const timerExpired = computed(() => secondsLeft.value === 0)

// ── Timer duration override ──────────────────────────────────────────────────
const showTimerEdit = ref(false)
const timerEditMinutes = ref(20)

function openTimerEdit() {
  pauseTimer()
  timerEditMinutes.value = Math.round(inningDuration.value / 60)
  showTimerEdit.value = true
}

function applyTimerEdit() {
  const mins = Math.max(1, Math.min(99, parseInt(timerEditMinutes.value) || 1))
  inningDuration.value = mins * 60
  secondsLeft.value = mins * 60
  showTimerEdit.value = false
}

// ── Score format ─────────────────────────────────────────────────────────────
function fmt(n) {
  if (n === null || n === undefined) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ── Score override ───────────────────────────────────────────────────────────
const showScoreEdit = ref(false)
const scoreEditOffense = ref(0)
const scoreEditDefense = ref(0)

function openScoreEdit() {
  scoreEditOffense.value = offenseScore.value
  scoreEditDefense.value = defenseScore.value
  showScoreEdit.value = true
}

function applyScoreEdit() {
  const o = parseFloat(scoreEditOffense.value)
  const d = parseFloat(scoreEditDefense.value)
  if (!isNaN(o)) offenseScore.value = o
  if (!isNaN(d)) defenseScore.value = d
  showScoreEdit.value = false
  broadcast()
}

// ── Outs (tap to toggle) ─────────────────────────────────────────────────────
function checkOutsReset() {
  if (outs.value >= 3) {
    outsFlashing.value = true
    setTimeout(() => {
      outs.value = 0
      outsFlashing.value = false
      broadcast()
    }, 900)
  }
}

function tapOut(index) {
  if (outsFlashing.value) return
  outs.value = index < outs.value ? index : index + 1
  broadcast()
  checkOutsReset()
}

// ── Action buttons ───────────────────────────────────────────────────────────
const sections = computed(() => {
  if (!config.value) return []
  const order = ['offense', 'both', 'defense']
  const labels = { offense: 'Offense', both: 'Both Teams', defense: 'Defense' }
  return order
    .map(key => ({
      key,
      label: labels[key],
      actions: config.value.actions.filter(a => a.section === key),
    }))
    .filter(s => s.actions.length > 0)
})

function applyAction(action) {
  if (outsFlashing.value) return
  lastAction.value = { offense: action.offense, defense: action.defense, outs: action.outs }
  offenseScore.value += action.offense
  defenseScore.value += action.defense
  outs.value = Math.min(3, outs.value + action.outs)
  broadcast()
  checkOutsReset()
}

// ── Button tap feedback ───────────────────────────────────────────────────────
const tappedAction = ref(null)

function applyActionWithFeedback(action) {
  tappedAction.value = action.label
  setTimeout(() => { tappedAction.value = null }, 150)
  applyAction(action)
}

// ── Undo ─────────────────────────────────────────────────────────────────────
function undo() {
  if (!lastAction.value) return
  offenseScore.value -= lastAction.value.offense
  defenseScore.value -= lastAction.value.defense
  outs.value = Math.max(0, outs.value - lastAction.value.outs)
  lastAction.value = null
  broadcast()
}

// ── Confirmation modal ────────────────────────────────────────────────────────
const confirmModal = ref(null) // { message, onConfirm }

function showConfirm(message, onConfirm) {
  confirmModal.value = { message, onConfirm }
}

function confirmAction() {
  confirmModal.value?.onConfirm()
  confirmModal.value = null
}

function dismissConfirm() {
  confirmModal.value = null
}

// ── Reset timer ───────────────────────────────────────────────────────────────
function handleResetTimer() {
  if (timerRunning.value) {
    showConfirm('Reset the timer?', resetTimer)
  } else {
    resetTimer()
  }
}

// ── New Inning ────────────────────────────────────────────────────────────────
function handleNewInning() {
  const doIt = () => {
    pauseTimer()
    resetToConfig()
    clearState()
    broadcast()
  }
  if (timerRunning.value) {
    showConfirm('Start a new inning? Scores and timer will reset.', doIt)
  } else {
    doIt()
  }
}

// ── PartyKit real-time sync ──────────────────────────────────────────────────
let socket = null

function initParty() {
  if (!config.value?.partyHost || !config.value?.roomId) return
  try {
    socket = new PartySocket({
      host: config.value.partyHost,
      room: config.value.roomId,
    })
    socket.onmessage = (e) => {
      try {
        const state = JSON.parse(e.data)
        offenseScore.value = state.offenseScore
        defenseScore.value = state.defenseScore
        outs.value = state.outs
        secondsLeft.value = state.secondsLeft
        inningDuration.value = state.inningDuration
      } catch {}
    }
  } catch {}
}

function broadcast() {
  if (!socket) return
  try {
    socket.send(JSON.stringify({
      offenseScore: offenseScore.value,
      defenseScore: defenseScore.value,
      outs: outs.value,
      secondsLeft: secondsLeft.value,
      inningDuration: inningDuration.value,
    }))
  } catch {}
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadConfig()
  initParty()
})

onUnmounted(() => {
  pauseTimer()
  socket?.close()
})

// ── Section style helpers ────────────────────────────────────────────────────
const sectionStyles = {
  offense: {
    header: 'text-blue-300',
    btn: 'bg-blue-950/80 border-blue-800/60 text-blue-100 active:bg-blue-800/80',
  },
  both: {
    header: 'text-sky-400',
    btn: 'bg-sky-950/60 border-sky-800/50 text-sky-100 active:bg-sky-800/60',
  },
  defense: {
    header: 'text-slate-300',
    btn: 'bg-slate-700/60 border-slate-500/50 text-slate-100 active:bg-slate-600/80',
  },
}

function deltaLabel(action) {
  const parts = []
  if (action.offense !== 0) parts.push(`OFF ${action.offense > 0 ? '+' : ''}${fmt(action.offense)}`)
  if (action.defense !== 0) parts.push(`DEF ${action.defense > 0 ? '+' : ''}${fmt(action.defense)}`)
  if (action.outs > 0) parts.push(`+${action.outs} out`)
  return parts.join(' · ')
}
</script>

<template>
  <div v-if="!config" class="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xl">
    Loading…
  </div>

  <div v-else class="h-[100dvh] bg-[#0d1b2e] text-white flex flex-col max-w-lg mx-auto px-3 pt-4 overflow-hidden">

    <!-- ── Timer ── -->
    <div class="flex items-center justify-between mb-4">
      <button
        @click="openTimerEdit"
        :class="[
          'text-4xl font-mono font-bold tracking-wider px-3 py-2 rounded-xl transition-colors',
          timerExpired
            ? 'text-red-400 bg-red-950/40'
            : timerWarning
              ? 'text-yellow-400 animate-pulse bg-yellow-950/40'
              : 'text-white hover:bg-slate-800'
        ]"
        title="Tap to change duration"
      >
        {{ formattedTime }}
      </button>

      <div class="flex gap-2">
        <button
          @click="toggleTimer"
          class="w-12 h-12 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xl active:bg-slate-600"
        >
          <span class="font-bold text-base leading-none">{{ timerRunning ? '||' : '▶' }}</span>
        </button>
        <button
          @click="handleResetTimer"
          class="w-12 h-12 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xl active:bg-slate-600 transition-colors"
        >
          ↺
        </button>
      </div>
    </div>

    <!-- ── Scoreboard ── -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <button
        @click="openScoreEdit"
        class="bg-blue-950 border border-blue-800/70 rounded-2xl p-4 text-center active:bg-blue-900 transition-colors"
      >
        <div class="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">Offense</div>
        <div class="text-5xl font-bold text-white leading-none">{{ fmt(offenseScore) }}</div>
      </button>
      <button
        @click="openScoreEdit"
        class="bg-slate-700/80 border border-slate-500/50 rounded-2xl p-4 text-center active:bg-slate-600/80 transition-colors"
      >
        <div class="text-slate-300 text-xs font-semibold uppercase tracking-widest mb-1">Defense</div>
        <div class="text-5xl font-bold text-white leading-none">{{ fmt(defenseScore) }}</div>
      </button>
    </div>

    <!-- ── Outs ── -->
    <div class="flex items-center justify-between bg-slate-800/80 border border-slate-600/50 rounded-2xl px-5 py-3 mb-5">
      <span class="text-slate-400 text-sm font-semibold uppercase tracking-widest">Outs</span>
      <div class="flex gap-3">
        <button
          v-for="i in 3"
          :key="i"
          @click="tapOut(i - 1)"
          class="w-10 h-10 rounded-full border-2 transition-colors"
          :class="outsFlashing ? 'bg-red-500 border-red-300 animate-pulse' : i <= outs ? 'bg-blue-400 border-blue-300' : 'bg-slate-600 border-slate-500'"
        />
      </div>
      <button
        @click="undo"
        :disabled="!lastAction"
        class="text-sm font-medium px-3 py-1 rounded-lg transition-colors"
        :class="lastAction ? 'text-slate-300 active:bg-slate-700' : 'text-slate-600'"
      >
        Undo
      </button>
    </div>

    <!-- ── Action Buttons ── -->
    <div class="flex flex-col gap-5 flex-1 overflow-y-auto pb-4 -mx-3 px-3">
      <div v-for="section in sections" :key="section.key">
        <div :class="['text-xs font-semibold uppercase tracking-widest mb-2 px-1', sectionStyles[section.key].header]">
          {{ section.label }}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="action in section.actions"
            :key="action.label"
            @click="applyActionWithFeedback(action)"
            :class="['border rounded-xl px-3 py-3 text-left transition-all duration-150', sectionStyles[section.key].btn, tappedAction === action.label ? 'scale-95 brightness-150' : 'scale-100']"
            style="min-height: 64px"
          >
            <div class="font-semibold text-sm leading-tight">{{ action.label }}</div>
            <div class="text-xs opacity-60 mt-1 leading-tight">{{ deltaLabel(action) }}</div>
          </button>
        </div>
      </div>
    </div>

    <!-- ── New Inning ── -->
    <button
      @click="handleNewInning"
      class="shrink-0 pb-4 pt-2 w-full py-4 rounded-2xl border-2 border-slate-600/50 bg-slate-800/60 text-slate-400 font-semibold text-base tracking-wide active:bg-slate-700 transition-colors select-none"
    >
      New Inning
    </button>

  </div>

  <!-- ── Confirmation Modal ── -->
  <Teleport to="body">
    <div
      v-if="confirmModal"
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6"
      @click.self="dismissConfirm"
    >
      <div class="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-xs">
        <p class="text-white text-base mb-6">{{ confirmModal.message }}</p>
        <div class="flex gap-3">
          <button @click="dismissConfirm" class="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 active:bg-slate-700">Cancel</button>
          <button @click="confirmAction" class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold active:bg-blue-500">Confirm</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Timer Edit Modal ── -->
  <Teleport to="body">
    <div
      v-if="showTimerEdit"
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6"
      @click.self="showTimerEdit = false"
    >
      <div class="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-xs">
        <h2 class="text-white font-semibold text-lg mb-4">Set Inning Time</h2>
        <div class="flex items-center gap-3 mb-6">
          <input
            v-model="timerEditMinutes"
            type="number"
            min="1"
            max="99"
            inputmode="numeric"
            class="flex-1 bg-slate-700 border border-slate-500 rounded-xl px-4 py-3 text-white text-2xl font-mono text-center focus:outline-none focus:border-blue-400"
            @keyup.enter="applyTimerEdit"
          />
          <span class="text-slate-400 text-lg">min</span>
        </div>
        <div class="flex gap-3">
          <button @click="showTimerEdit = false" class="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 active:bg-slate-700">Cancel</button>
          <button @click="applyTimerEdit" class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold active:bg-blue-500">Set</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Score Edit Modal ── -->
  <Teleport to="body">
    <div
      v-if="showScoreEdit"
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6"
      @click.self="showScoreEdit = false"
    >
      <div class="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-xs">
        <h2 class="text-white font-semibold text-lg mb-4">Edit Scores</h2>
        <div class="flex flex-col gap-4 mb-6">
          <div>
            <label class="text-blue-400 text-xs uppercase tracking-widest font-semibold block mb-2">Offense</label>
            <input
              v-model="scoreEditOffense"
              type="number"
              step="0.5"
              inputmode="decimal"
              class="w-full bg-slate-700 border border-blue-700/50 rounded-xl px-4 py-3 text-white text-2xl font-mono text-center focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label class="text-red-400 text-xs uppercase tracking-widest font-semibold block mb-2">Defense</label>
            <input
              v-model="scoreEditDefense"
              type="number"
              step="0.5"
              inputmode="decimal"
              class="w-full bg-slate-700 border border-red-700/50 rounded-xl px-4 py-3 text-white text-2xl font-mono text-center focus:outline-none focus:border-red-400"
            />
          </div>
        </div>
        <div class="flex gap-3">
          <button @click="showScoreEdit = false" class="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 active:bg-slate-700">Cancel</button>
          <button @click="applyScoreEdit" class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold active:bg-blue-500">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
