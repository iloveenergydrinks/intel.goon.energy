import type { ActiveContact, AmbientContact, PassiveReturn, Ship, Vector2D } from '../state/store'

export type DetectionParams = {
  ambientThreshold: number
  ambientRangeMeters: number
  passiveRangeMeters: number
  passiveArcDegrees: number
  passivePosErrorMeters: number
  passiveRevealRadiusMeters: number
  activeRangeMeters: number
  activeRevealRadiusMeters: number
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
  for (const target of others) {
    if (distance(player.position, target.position) <= params.ambientRangeMeters && target.niSmooth >= params.ambientThreshold) {
      contacts.push({ id: target.id, approximatePosition: { x: target.position.x + rand(-20, 20), y: target.position.y + rand(-20, 20) } })
    }
  }
  return contacts
}

export function computePassiveReturns(player: Ship, others: Ship[], params: DetectionParams): PassiveReturn[] {
  const returns: PassiveReturn[] = []
  for (const target of others) {
    if (!isWithinArc(player, target, params.passiveArcDegrees)) continue
    if (distance(player.position, target.position) > params.passiveRangeMeters) continue
    const posError = params.passivePosErrorMeters * (0.8 + Math.random() * 0.4)
    const approximate = jitter(target.position, posError)
    returns.push({ id: target.id, approximatePosition: approximate, posErrorMeters: posError })
  }
  return returns
}

export function computeActiveContacts(player: Ship, others: Ship[], params: DetectionParams): ActiveContact[] {
  const within: ActiveContact[] = []
  for (const target of others) {
    if (distance(player.position, target.position) <= params.activeRangeMeters) {
      within.push({ id: target.id, position: { ...target.position } })
    }
  }
  return within
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

