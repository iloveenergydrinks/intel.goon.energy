import { Application, Container, Graphics, Text } from 'pixi.js'
import type { EnvironmentZone, GameState, PassiveReturn, ObstacleRect } from '../state/store'

export type Scene = {
  app: Application
  stage: Container
  world: Container
  playerGfx: Graphics
  preyGfx: Graphics
  zonesGfx: Graphics
  obstaclesGfx: Graphics
  radarGfx: Graphics
  hudText: Text
  hudBars: Graphics
  radarLabels: {
    ambBase: Text
    ambEff: Text
    pasBase: Text
    pasEff: Text
    actBase: Text
    actEff: Text
  }
}

export async function createScene(canvasParent: HTMLElement, width = 1600, height = 900): Promise<Scene> {
  const app = new Application()
  await app.init({ width, height, background: '#0b1020', antialias: true })
  canvasParent.appendChild(app.canvas)

  const stage = app.stage
  const world = new Container()
  const zonesGfx = new Graphics()
  const obstaclesGfx = new Graphics()
  const playerGfx = new Graphics()
  const preyGfx = new Graphics()
  const radarGfx = new Graphics()
  const hudText = new Text('', { fill: '#bfeaff', fontFamily: 'monospace', fontSize: 14 })
  hudText.position.set(8, 8)
  const hudBars = new Graphics()
  hudBars.position.set(8, 64)
  // Ring labels (world space)
  const labelStyle = { fill: '#cfe8ff', fontFamily: 'monospace', fontSize: 11 }
  const ambBase = new Text('Amb base', labelStyle)
  const ambEff = new Text('Amb', labelStyle)
  const pasBase = new Text('Pass base', labelStyle)
  const pasEff = new Text('Pass', labelStyle)
  const actBase = new Text('Act base', labelStyle)
  const actEff = new Text('Act', labelStyle)

  stage.addChild(world)
  world.addChild(zonesGfx)
  world.addChild(obstaclesGfx)
  world.addChild(playerGfx)
  world.addChild(preyGfx)
  world.addChild(radarGfx)
  world.addChild(ambBase)
  world.addChild(ambEff)
  world.addChild(pasBase)
  world.addChild(pasEff)
  world.addChild(actBase)
  world.addChild(actEff)
  stage.addChild(hudText)
  stage.addChild(hudBars)

  return { app, stage, world, zonesGfx, obstaclesGfx, playerGfx, preyGfx, radarGfx, hudText, hudBars, radarLabels: { ambBase, ambEff, pasBase, pasEff, actBase, actEff } }
}

export function drawZones(gfx: Graphics, zones: EnvironmentZone[]) {
  gfx.clear()
  // world border (use state sizes via caller-supplied zones; fallback to defaults)
  const worldW = 3000
  const worldH = 2000
  const borderColor = 0x223344
  gfx.rect(0, 0, worldW, worldH).stroke({ color: borderColor, width: 2, alpha: 0.6 })
  for (const z of zones) {
    const color = z.type === 'shadow' ? 0x1b263b : z.type === 'thermal' ? 0x2d1f1f : 0x1f2d1f
    gfx.rect(z.x, z.y, z.width, z.height).fill({ color, alpha: 0.6 })
  }
}

export function drawObstacles(gfx: Graphics, rects: ObstacleRect[]) {
  gfx.clear()
  for (const r of rects) {
    gfx.rect(r.x, r.y, r.width, r.height).fill({ color: 0x334155, alpha: 0.9 }).stroke({ color: 0x0f172a, width: 1 })
  }
}

export function drawShip(gfx: Graphics, x: number, y: number, headingRad: number, isPlayer: boolean) {
  gfx.clear()
  // Use display-object transform instead of graphics transform stack
  gfx.position.set(x, y)
  gfx.rotation = headingRad
  // draw arrow for player, circle for prey to distinguish
  if (isPlayer) {
    gfx.poly([-12, -6, -12, 6, 10, 0])
    gfx.fill({ color: 0x79c6ff })
  } else {
    gfx.circle(0, 0, 6).fill({ color: 0xe6a16b })
  }
}

