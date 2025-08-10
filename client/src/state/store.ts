import { createStore } from 'zustand/vanilla'
import { generateWorld } from '../world/generate'

export type Vector2D = { x: number; y: number }

export type EnvironmentType = 'open' | 'shadow' | 'thermal' | 'clutter'

export type EnvironmentZone = {
  id: string
  type: EnvironmentType
  x: number
  y: number
  width: number
  height: number
  noiseSuppression: number
}

export type ObstacleRect = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type Ship = {
  id: string
  name: string
  classId?: 'frigate' | 'destroyer' | 'cruiser' | 'capital'
  position: Vector2D
  velocity: Vector2D
  headingRadians: number
  baseNoise: number
  thrustNoise: number
  weaponsNoise: number
  moduleNoise: number
  suppression: number
  niRaw: number
  niSmooth: number
  isPlayer: boolean
  lastPingDetectedAt: number | null
  lastDecoyAt?: number | null
  // Hybrid model stats
  detectabilityBaseMeters?: number
  maxSpeed?: number
  accel?: number
  scanRangeMultiplier?: number
}

export type AmbientContact = { id: string; approximatePosition: Vector2D }
export type PassiveReturn = { id: string; approximatePosition: Vector2D; posErrorMeters: number }
export type ActiveContact = { id: string; position: Vector2D }

export type SpecializedMode = 'none' | 'thermal' | 'gravitic' | 'em'

export type ScanState = {
  ambientRangeMeters: number
  passiveArcDegrees: number
  passiveArcMaxDegrees: number
  passiveArcMinDegrees: number
  passiveRangeMeters: number
  passiveRevealRadiusMeters: number
  activeRangeMeters: number
  activeRevealRadiusMeters: number
  activeCooldownMs: number
  lastActivePingAt: number | null
  lastPassiveRevealAt: number | null
  darkRunActive: boolean
  darkRunDisableActiveUntilMs: number | null
  specializedMode: SpecializedMode
}

export type DetectionState = {
  ambientContacts: AmbientContact[]
  passiveReturns: PassiveReturn[]
  activeContacts: ActiveContact[]
  revealBubbles: { x: number; y: number; r: number; createdAt: number; ttlMs: number }[]
  activeContactsExpiresAtMs: number | null
  breadcrumbs: { x: number; y: number; createdAt: number; ttlMs: number; isDecoy?: boolean }[]
  decoys: { x: number; y: number; createdAt: number; ttlMs: number }[]
}

