import './style.css'
import { resetGame, useGameState } from './state/store'
import { clampToWorldBoundsWithVelocity as requireClamp, computeNoiseIndexRaw, resolveCollisions, resolveCollisionsWithVelocity, smoothNoise } from './systems/noise'
import { updatePreyAI } from './ai/prey'
import { computeActiveContacts, computeAmbientContacts, computePassiveReturns, createRevealBubble } from './systems/detection'
import { createScene, drawRadar, drawShip, drawZones, updateHud, drawObstacles, updateCamera, drawHudBars } from './render/pixiApp'
import { attachControls } from './input/controls'

async function boot() {
  const mount = document.querySelector<HTMLDivElement>('#app')!
  mount.innerHTML = ''
  const scene = await createScene(mount)

  const get = useGameState.getState
  const set = useGameState.setState
  const controls = attachControls(get, set)

  let last = performance.now()

  scene.app.ticker.add(() => {
    const now = performance.now()
    const dtMs = now - last
    const dt = dtMs / 1000
    last = now

    const state = get()
    // integrate player motion from controls
    controls.tick(dt)

    // compute NI, integrate movement with collision
    const player = { ...get().player }
    const prey = { ...get().prey }

    player.niRaw = computeNoiseIndexRaw(player, state.zones)
    prey.niRaw = computeNoiseIndexRaw(prey, state.zones)
    player.niSmooth = smoothNoise(player.niSmooth, player.niRaw, 0.15)
    prey.niSmooth = smoothNoise(prey.niSmooth, prey.niRaw, 0.12)

    // prey AI + collision
    updatePreyAI(prey, state.zones, state.obstacles, dtMs)
    const nextPrey = { x: prey.position.x + prey.velocity.x * dt, y: prey.position.y + prey.velocity.y * dt }
    let preyCollision = resolveCollisionsWithVelocity(prey.position, nextPrey, prey.velocity, state.obstacles)
    // clamp to world bounds
    preyCollision = (function() {
      const r = requireClamp(preyCollision.nextPos, preyCollision.nextVel, state.worldWidth, state.worldHeight)
      return r
    })()
    prey.position.x = preyCollision.nextPos.x
    prey.position.y = preyCollision.nextPos.y
    prey.velocity.x = preyCollision.nextVel.x
    prey.velocity.y = preyCollision.nextVel.y

    // player collision
    const nextPlayer = { x: player.position.x, y: player.position.y }
    const correctedPlayer = resolveCollisions(player.position, nextPlayer, state.obstacles)
    player.position.x = correctedPlayer.x
    player.position.y = correctedPlayer.y
    // clamp player to world using position vector and velocity
    const clampedPlayer = requireClamp({ x: player.position.x, y: player.position.y }, player.velocity, state.worldWidth, state.worldHeight)
    player.position.x = clampedPlayer.nextPos.x
    player.position.y = clampedPlayer.nextPos.y
    player.velocity.x = clampedPlayer.nextVel.x
    player.velocity.y = clampedPlayer.nextVel.y

    set({ player, prey, timeMs: now })

    // detection params
    const ambientThreshold = 0.25
    const PX_PER_M = 1 / 40
    const ambientRangePx = Math.round(state.scan.ambientRangeMeters * PX_PER_M)
    // Arc-driven passive tuning: narrower arc = better accuracy and further range
    const arcDegNow = state.scan.passiveArcDegrees
    const maxArc = state.scan.passiveArcMaxDegrees
    const basePassiveError = 500
    const basePassiveRange = state.scan.passiveRangeMeters
    const passivePosErrorMeters = Math.max(100, Math.round(basePassiveError * (arcDegNow / maxArc)))
    const passiveRangeMetersEff = Math.round(basePassiveRange * (1 + 0.3 * ((maxArc - arcDegNow) / maxArc)))
    const passiveRangePx = Math.round(passiveRangeMetersEff * PX_PER_M)

    // fades expired bubbles
    const bubbles = (state.detection.revealBubbles || []).filter(b => now - b.createdAt < b.ttlMs)

    // ambient
    const ambient = computeAmbientContacts(player, [prey], {
      ambientThreshold,
      ambientRangeMeters: ambientRangePx,
      passiveArcDegrees: state.scan.passiveArcDegrees,
      passiveRangeMeters: passiveRangePx,
      passivePosErrorMeters,
      passiveRevealRadiusMeters: state.scan.passiveRevealRadiusMeters,
      activeRangeMeters: Math.round(state.scan.activeRangeMeters * PX_PER_M),
      activeRevealRadiusMeters: state.scan.activeRevealRadiusMeters,
    })

    // passive
    const passive = computePassiveReturns(player, [prey], {
      ambientThreshold,
      ambientRangeMeters: ambientRangePx,
      passiveArcDegrees: state.scan.passiveArcDegrees,
      passiveRangeMeters: passiveRangePx,
      passivePosErrorMeters,
      passiveRevealRadiusMeters: state.scan.passiveRevealRadiusMeters,
      activeRangeMeters: Math.round(state.scan.activeRangeMeters * PX_PER_M),
      activeRevealRadiusMeters: state.scan.activeRevealRadiusMeters,
    })
    // passive creates a small reveal bubble with throttle
    if (passive.length > 0) {
      const throttleMs = 1200
      if (!state.scan.lastPassiveRevealAt || now - state.scan.lastPassiveRevealAt > throttleMs) {
        // Wider arc = bigger reveal bubble cost
        const radius = (state.scan.passiveRevealRadiusMeters / 40) * (arcDegNow / maxArc)
        bubbles.push(createRevealBubble(player, radius, 800))
        set({ scan: { ...state.scan, lastPassiveRevealAt: now } })
      }
      // leave breadcrumbs at approximate positions
      const crumbs = passive.map(p => ({ x: p.approximatePosition.x, y: p.approximatePosition.y, createdAt: now, ttlMs: 8000 }))
      const det = get().detection
      const safeCrumbs = Array.isArray(det.breadcrumbs) ? det.breadcrumbs : []
      set({ detection: { ...det, breadcrumbs: [...safeCrumbs, ...crumbs].slice(-40) } })
    }

    // active ping handling: queue on keydown, consume after cooldown; NI spike visual
    const isQueued = (window as any).__pingQueued === true
    const inCooldown = state.scan.lastActivePingAt && now - state.scan.lastActivePingAt <= state.scan.activeCooldownMs
    const shouldPing = isQueued && !inCooldown
    let active = state.detection.activeContacts
    if (shouldPing) {
      active = computeActiveContacts(player, [prey], {
        ambientThreshold,
        ambientRangeMeters: ambientRangePx,
        passiveArcDegrees: state.scan.passiveArcDegrees,
        passiveRangeMeters: passiveRangePx,
        passivePosErrorMeters,
        passiveRevealRadiusMeters: state.scan.passiveRevealRadiusMeters,
        activeRangeMeters: Math.round(state.scan.activeRangeMeters * PX_PER_M),
        activeRevealRadiusMeters: state.scan.activeRevealRadiusMeters,
      })
      bubbles.push(createRevealBubble(player, state.scan.activeRevealRadiusMeters / 40, 1500))
      // NI spike when pinging (briefly)
      player.niSmooth = Math.min(1.5, player.niSmooth + 0.6)
      // prey gets notified
      const preyUpdated = { ...prey, lastPingDetectedAt: now }
      set({ detection: { ...state.detection, activeContacts: active, revealBubbles: bubbles, activeContactsExpiresAtMs: now + 1200 }, prey: preyUpdated, scan: { ...state.scan, lastActivePingAt: now } })
      ;(window as any).__pingQueued = false
    }
    // decay active contacts after ttl regardless
    {
      const expiresAt = get().detection.activeContactsExpiresAtMs
      if (expiresAt != null && now > expiresAt) {
        active = []
      }
    }

    // update detection collections
    // Handle decoys spawned by prey AI (EM-only; show as breadcrumbs and ambient-like blips)
    const spawned = (window as any).__spawnDecoy
    if (spawned) {
      const decoy = { x: spawned.x, y: spawned.y, createdAt: spawned.createdAt, ttlMs: 7000 }
      const det = get().detection
      const safeCrumbs = Array.isArray(det.breadcrumbs) ? det.breadcrumbs : []
      const safeDecoys = Array.isArray(det.decoys) ? det.decoys : []
      set({ detection: { ...det, decoys: [...safeDecoys, decoy], breadcrumbs: [...safeCrumbs, { ...decoy, isDecoy: true }].slice(-50) } })
      ;(window as any).__spawnDecoy = null
    }

    useGameState.getState().updateDetection({ ambientContacts: ambient, passiveReturns: passive, activeContacts: active, revealBubbles: bubbles })

    // win/lose conditions
    if (get().gameStatus === 'playing') {
      const timeExpired = now > get().timeStartMs + get().timeLimitMs
      const preyInEscape =
        get().prey.position.x >= get().escapeZone.x &&
        get().prey.position.x <= get().escapeZone.x + get().escapeZone.width &&
        get().prey.position.y >= get().escapeZone.y &&
        get().prey.position.y <= get().escapeZone.y + get().escapeZone.height
      // Lose if time expires and prey escaped
      if (timeExpired && preyInEscape) {
        set({ gameStatus: 'lose' })
      }
      // Win if you ping the prey while within 1.5km (representing forcing an intercept)
      const lastPing = get().scan.lastActivePingAt
      const pingRecently = lastPing && now - lastPing < 1500
      const dx = get().player.position.x - get().prey.position.x
      const dy = get().player.position.y - get().prey.position.y
      const dist = Math.hypot(dx, dy)
      if (pingRecently && dist < 100) {
        set({ gameStatus: 'win' })
      }
    } else {
      // auto reset after short delay
      const resetAt = (window as any).__resetAt || 0
      if (!resetAt) {
        ;(window as any).__resetAt = now + 2500
      } else if (now >= resetAt) {
        ;(window as any).__resetAt = 0
        resetGame()
      }
    }

    // render
    drawZones(scene.zonesGfx, get().zones)
    drawObstacles(scene.obstaclesGfx, get().obstacles)
    const gs = get()
    drawShip(scene.playerGfx, gs.player.position.x, gs.player.position.y, gs.player.headingRadians, true)
    // Only draw prey if within active reveal window or inside ambient proximity (using latest state)
    const det = gs.detection
    const preyVisible = ((det.activeContacts.length > 0) && (now < (det.activeContactsExpiresAtMs || 0))) ||
      Math.hypot(gs.player.position.x - gs.prey.position.x, gs.player.position.y - gs.prey.position.y) < (gs.scan.ambientRangeMeters / 40)
    if (preyVisible) {
      drawShip(scene.preyGfx, gs.prey.position.x, gs.prey.position.y, gs.prey.headingRadians, false)
    } else {
      scene.preyGfx.clear()
    }
    drawRadar(scene.radarGfx, get())
    updateHud(scene.hudText, get())
    drawHudBars(scene.hudBars, get())
    updateCamera(
      scene.world,
      scene.app.renderer.width,
      scene.app.renderer.height,
      gs.player.position.x,
      gs.player.position.y,
      0.55,
      get().worldWidth,
      get().worldHeight,
    )
  })

  // space key: queue a ping request; ticker consumes it when off cooldown
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      ;(window as any).__pingQueued = true
    }
  })
}

boot()
