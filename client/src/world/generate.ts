import type { EnvironmentZone, ObstacleRect } from '../state/store'

type ZoneSpec = { type: EnvironmentZone['type']; width: [number, number]; height: [number, number]; count: number }

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function placeNonOverlapping<T extends { x: number; y: number; width: number; height: number }>(
  attempts: number,
  desired: number,
  create: () => T,
  collides: (a: T, b: T) => boolean,
): T[] {
  const placed: T[] = []
  let tries = 0
  while (placed.length < desired && tries < attempts) {
    const candidate = create()
    const overlaps = placed.some((p) => collides(p, candidate))
    if (!overlaps) placed.push(candidate)
    tries++
  }
  return placed
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

export function generateWorld(width: number, height: number): { zones: EnvironmentZone[]; obstacles: ObstacleRect[]; escapeZone: { x: number; y: number; width: number; height: number } } {
  const zones: EnvironmentZone[] = []

  const zoneSpecs: ZoneSpec[] = [
    { type: 'shadow', width: [200, 420], height: [120, 260], count: 4 },
    { type: 'thermal', width: [160, 300], height: [120, 220], count: 3 },
    { type: 'clutter', width: [140, 260], height: [100, 200], count: 4 },
  ]

  const margin = 40
  for (const spec of zoneSpecs) {
    const placed = placeNonOverlapping<EnvironmentZone>(
      500,
      spec.count,
      () => {
        const w = rand(spec.width[0], spec.width[1])
        const h = rand(spec.height[0], spec.height[1])
        const x = rand(margin, Math.max(margin, width - w - margin))
        const y = rand(margin, Math.max(margin, height - h - margin))
        return { id: `${spec.type}-${Math.random().toString(36).slice(2, 7)}`, type: spec.type, x, y, width: w, height: h, noiseSuppression: spec.type === 'shadow' ? 0.5 : spec.type === 'thermal' ? 0.35 : 0.4 }
      },
      rectsOverlap,
    )
    zones.push(...placed)
  }

  // Obstacles: a handful of walls to form corridors
  const obstacles: ObstacleRect[] = []
  const wallCount = 8
  const wallPlaced = placeNonOverlapping<ObstacleRect>(
    600,
    wallCount,
    () => {
      const vertical = Math.random() < 0.5
      const w = vertical ? rand(30, 50) : rand(160, 360)
      const h = vertical ? rand(200, 480) : rand(30, 50)
      const x = rand(margin, Math.max(margin, width - w - margin))
      const y = rand(margin, Math.max(margin, height - h - margin))
      return { id: `wall-${Math.random().toString(36).slice(2, 7)}`, x, y, width: w, height: h }
    },
    (a, b) => rectsOverlap(a, b),
  )
  obstacles.push(...wallPlaced)

  // Ensure player spawn corner is clearish (top-left); remove overlapping heavy obstacles nearby
  const spawnSafeRect = { x: 0, y: 0, width: 400, height: 300 }
  const safeObstacles = obstacles.filter((o) => !rectsOverlap(o, spawnSafeRect))
  const safeZones = zones // allow zones near spawn since they are beneficial

  // Escape zone near far right, mid height
  const escapeZone = { x: width - 180, y: height / 2 - 100, width: 120, height: 200 }

  return { zones: safeZones, obstacles: safeObstacles, escapeZone }
}