export type GameState = {
  player: Ship
  prey: Ship
  extras: Ship[]
  zones: EnvironmentZone[]
  obstacles: ObstacleRect[]
  worldWidth: number
  worldHeight: number
  escapeZone: { x: number; y: number; width: number; height: number }
  gameStatus: 'playing' | 'win' | 'lose'
  timeStartMs: number
  timeLimitMs: number
  scan: ScanState
  detection: DetectionState
  timeMs: number
  // Hybrid scanning toggles/params
  hybridCaps: { ambient: number; passive: number; active: number }
  // Pre-game selection
  gamePhase: 'menu' | 'playing'
  availableShips: Array<{
    id: 'frigate' | 'destroyer' | 'cruiser' | 'capital'
    name: string
    detectabilityBaseMeters: number
    baseNoise: number
    maxSpeed: number
    accel: number
    passiveRangeMeters: number
    activeRangeMeters: number
  }>
  // Camera
  cameraZoom: number
  cameraZoomMin: number
  cameraZoomMax: number
  setState: (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void
  updateDetection: (partial: Partial<DetectionState>) => void
}

const now = () => performance.now()

const WORLD_W = 3000
const WORLD_H = 2000
const generated = generateWorld(WORLD_W, WORLD_H)
const initialZones: EnvironmentZone[] = generated.zones
const initialObstacles: ObstacleRect[] = generated.obstacles

export function createInitialPlayer(): Ship {
  return {
  id: 'player',
  name: 'Hunter',
  classId: 'frigate',
  position: { x: 150, y: 150 },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  baseNoise: 0.2,
  thrustNoise: 0,
  weaponsNoise: 0,
  moduleNoise: 0.05,
  suppression: 0,
  niRaw: 0,
  niSmooth: 0,
  isPlayer: true,
  lastPingDetectedAt: null,
  detectabilityBaseMeters: 6000,
  maxSpeed: 220,
  accel: 180,
  scanRangeMultiplier: 1.0,
  }
}

export function createInitialPrey(): Ship {
  return {
  id: 'prey',
  name: 'Prey',
  classId: 'destroyer',
  position: { x: 700, y: 500 },
  velocity: { x: -0.05, y: 0 },
  headingRadians: Math.PI,
  baseNoise: 0.1,
  thrustNoise: 0.02,
  weaponsNoise: 0,
  moduleNoise: 0.02,
  suppression: 0,
  niRaw: 0,
  niSmooth: 0,
  isPlayer: false,
  lastPingDetectedAt: null,
  detectabilityBaseMeters: 7000,
  maxSpeed: 180,
  accel: 140,
  scanRangeMultiplier: 1.0,
  }
}

export const useGameState = createStore<GameState>((set) => ({
  player: createInitialPlayer(),
  prey: createInitialPrey(),
  extras: [],
  zones: initialZones,
  obstacles: initialObstacles,
  worldWidth: WORLD_W,
  worldHeight: WORLD_H,
  escapeZone: generated.escapeZone,
  gameStatus: 'playing',
  timeStartMs: now(),
  timeLimitMs: 120000,
  hybridCaps: { ambient: 1.5, passive: 1.75, active: 2.0 },
  gamePhase: 'menu',
  availableShips: [
    { id: 'frigate', name: 'Frigate', detectabilityBaseMeters: 6000, baseNoise: 0.18, maxSpeed: 240, accel: 220, passiveRangeMeters: 12000, activeRangeMeters: 24000 },
    { id: 'destroyer', name: 'Destroyer', detectabilityBaseMeters: 7000, baseNoise: 0.22, maxSpeed: 210, accel: 190, passiveRangeMeters: 13000, activeRangeMeters: 26000 },
    { id: 'cruiser', name: 'Cruiser', detectabilityBaseMeters: 8000, baseNoise: 0.26, maxSpeed: 190, accel: 170, passiveRangeMeters: 14000, activeRangeMeters: 28000 },
    { id: 'capital', name: 'Capital', detectabilityBaseMeters: 9500, baseNoise: 0.32, maxSpeed: 160, accel: 140, passiveRangeMeters: 15000, activeRangeMeters: 30000 },
  ],
  cameraZoom: 0.55,
  cameraZoomMin: 0.4,
  cameraZoomMax: 1.4,
  scan: {
    ambientRangeMeters: 5000,
    passiveArcDegrees: 90,
    passiveArcMaxDegrees: 180,
    passiveArcMinDegrees: 30,
    passiveRangeMeters: 10000,
    passiveRevealRadiusMeters: 2000,
    activeRangeMeters: 24000,
    activeRevealRadiusMeters: 48000,
    activeCooldownMs: 5000,
    lastActivePingAt: null,
    lastPassiveRevealAt: null,
    darkRunActive: false,
    darkRunDisableActiveUntilMs: null,
    specializedMode: 'thermal',
  },
  detection: {
    ambientContacts: [],
    passiveReturns: [],
    activeContacts: [],
    revealBubbles: [],
    activeContactsExpiresAtMs: null,
    breadcrumbs: [],
    decoys: [],
  },
  timeMs: now(),
  setState: (partial) => set((s) => ({ ...s, ...(typeof partial === 'function' ? (partial as any)(s) : partial) })),
  updateDetection: (partial) => set((s) => ({ detection: { ...s.detection, ...partial } })),
}))

export function resetGame() {
  useGameState.setState({
    player: createInitialPlayer(),
    prey: createInitialPrey(),
    extras: [],
    detection: { ambientContacts: [], passiveReturns: [], activeContacts: [], revealBubbles: [], activeContactsExpiresAtMs: null, breadcrumbs: [], decoys: [] },
    gameStatus: 'playing',
    timeStartMs: performance.now(),
  })
}

export function createAIShip(
  classId: 'frigate' | 'destroyer' | 'cruiser' | 'capital',
  name: string,
  x: number,
  y: number,
): Ship {
  const presets = {
    frigate: { baseNoise: 0.16, thrustNoise: 0.02, moduleNoise: 0.02, maxSpeed: 240, accel: 200, detectabilityBaseMeters: 6000 },
    destroyer: { baseNoise: 0.22, thrustNoise: 0.03, moduleNoise: 0.03, maxSpeed: 210, accel: 180, detectabilityBaseMeters: 7000 },
    cruiser: { baseNoise: 0.28, thrustNoise: 0.035, moduleNoise: 0.035, maxSpeed: 190, accel: 160, detectabilityBaseMeters: 8000 },
    capital: { baseNoise: 0.34, thrustNoise: 0.04, moduleNoise: 0.04, maxSpeed: 160, accel: 140, detectabilityBaseMeters: 9500 },
  } as const
  const p = presets[classId]
  return {
    id: `${name}`,
    name,
    classId,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    headingRadians: Math.random() * Math.PI * 2,
    baseNoise: p.baseNoise,
    thrustNoise: p.thrustNoise,
    weaponsNoise: 0,
    moduleNoise: p.moduleNoise,
    suppression: 0,
    niRaw: 0,
    niSmooth: 0,
    isPlayer: false,
    lastPingDetectedAt: null,
    detectabilityBaseMeters: p.detectabilityBaseMeters,
    maxSpeed: p.maxSpeed,
    accel: p.accel,
    scanRangeMultiplier: 1.0,
  }
}

export function createInitialExtras(): Ship[] {
  return [
    createAIShip('frigate', 'Bandit-F', 2200, 400),
    createAIShip('destroyer', 'Bandit-D', 1200, 1500),
    createAIShip('cruiser', 'Bandit-C', 2600, 1200),
  ]
}

