import type { EnvironmentZone, Ship, Vector2D, ObstacleRect } from '../state/store'

export function isPointInsideZone(point: Vector2D, zone: EnvironmentZone): boolean {
  return (
    point.x >= zone.x &&
    point.x <= zone.x + zone.width &&
    point.y >= zone.y &&
    point.y <= zone.y + zone.height
  )
}

export function environmentSuppressionAt(point: Vector2D, zones: EnvironmentZone[]): number {
  let totalSuppression = 0
  for (const zone of zones) {
    if (isPointInsideZone(point, zone)) {
      totalSuppression += zone.noiseSuppression
    }
  }
  // Clamp to [0, 0.9] so ships are never perfectly silent
  return Math.max(0, Math.min(0.9, totalSuppression))
}

export function computeNoiseIndexRaw(ship: Ship, zones: EnvironmentZone[]): number {
  const envSuppression = environmentSuppressionAt(ship.position, zones)
  const base = ship.baseNoise + ship.thrustNoise + ship.weaponsNoise + ship.moduleNoise
  const suppressed = base * (1 - envSuppression) * (1 - ship.suppression)
  // clamp for display range
  return Math.max(0, Math.min(1.5, suppressed))
}

export function smoothNoise(previous: number, current: number, alpha: number): number {
  const clampedAlpha = Math.max(0.01, Math.min(1, alpha))
  return previous + (current - previous) * clampedAlpha
}

export function resolveCollisions(position: Vector2D, next: Vector2D, obstacles: ObstacleRect[]): Vector2D {
  // Simple axis-aligned rectangle collision: if next point lies inside, clamp by backing off movement along each axis
  let corrected = { ...next }
  for (const r of obstacles) {
    const inside = corrected.x >= r.x && corrected.x <= r.x + r.width && corrected.y >= r.y && corrected.y <= r.y + r.height
    if (inside) {
      // Compute deltas
      const dx1 = Math.abs((r.x - corrected.x))
      const dx2 = Math.abs((r.x + r.width - corrected.x))
      const dy1 = Math.abs((r.y - corrected.y))
      const dy2 = Math.abs((r.y + r.height - corrected.y))
      // Push out along the smallest penetration axis
      const minX = dx1 < dx2 ? r.x - 0.01 : r.x + r.width + 0.01
      const minY = dy1 < dy2 ? r.y - 0.01 : r.y + r.height + 0.01
      const penX = Math.min(dx1, dx2)
      const penY = Math.min(dy1, dy2)
      if (penX < penY) {
        corrected.x = minX
      } else {
        corrected.y = minY
      }
    }
  }
  return corrected
}

export function resolveCollisionsWithVelocity(
  position: Vector2D,
  next: Vector2D,
  velocity: Vector2D,
  obstacles: ObstacleRect[],
): { nextPos: Vector2D; nextVel: Vector2D } {
  let corrected = { ...next }
  let newVel = { ...velocity }
  for (const r of obstacles) {
    const inside = corrected.x >= r.x && corrected.x <= r.x + r.width && corrected.y >= r.y && corrected.y <= r.y + r.height
    if (inside) {
      const dxLeft = corrected.x - r.x
      const dxRight = r.x + r.width - corrected.x
      const dyTop = corrected.y - r.y
      const dyBottom = r.y + r.height - corrected.y
      const penX = Math.min(dxLeft, dxRight)
      const penY = Math.min(dyTop, dyBottom)
      if (penX < penY) {
        // Resolve along X and zero X velocity to allow sliding along Y
        corrected.x = dxLeft < dxRight ? r.x - 0.01 : r.x + r.width + 0.01
        newVel.x = 0
      } else {
        // Resolve along Y and zero Y velocity to allow sliding along X
        corrected.y = dyTop < dyBottom ? r.y - 0.01 : r.y + r.height + 0.01
        newVel.y = 0
      }
    }
  }
  return { nextPos: corrected, nextVel: newVel }
}

export function clampToWorldBoundsWithVelocity(
  next: Vector2D,
  velocity: Vector2D,
  worldWidth: number,
  worldHeight: number,
): { nextPos: Vector2D; nextVel: Vector2D } {
  const corrected = { ...next }
  const newVel = { ...velocity }
  if (corrected.x < 0) {
    corrected.x = 0
    newVel.x = 0
  } else if (corrected.x > worldWidth) {
    corrected.x = worldWidth
    newVel.x = 0
  }
  if (corrected.y < 0) {
    corrected.y = 0
    newVel.y = 0
  } else if (corrected.y > worldHeight) {
    corrected.y = worldHeight
    newVel.y = 0
  }
  return { nextPos: corrected, nextVel: newVel }
}

