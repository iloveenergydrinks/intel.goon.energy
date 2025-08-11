import type { ActiveContact, AmbientContact, PassiveReturn, Ship, Vector2D } from '../state/store'

// Threshold/SNR-based detection parameters. Distances are in meters; conversion is provided via PX_PER_M.
export type DetectionParams = {
  PX_PER_M: number
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
  const dBasePx = params.ambientBaseMeters * params.PX_PER_M
  const threshold = 1 / Math.max(1, dBasePx * dBasePx) // ~1/(r^2)
  for (const target of others) {
    const rPx = distance(player.position, target.position)
    const sizeFactor = classSizeFactor(target)
    const signal = (Math.max(0.01, target.niSmooth) * sizeFactor) / Math.max(1, rPx * rPx)
    if (signal >= threshold) {
      contacts.push({ id: target.id, approximatePosition: { x: target.position.x + rand(-20, 20), y: target.position.y + rand(-20, 20) } })
    }
  }
  return contacts
}

export function computePassiveReturns(player: Ship, others: Ship[], params: DetectionParams): PassiveReturn[] {
  const returns: PassiveReturn[] = []
  const dBasePx = params.passiveBaseMeters * params.PX_PER_M
  const threshold = 1 / Math.max(1, dBasePx * dBasePx) // ~1/(r^2)
  const arcDeg = clamp(params.passiveArcDegrees, params.passiveArcMinDegrees, params.passiveArcMaxDegrees)
  // Directivity: gain increases as arc narrows; DI = sqrt(maxArc / arcNow). Anchored so DI=1 at max arc
  const DI = Math.sqrt(params.passiveArcMaxDegrees / Math.max(1, arcDeg))
  for (const target of others) {
    if (!isWithinArc(player, target, arcDeg)) continue
    const rPx = distance(player.position, target.position)
    const sizeFactor = classSizeFactor(target)
    const signal = (Math.max(0.01, target.niSmooth) * sizeFactor * DI) / Math.max(1, rPx * rPx)
    if (signal >= threshold) {
      const snr = Math.max(1, signal / threshold)
      const minErrPx = params.passiveMinErrorMeters * params.PX_PER_M
      const maxErrPx = params.passiveMaxErrorMeters * params.PX_PER_M
      const baseErrPx = (minErrPx + maxErrPx) / 2
      const posErrorPx = clamp(baseErrPx / Math.sqrt(snr), minErrPx, maxErrPx) * (0.9 + Math.random() * 0.2)
      const approximate = jitter(target.position, posErrorPx)
      returns.push({ id: target.id, approximatePosition: approximate, posErrorMeters: posErrorPx })
    }
  }
  return returns
}

export function computeActiveContacts(player: Ship, others: Ship[], params: DetectionParams): ActiveContact[] {
  const hits: ActiveContact[] = []
  // Two-way spreading loss ~ 1/(r^4). Anchor threshold so base distance is the reference for sizeFactor=1
  const dBasePx = params.activeBaseMeters * params.PX_PER_M
  const threshold = 1 / Math.max(1, Math.pow(dBasePx, 4))
  for (const target of others) {
    const rPx = distance(player.position, target.position)
    const sizeFactor = classSizeFactor(target)
    const signal = sizeFactor / Math.max(1, Math.pow(rPx, 4))
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

function jitter(point: Vector2D, radius: number): Vector2D {
  const angle = Math.random() * Math.PI * 2
  const r = Math.random() * radius
  return { x: point.x + Math.cos(angle) * r, y: point.y + Math.sin(angle) * r }
}

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

