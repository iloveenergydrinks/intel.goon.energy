import type { GameState } from '../state/store'

export function attachControls(getState: () => GameState, setState: (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void) {
  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()))
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
  window.addEventListener('keydown', (e) => { if (e.code === 'Space') (window as any).__keySpaceDown = true })
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') (window as any).__keySpaceDown = false })
  // dark run (Shift)
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') (window as any).__darkRunHeld = true })
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') (window as any).__darkRunHeld = false })

  function tick(dt: number) {
    const s = getState()
    const player = { ...s.player }
    const scan = { ...s.scan }

    // rotation A/D
    if (keys.has('a')) player.headingRadians -= 2.0 * dt
    if (keys.has('d')) player.headingRadians += 2.0 * dt

    // throttle W/S
    const thrust = keys.has('w') ? 1 : keys.has('s') ? -0.4 : 0
    const accelBase = s.player.accel ?? 180
    const accel = accelBase * thrust
    player.velocity.x += Math.cos(player.headingRadians) * accel * dt
    player.velocity.y += Math.sin(player.headingRadians) * accel * dt
    // apply drag to lower inertia
    const drag = 1.6 // per second
    player.velocity.x -= player.velocity.x * drag * dt
    player.velocity.y -= player.velocity.y * drag * dt
    // clamp max speed
    const maxSpeed = s.player.maxSpeed ?? 220
    const vmag = Math.hypot(player.velocity.x, player.velocity.y)
    if (vmag > maxSpeed) {
      const scale = maxSpeed / vmag
      player.velocity.x *= scale
      player.velocity.y *= scale
    }
    player.position.x += player.velocity.x * dt
    player.position.y += player.velocity.y * dt
    // NI responds to thrust; small baseline when coasting
    player.thrustNoise = Math.max(0.02, Math.max(0, thrust) * 0.25)

    // arc width Q/E
    if (keys.has('q')) scan.passiveArcDegrees = Math.max(s.scan.passiveArcMinDegrees, scan.passiveArcDegrees - 60 * dt)
    if (keys.has('e')) scan.passiveArcDegrees = Math.min(s.scan.passiveArcMaxDegrees, scan.passiveArcDegrees + 60 * dt)

    // dark run toggle (hold)
    scan.darkRunActive = (window as any).__darkRunHeld === true

    setState({ player, scan })
  }

  return { tick }
}

