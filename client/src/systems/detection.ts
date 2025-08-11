import type { ActiveContact, AmbientContact, PassiveReturn, Ship, Vector2D } from '../state/store'

// Threshold/SNR-based detection parameters. Distances are in meters; conversion is provided via PX_PER_M.
export type DetectionParams = {
  // Base ranges in meters (act as reference distances where detection happens for standard target at wide arc)
  ambientBaseMeters: number
  passiveBaseMeters: number
  activeBaseMeters: number
  // Passive arc characteristics (degrees)
  passiveArcDegrees: number
  passiveArcMaxDegrees: number
  passiveArcMinDegrees: number
  // Passive position error bounds (in meters)
  passiveMinErrorMeters: number
  passiveMaxErrorMeters: number
}

const PX_PER_M = 1 / 40 // meters to pixels; use 1/PX_PER_M to convert pixels to meters
// Calibration so base ranges feel right with typical NI ~ 0.2
const NI_CAL_AMBIENT = 5.0
const NI_CAL_PASSIVE = 8.0

export function distance(a: Vector2D, b: Vector2D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function isWithinArc(source: Ship, target: Ship, arcDegrees: number): boolean {
  const dx = target.position.x - source.position.x
  const dy = target.position.y - source.position.y
  const angleToTarget = Math.atan2(dy, dx)
  let delta = Math.atan2(Math.sin(angleToTarget - source.headingRadians), Math.cos(angleToTarget - source.headingRadians))
  delta = Math.abs(delta)
  const halfArc = (arcDegrees * Math.PI) / 180 / 2
  return delta <= halfArc
}

export function computeAmbientContacts(player: Ship, others: Ship[], params: DetectionParams): AmbientContact[] {
  const contacts: AmbientContact[] = []
  const dBaseM = Math.max(1, params.ambientBaseMeters)
  const threshold = 1 / (dBaseM * dBaseM) // ~1/(r_m^2)
  for (const target of others) {
    const rPx = Math.max(1, distance(player.position, target.position))
    const rM = rPx / PX_PER_M
    const sizeFactor = classSizeFactor(target)
    const signal = (NI_CAL_AMBIENT * Math.max(0.01, target.niSmooth) * sizeFactor) / (rM * rM)
    if (signal >= threshold) {
      contacts.push({ id: target.id, approximatePosition: { x: target.position.x + rand(-20, 20), y: target.position.y + rand(-20, 20) } })
    }
  }
  return contacts
}

export function computePassiveReturns(player: Ship, others: Ship[], params: DetectionParams): PassiveReturn[] {
  const returns: PassiveReturn[] = []
  const dBaseM = Math.max(1, params.passiveBaseMeters)
  const threshold = 1 / (dBaseM * dBaseM) // ~1/(r_m^2)
  const arcDeg = clamp(params.passiveArcDegrees, params.passiveArcMinDegrees, params.passiveArcMaxDegrees)
  // Directivity: gain increases as arc narrows; DI = sqrt(maxArc / arcNow). Anchored so DI=1 at max arc
  const DI = Math.sqrt(params.passiveArcMaxDegrees / Math.max(1, arcDeg))
  for (const target of others) {
    if (!isWithinArc(player, target, arcDeg)) continue
    const rPx = Math.max(1, distance(player.position, target.position))
    const rM = rPx / PX_PER_M
    const sizeFactor = classSizeFactor(target)
    const signal = (NI_CAL_PASSIVE * Math.max(0.01, target.niSmooth) * sizeFactor * DI) / (rM * rM)
    if (signal >= threshold) {
      const snr = Math.max(1, signal / threshold)
      const minErr = params.passiveMinErrorMeters
      const maxErr = params.passiveMaxErrorMeters
      const baseErr = (minErr + maxErr) / 2
      const posError = clamp(baseErr / Math.sqrt(snr), minErr, maxErr) * (0.9 + Math.random() * 0.2)
      // Bearing to target from player
      const dx = target.position.x - player.position.x
      const dy = target.position.y - player.position.y
      const bearing = Math.atan2(dy, dx)
      returns.push({ id: target.id, bearingRadians: bearing, posErrorMeters: posError, snr })
    }
  }
  return returns
}

export function computeActiveContacts(player: Ship, others: Ship[], params: DetectionParams): ActiveContact[] {
  const hits: ActiveContact[] = []
  // Two-way spreading loss ~ 1/(r_m^4). Anchor threshold so base distance is the reference for sizeFactor=1
  const dBaseM = Math.max(1, params.activeBaseMeters)
  const threshold = 1 / Math.pow(dBaseM, 4)
  for (const target of others) {
    const rPx = Math.max(1, distance(player.position, target.position))
    const rM = rPx / PX_PER_M
    const sizeFactor = classSizeFactor(target)
    const signal = sizeFactor / Math.pow(rM, 4)
    if (signal >= threshold) {
      hits.push({ id: target.id, position: { ...target.position } })
    }
  }
  return hits
}

export function createRevealBubble(source: Ship, radius: number, lifetimeMs: number) {
  return { x: source.position.x, y: source.position.y, r: radius, createdAt: performance.now(), ttlMs: lifetimeMs }
}

export function isInsideRevealBubble(point: Vector2D, bubble: { x: number; y: number; r: number }): boolean {
  return distance(point, bubble) <= bubble.r
}

// jitter helper removed from passive path; keep if needed elsewhere

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function classSizeFactor(target: Ship): number {
  const base = (target.detectabilityBaseMeters ?? 7000) / 7000
  return Math.max(0.8, Math.min(1.2, base))
}

