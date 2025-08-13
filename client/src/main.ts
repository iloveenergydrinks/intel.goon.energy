import './style.css'
import { resetGame, useGameState } from './state/store'
import { clampToWorldBoundsWithVelocity as requireClamp, computeNoiseIndexRaw, resolveCollisions, resolveCollisionsWithVelocity, smoothNoise } from './systems/noise'
import { updatePreyAI } from './ai/prey'
import { computeActiveContacts, computeAmbientContacts, computePassiveReturns, createRevealBubble } from './systems/detection'
import { createScene, drawRadar, drawShip, drawZones, updateHud, drawObstacles, updateCamera, drawHudBars, updateRadarLabels } from './render/pixiApp'
import { attachControls } from './input/controls'

async function boot() {
  const mount = document.querySelector<HTMLDivElement>('#app')!
  mount.innerHTML = ''
  const scene = await createScene(mount)

  const get = useGameState.getState
  const set = useGameState.setState
  const controls = attachControls(get, set)

  // Build ship selection menu from state
  const menu = document.getElementById('menu') as HTMLDivElement | null
  const list = document.getElementById('ship-list') as HTMLDivElement | null
  // Zoom with mouse wheel on canvas
  const canvasEl = (scene.app.canvas as HTMLCanvasElement)
  if (canvasEl) {
    canvasEl.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const s = get()
        const min = s.cameraZoomMin ?? 0.4
        const max = s.cameraZoomMax ?? 1.4
        const step = 0.07
        let z = (s.cameraZoom ?? 0.55) + (e.deltaY < 0 ? step : -step)
        z = Math.max(min, Math.min(max, z))
        set({ cameraZoom: z })
      },
      { passive: false },
    )
  }
  if (menu && list) {
    list.innerHTML = ''
    const s = get()
    for (const ship of s.availableShips) {
      const btn = document.createElement('button')
      btn.textContent = `${ship.name} — SPD ${ship.maxSpeed}  NI base ${ship.baseNoise.toFixed(2)}  P ref ${Math.round(ship.passiveRangeMeters/1000)}km  A ref ${Math.round(ship.activeRangeMeters/1000)}km`
      btn.title = 'P/A are reference distances. Actual detection uses thresholds (target loudness/size, arc, and distance).'
      btn.style.cssText = 'background:#122035;color:#cfe8ff;border:1px solid #1f2a44;border-radius:6px;padding:8px 10px;text-align:left;cursor:pointer;'
      btn.onmouseenter = () => (btn.style.background = '#172844')
      btn.onmouseleave = () => (btn.style.background = '#122035')
      btn.onclick = () => {
        // Apply selection to player and scan
        const player = { ...get().player,
          classId: ship.id,
          baseNoise: ship.baseNoise,
          detectabilityBaseMeters: ship.detectabilityBaseMeters,
          maxSpeed: ship.maxSpeed,
          accel: ship.accel,
        }
        const scan = { ...get().scan,
          passiveRangeMeters: ship.passiveRangeMeters,
          activeRangeMeters: ship.activeRangeMeters,
        }
        set({ player, scan, gamePhase: 'playing', timeStartMs: performance.now() })
        menu.style.display = 'none'
      }
      list.appendChild(btn)
    }
  }

  let last = performance.now()

  scene.app.ticker.add(() => {
    const now = performance.now()
    const dtMs = now - last
    const dt = dtMs / 1000
    last = now

    const state = get()
    // If still in menu, render menu frame and skip simulation
    if (state.gamePhase === 'menu') {
      // simple idle HUD prompt; gameplay waits for selection
      updateHud(scene.hudText, { ...state, timeMs: now })
      return
    }
    // integrate player motion from controls
    controls.tick(dt)

    // compute NI, integrate movement with collision
    const player = { ...get().player }
    const prey = { ...get().prey }
    const extras = (get().extras ?? []).map(e => ({ ...e }))

    // Apply dark run suppression to player's emissions before NI calc
    const darkRun = state.scan.darkRunActive === true
    player.suppression = darkRun ? 0.45 : 0

    player.niRaw = computeNoiseIndexRaw(player, state.zones)
    prey.niRaw = computeNoiseIndexRaw(prey, state.zones)
    player.niSmooth = smoothNoise(player.niSmooth, player.niRaw, 0.15)
    prey.niSmooth = smoothNoise(prey.niSmooth, prey.niRaw, 0.12)

    // prey AI + collision
    updatePreyAI(prey, state.zones, state.obstacles, dtMs)
    // simple wander for extras
    for (const ai of extras) {
      // drift around with small heading changes
      ai.headingRadians += (Math.random() - 0.5) * 0.03
      const speed = (ai.maxSpeed ?? 180) * 0.3
      ai.velocity.x += Math.cos(ai.headingRadians) * speed * dt * 0.6
      ai.velocity.y += Math.sin(ai.headingRadians) * speed * dt * 0.6
      ai.velocity.x *= 0.96
      ai.velocity.y *= 0.96
      const next = { x: ai.position.x + ai.velocity.x * dt, y: ai.position.y + ai.velocity.y * dt }
      let col = resolveCollisionsWithVelocity(ai.position, next, ai.velocity, state.obstacles)
      col = requireClamp(col.nextPos, col.nextVel, state.worldWidth, state.worldHeight)
      ai.position = { ...col.nextPos }
      ai.velocity = { ...col.nextVel }
      // NI for extras
      ai.niRaw = computeNoiseIndexRaw(ai, state.zones)
      ai.niSmooth = smoothNoise(ai.niSmooth, ai.niRaw, 0.12)
    }
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

    set({ player, prey, extras, timeMs: now })

    // detection params (SNR model)
    const arcDegNow = state.scan.passiveArcDegrees
    const ambientBaseM = state.scan.ambientRangeMeters
    const passiveBaseM = state.scan.passiveRangeMeters
    const activeBaseM = state.scan.activeRangeMeters
    // Passive error bounds (meters). Smaller with higher SNR automatically in detection module
    const PASSIVE_MIN_ERR_M = 150
    const PASSIVE_MAX_ERR_M = 1200

    // fades expired bubbles
    const bubbles = (state.detection.revealBubbles || []).filter(b => now - b.createdAt < b.ttlMs)

    // ambient
    const ambient = computeAmbientContacts(player, [prey, ...extras], {
      ambientBaseMeters: ambientBaseM,
      passiveBaseMeters: passiveBaseM,
      activeBaseMeters: activeBaseM,
      passiveArcDegrees: arcDegNow,
      passiveArcMaxDegrees: state.scan.passiveArcMaxDegrees,
      passiveArcMinDegrees: state.scan.passiveArcMinDegrees,
      passiveMinErrorMeters: PASSIVE_MIN_ERR_M,
      passiveMaxErrorMeters: PASSIVE_MAX_ERR_M,
    }, state.obstacles)

    // passive (bearing-only)
    const passive = computePassiveReturns(player, [prey, ...extras], {
      ambientBaseMeters: ambientBaseM,
      passiveBaseMeters: passiveBaseM,
      activeBaseMeters: activeBaseM,
      passiveArcDegrees: arcDegNow,
      passiveArcMaxDegrees: state.scan.passiveArcMaxDegrees,
      passiveArcMinDegrees: state.scan.passiveArcMinDegrees,
      passiveMinErrorMeters: PASSIVE_MIN_ERR_M,
      passiveMaxErrorMeters: PASSIVE_MAX_ERR_M,
    }, state.obstacles)
    // passive no longer emits reveal bubbles nor leaves breadcrumbs (bearing-only intel)

    // active ping handling: queue on keydown, consume after cooldown; NI spike visual
    const isQueued = (window as any).__pingQueued === true
    const inCooldown = state.scan.lastActivePingAt && now - state.scan.lastActivePingAt <= state.scan.activeCooldownMs
    const shouldPing = isQueued && !inCooldown
    let active = state.detection.activeContacts
    if (shouldPing) {
      active = computeActiveContacts(player, [prey, ...extras], {
        ambientBaseMeters: ambientBaseM,
        passiveBaseMeters: passiveBaseM,
        activeBaseMeters: activeBaseM,
        passiveArcDegrees: arcDegNow,
        passiveArcMaxDegrees: state.scan.passiveArcMaxDegrees,
        passiveArcMinDegrees: state.scan.passiveArcMinDegrees,
        passiveMinErrorMeters: PASSIVE_MIN_ERR_M,
        passiveMaxErrorMeters: PASSIVE_MAX_ERR_M,
      }, state.obstacles)
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
    const preyVisible = (
      (det.activeContacts.some(c => c.id === gs.prey.id) && (now < (det.activeContactsExpiresAtMs || 0))) ||
      det.ambientContacts.some(a => a.id === gs.prey.id)
    )
    if (preyVisible) {
      drawShip(scene.preyGfx, gs.prey.position.x, gs.prey.position.y, gs.prey.headingRadians, false)
    } else {
      scene.preyGfx.clear()
    }
    drawRadar(scene.radarGfx, get())
    updateRadarLabels(scene.radarLabels, get())
    updateHud(scene.hudText, get())
    drawHudBars(scene.hudBars, get())
    updateCamera(
      scene.world,
      scene.app.renderer.width,
      scene.app.renderer.height,
      gs.player.position.x,
      gs.player.position.y,
      get().cameraZoom,
      get().worldWidth,
      get().worldHeight,
    )
  })

  // space key: queue a ping request; prevent page scroll on Space
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        ;(window as any).__pingQueued = true
      }
    },
    { capture: true, passive: false },
  )
}

boot()
