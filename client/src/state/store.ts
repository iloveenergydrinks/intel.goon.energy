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
  }
}

export function createInitialPrey(): Ship {
  return {
  id: 'prey',
  name: 'Prey',
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
  }
}

export const useGameState = createStore<GameState>((set) => ({
  player: createInitialPlayer(),
  prey: createInitialPrey(),
  zones: initialZones,
  obstacles: initialObstacles,
  worldWidth: WORLD_W,
  worldHeight: WORLD_H,
  escapeZone: generated.escapeZone,
  gameStatus: 'playing',
  timeStartMs: now(),
  timeLimitMs: 120000,
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
  const s = useGameState.getState()
  useGameState.setState({
    player: createInitialPlayer(),
    prey: createInitialPrey(),
    detection: { ambientContacts: [], passiveReturns: [], activeContacts: [], revealBubbles: [], activeContactsExpiresAtMs: null, breadcrumbs: [], decoys: [] },
    gameStatus: 'playing',
    timeStartMs: performance.now(),
  })
}