export function drawRadar(gfx: Graphics, state: GameState) {
  gfx.clear()
  const { player } = state
  // SNR visualization: draw reference rings only (base meters), not dynamic exaggerations
  const PX_PER_M = 1 / 40
  const ambBase = state.scan.ambientRangeMeters
  const pasBase = state.scan.passiveRangeMeters
  const actBase = state.scan.activeRangeMeters
  // Reference rings (teaching aids)
  gfx.circle(player.position.x, player.position.y, ambBase * PX_PER_M)
  gfx.stroke({ color: 0x5a7ea0, alpha: 0.3, width: 1 })
  gfx.circle(player.position.x, player.position.y, pasBase * PX_PER_M)
  gfx.stroke({ color: 0x2e86c1, alpha: 0.35, width: 1 })
  gfx.circle(player.position.x, player.position.y, actBase * PX_PER_M)
  gfx.stroke({ color: 0x91ff6a, alpha: 0.35, width: 1 })
  // ambient contacts as faint pips
  for (const a of state.detection.ambientContacts) {
    gfx.circle(a.approximatePosition.x, a.approximatePosition.y, 2)
    gfx.fill({ color: 0x88a, alpha: 0.5 })
  }
  // passive fuzzy blobs
  for (const p of state.detection.passiveReturns) {
    drawFuzzyBlob(gfx, p)
  }
  // Assist: draw a tiny SNR bar when a passive return exists near the centerline of the cone
  if (state.hudAssist && state.detection.passiveReturns.length > 0) {
    const midAngle = player.headingRadians
    const tipX = player.position.x + Math.cos(midAngle) * 36
    const tipY = player.position.y + Math.sin(midAngle) * 36
    // crude proxy for SNR: inverse of reported error clamped
    const best = state.detection.passiveReturns.reduce((b, r) => (r.posErrorMeters < (b?.posErrorMeters ?? 1e9) ? r : b), state.detection.passiveReturns[0])
    const err = Math.max(1, best.posErrorMeters)
    const snr01 = Math.max(0, Math.min(1, 600 / err))
    const w = 40
    const h = 4
    // background
    gfx.rect(tipX - w / 2, tipY - h / 2, w, h).fill({ color: 0x0b2a49, alpha: 0.6 })
    // foreground proportional
    gfx.rect(tipX - w / 2, tipY - h / 2, w * snr01, h).fill({ color: 0x4dc3ff, alpha: 0.9 })
  }
  // active crisp blips
  for (const c of state.detection.activeContacts) {
    gfx.circle(c.position.x, c.position.y, 3)
    gfx.fill({ color: 0xe6ff8a })
  }
  // breadcrumbs (do not mutate state here; just filter for drawing)
  const now = performance.now()
  const breadcrumbs = (state.detection.breadcrumbs ?? []).filter(b => now - b.createdAt < b.ttlMs)
  for (const b of breadcrumbs) {
    gfx.circle(b.x, b.y, 2)
    gfx.fill({ color: b.isDecoy ? 0xffc04d : 0x79c6ff, alpha: 0.5 })
  }

  // reveal bubbles
  for (const b of state.detection.revealBubbles) {
    gfx.circle(b.x, b.y, b.r)
    gfx.stroke({ color: 0xff4d4d, alpha: 0.35, width: 1 })
  }

  // escape zone
  const ez = state.escapeZone
  gfx.rect(ez.x, ez.y, ez.width, ez.height)
  gfx.stroke({ color: 0x66ff99, width: 2, alpha: 0.8 })

  // player passive arc: in simple HUD, scale wedge length by arc gain for intuitive feedback
  const maxArc = state.scan.passiveArcMaxDegrees
  const arcNow = state.scan.passiveArcDegrees
  const arcGain = Math.sqrt(maxArc / Math.max(1, arcNow))
  const arcRadius = (state.hudSimple ? pasBase * arcGain : pasBase) * PX_PER_M
  const arcDeg = state.scan.passiveArcDegrees
  const start = player.headingRadians - (arcDeg * Math.PI) / 180 / 2
  const end = player.headingRadians + (arcDeg * Math.PI) / 180 / 2
  // filled wedge
  gfx.moveTo(player.position.x, player.position.y)
  for (let t = 0; t <= 1.001; t += 0.03) {
    const ang = start + (end - start) * t
    gfx.lineTo(player.position.x + Math.cos(ang) * arcRadius, player.position.y + Math.sin(ang) * arcRadius)
  }
  gfx.closePath()
  gfx.fill({ color: 0x4da3ff, alpha: 0.12 })
  // boundary rays
  gfx.moveTo(player.position.x, player.position.y)
  gfx.lineTo(player.position.x + Math.cos(start) * arcRadius, player.position.y + Math.sin(start) * arcRadius)
  gfx.moveTo(player.position.x, player.position.y)
  gfx.lineTo(player.position.x + Math.cos(end) * arcRadius, player.position.y + Math.sin(end) * arcRadius)
  // arc outline
  gfx.moveTo(player.position.x + Math.cos(start) * arcRadius, player.position.y + Math.sin(start) * arcRadius)
  for (let t = 0; t <= 1.001; t += 0.03) {
    const ang = start + (end - start) * t
    gfx.lineTo(player.position.x + Math.cos(ang) * arcRadius, player.position.y + Math.sin(ang) * arcRadius)
  }
  gfx.stroke({ color: 0x79c6ff, alpha: 0.6, width: 2 })
}

