import type { EnvironmentZone, ObstacleRect, Ship } from '../state/store'
import { environmentSuppressionAt } from '../systems/noise'

type PreyIntent = 'patrol' | 'evade' | 'hide'

const unstickUntilById = new Map<string, number>()

function repulsionFromObstacles(px: number, py: number, obstacles: ObstacleRect[]): { rx: number; ry: number } {
  let rx = 0
  let ry = 0
  const margin = 30
  for (const r of obstacles) {
    const cx = Math.max(r.x, Math.min(px, r.x + r.width))
    const cy = Math.max(r.y, Math.min(py, r.y + r.height))
    const dx = px - cx
    const dy = py - cy
    const dist = Math.hypot(dx, dy)
    if (dist < margin && dist > 0.0001) {
      const strength = (margin - dist) / margin
      rx += (dx / dist) * strength
      ry += (dy / dist) * strength
    }
  }
  return { rx, ry }
}

export function updatePreyAI(prey: Ship, zones: EnvironmentZone[], obstacles: ObstacleRect[], dtMs: number): Ship {
  const pingRecently = prey.lastPingDetectedAt && performance.now() - prey.lastPingDetectedAt < 4000
  const envSupp = environmentSuppressionAt(prey.position, zones)
  let intent: PreyIntent = 'patrol'
  if (pingRecently) intent = 'evade'
  if (envSupp < 0.3 && pingRecently) intent = 'hide'

  const dt = dtMs / 1000
  const speed = 220 // match player top speed

  if (intent === 'patrol') {
    // simple left-right with minor noise
    prey.velocity.x = -50
    prey.velocity.y = Math.sin(performance.now() / 800) * 20
    prey.suppression = 0.1
  } else if (intent === 'evade') {
    // cut thrust briefly then burst sideways
    const phase = (performance.now() / 300) % 2
    if (phase < 1) {
      prey.velocity.x *= 0.95
      prey.velocity.y *= 0.95
      prey.suppression = 0.4
    } else {
      // burst perpendicular to player heading tends to break lock
      prey.velocity.x = -speed
      prey.velocity.y = (Math.random() < 0.5 ? -1 : 1) * speed * 0.5
      prey.suppression = 0.2
    }
  } else if (intent === 'hide') {
    // drift into nearest zone (naive)
    const nearest = zones[0]
    const dirX = nearest.x + nearest.width / 2 - prey.position.x
    const dirY = nearest.y + nearest.height / 2 - prey.position.y
    const len = Math.hypot(dirX, dirY) || 1
    prey.velocity.x = (dirX / len) * (speed * 0.6)
    prey.velocity.y = (dirY / len) * (speed * 0.6)
    prey.suppression = 0.5
  }

  // Occasionally drop a decoy when pinged
  if (pingRecently) {
    const nowMs = performance.now()
    const last = prey.lastDecoyAt || 0
    if (nowMs - last > 3000) {
      ;(window as any).__spawnDecoy = { x: prey.position.x, y: prey.position.y, createdAt: nowMs }
      prey.lastDecoyAt = nowMs
    }
  }

  // Obstacle-aware steering: wall repulsion + anticipatory offset toward gap
  const repel = repulsionFromObstacles(prey.position.x, prey.position.y, obstacles)
  prey.velocity.x += repel.rx * 180 * dt
  prey.velocity.y += repel.ry * 180 * dt

  // Raycast-like probe ahead to steer around obstacles (simple lookahead sample)
  const lookAhead = 60
  const probeX = prey.position.x + Math.cos(prey.headingRadians) * lookAhead
  const probeY = prey.position.y + Math.sin(prey.headingRadians) * lookAhead
  const probeRepel = repulsionFromObstacles(probeX, probeY, obstacles)
  prey.velocity.x += probeRepel.rx * 220 * dt
  prey.velocity.y += probeRepel.ry * 220 * dt

  // Unstick: if almost stopped, force a perpendicular slide for a brief period
  const vmag = Math.hypot(prey.velocity.x, prey.velocity.y)
  const now = performance.now()
  const unstickUntil = unstickUntilById.get(prey.id) || 0
  if (vmag < 5 && now >= unstickUntil) {
    // rotate 90° from current heading
    const perpAngle = prey.headingRadians + Math.PI / 2
    prey.velocity.x = Math.cos(perpAngle) * (speed * 0.8)
    prey.velocity.y = Math.sin(perpAngle) * (speed * 0.8)
    unstickUntilById.set(prey.id, now + 400)
  }

  prey.position.x += prey.velocity.x * dt
  prey.position.y += prey.velocity.y * dt
  // apply drag similar to player to reduce inertia
  const drag = 1.6
  prey.velocity.x -= prey.velocity.x * drag * dt
  prey.velocity.y -= prey.velocity.y * drag * dt
  // clamp max speed
  if (vmag > speed) {
    const scale = speed / vmag
    prey.velocity.x *= scale
    prey.velocity.y *= scale
  }
  prey.headingRadians = Math.atan2(prey.velocity.y, prey.velocity.x)
  return prey
}