export function updateRadarLabels(labels: { ambBase: Text; ambEff: Text; pasBase: Text; pasEff: Text; actBase: Text; actEff: Text }, state: GameState) {
  const PX_PER_M = 1 / 40
  const p = state.player.position
  const ambBaseM = state.scan.ambientRangeMeters
  const pasBaseM = state.scan.passiveRangeMeters
  const actBaseM = state.scan.activeRangeMeters
  const ambBaseR = ambBaseM * PX_PER_M
  const pasBaseR = pasBaseM * PX_PER_M
  const actBaseR = actBaseM * PX_PER_M
  const dx = 8
  labels.ambBase.position.set(p.x + ambBaseR + dx, p.y - 24)
  labels.ambBase.text = 'Ambient ref'
  labels.ambEff.position.set(p.x + ambBaseR + dx, p.y - 10)
  labels.ambEff.text = ''
  labels.pasBase.position.set(p.x + pasBaseR + dx, p.y + 4)
  labels.pasBase.text = 'Passive ref'
  labels.pasEff.position.set(p.x + pasBaseR + dx, p.y + 18)
  labels.pasEff.text = ''
  labels.actBase.position.set(p.x + actBaseR + dx, p.y + 32)
  labels.actBase.text = 'Active ref'
  labels.actEff.position.set(p.x + actBaseR + dx, p.y + 46)
  labels.actEff.text = ''
}

function drawFuzzyBlob(gfx: Graphics, p: PassiveReturn) {
  const steps = 12
  const baseR = Math.max(8, Math.min(40, p.posErrorMeters / 400))
  gfx.moveTo(p.approximatePosition.x + baseR, p.approximatePosition.y)
  for (let i = 1; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2
    const r = baseR * (0.8 + Math.random() * 0.4)
    gfx.lineTo(p.approximatePosition.x + Math.cos(theta) * r, p.approximatePosition.y + Math.sin(theta) * r)
  }
  gfx.closePath()
  gfx.fill({ color: 0x79c6ff, alpha: 0.2 })
}

export function updateHud(text: Text, state: GameState) {
  const { player, scan } = state
  const timeLeft = Math.max(0, Math.ceil((state.timeStartMs + state.timeLimitMs - state.timeMs) / 1000))
  const status = state.gameStatus.toUpperCase()
  const lines: string[] = []
  lines.push(`NI: ${player.niSmooth.toFixed(2)}  Arc: ${scan.passiveArcDegrees}°  Time: ${timeLeft}s  ${status}`)
  if (!state.hudSimple) {
    lines.push(`Reference ranges: Amb ${Math.round(scan.ambientRangeMeters/1000)}km  Pass ${Math.round(scan.passiveRangeMeters/1000)}km  Act ${Math.round(scan.activeRangeMeters/1000)}km`)
  }
  lines.push(`Ping: [Space]  Arc +/-: [Q/E]  Rotate: [A/D]  Throttle: [W/S]  HUD: [H]  Assist: [J]`)
  text.text = lines.join('\n')
}

export function drawHudBars(gfx: Graphics, state: GameState) {
  gfx.clear()
  // NI bar
  const ni = Math.min(1, state.player.niSmooth)
  gfx.rect(0, 0, 200, 10).stroke({ color: 0x0b2a49, width: 1 }).fill({ color: 0x0b2a49, alpha: 0.2 })
  gfx.rect(0, 0, 200 * ni, 10).fill({ color: 0x4dc3ff, alpha: 0.9 })
  // Ping cooldown bar
  const last = state.scan.lastActivePingAt || 0
  const elapsed = Math.max(0, state.timeMs - last)
  const pct = Math.min(1, elapsed / state.scan.activeCooldownMs)
  gfx.rect(0, 16, 200, 10).stroke({ color: 0x2a4910, width: 1 }).fill({ color: 0x2a4910, alpha: 0.2 })
  gfx.rect(0, 16, 200 * pct, 10).fill({ color: 0x91ff6a, alpha: 0.9 })
}

export function updateCamera(world: Container, viewportWidth: number, viewportHeight: number, playerX: number, playerY: number, zoom = 0.6, worldWidth = 3000, worldHeight = 2000) {
  world.scale.set(zoom, zoom)
  // clamp camera to world
  const minX = viewportWidth - worldWidth * zoom
  const minY = viewportHeight - worldHeight * zoom
  let wx = viewportWidth / 2 - playerX * zoom
  let wy = viewportHeight / 2 - playerY * zoom
  wx = Math.min(0, Math.max(minX, wx))
  wy = Math.min(0, Math.max(minY, wy))
  world.position.set(wx, wy)
}

