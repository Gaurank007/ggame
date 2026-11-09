/* Shared simulation for the browser build and the authoritative WebSocket server. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NeonKites = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Every gameplay tuning value lives here. UI-only styling values stay in index.html.
  const SETTINGS = Object.freeze({
    gameTitle: 'NEON VANGUARD',
    version: '1.0.0',
    rosterSize: 8, teamSize: 4, playerSpeed: 280, acceleration: 7, worldSize: 3200,
    arenaStartSize: 2800, arenaEndSize: 620, arenaShrinkSeconds: 300,
    suddenDeathShrinkPerSecond: 28, zoneDamagePerSecond: 12,
    bulletSpeed: 760, bulletDamage: 14, fireInterval: 0.22, bulletRange: 820,
    bulletRadius: 5, kiteRadius: 19, shipScale: 1.7, baseHealth: 100, regenDelay: 25,
    regenMaxHealthPercentPerSecond: 0.01, skillPointRegenPerSecond: 1,
    skillReadyRingRadius: 35, skillReadyRingPulseSeconds: 1.2, skillReadyIconOffset: 68,
    skillHudMaxCostMultiplier: 2, droneOrbitRadius: 28, droneOrbitSpeed: 2.4,
    dronePulseInterval: 2, dronePulseDuration: 0.7, dronePulseRadius: 56,
    droneSize: 4, respawnSeconds: 3, spawnShieldSeconds: 2,
    bulwarkRadius: 329 * 0.7, bulwarkRadiusOld: 329, bulwarkShotgunRange: 360, bulwarkShotgunConeRadians: 0.22, maxSameClassPerTeam: 2,
    aegisTickIntervalSeconds: 0.1, aegisDoublingIntervalSeconds: 1, aegisMaxDoublings: Infinity,
    aegisAimAssist: 0.5, aegisLockedAimAssist: 0.8, aegisAcquireCone: 15,
    aegisLockRange: 574, aegisLockBreakAngle: 60, aegisRelockImmunity: 0.75,
    aegisHitMargin: 3, aegisBeamWidth: 6, aegisBeamMaxWidth: 16,
    aegisBeamWidthPerDoubling: 1.5, aegisHealRange: 300, aegisHealSelfPercent: 25,
    aegisHealSelfFallbackPercent: 50, aegisHealPulseSeconds: 0.75, aegisHealParticleCount: 14,
    aegisResetOnTargetChange: true,
    energyEnabled: true, energyMax: 100, energyRegen: 45, emptyEnergyRecoveryThreshold: 10,
    energySpecterShot: 0.62, energyBulwarkShot: 0.9, energyAegisBeamPerSecond: 4,
    energyEclipseVolley: 5.5, energyDash: 0, energyRegenDelay: 0.25, emptyEnergyFireRate: 0.5,
    eclipseAutoAim: 0.5, eclipseAimCone: 30, eclipseHexLifetime: 1.5, eclipseHomingTurnRate: 2.5,
    eclipseVolleyDelaySeconds: 0.12, eclipseSkillRange: 320,
    assistWindow: 8, assistPoints: 0.25, killStreakWindow: 5,
    scoreTarget: 15, teamScoreTarget: 30, match5Seconds: 300, match10Seconds: 600,
    hillMoveSeconds: 30, hillRadius: 150, hillPointInterval: 1,
    botReactionSeconds: 0.26, botAimError: 0.16, botFireDiscipline: 0.72,
    botEasyReaction: 0.62, botEasyAimError: 0.42, botEasyDiscipline: 0.48,
    botHardReaction: 0.12, botHardAimError: 0.055, botHardDiscipline: 0.92,
    dashSpeedMultiplier: 2.8, dashDuration: 0.18, dashCooldown: 1.5,
    damageNumberSeconds: 0.8,
    killFeedSeconds: 5, particleCap: 240, hitParticles: 7, deathParticles: 30,
    screenShakeHit: 6, screenShakeKill: 12, musicBaseBpm: 88, musicMaxBpm: 148,
    musicVolume: 0.12, soundVolume: 0.26, minimapSize: 154,
    spawnSafeDistance: 440, spawnShieldAlpha: 0.45,
    worldEdgeMargin: 80, safeSpawnMargin: 260, spawnSearchAttempts: 24,
    botReactionJitterMinimum: 0.7, botReactionJitterMaximum: 1.3,
    botBorderMargin: 220, botFarTargetDistance: 420, botCloseTargetDistance: 220,
    botRetreatAmount: 0.7, botStrafeAmount: 0.75, botStrafeChangeChance: 0.18,
    botAttackRange: 680, bulletMuzzleOffset: 28, muzzleFlashSeconds: 0.065,
    particleMinimumSpeed: 50, particleSpeedRange: 260, particleMinimumLife: 0.35,
    particleLifeRange: 0.5, particleMaximumLife: 0.85, killFeedLimit: 5,
    damageNumberYOffset: 30, damageNumberRiseSpeed: 24, speedBoostMultiplier: 1.45,
    trailLifeSeconds: 0.4, trailPointLimit: 8, suddenDeathMinimumSize: 180,
    hillSpawnMargin: 420, minimumTeamSize: 2, maximumTeamSize: 4,
    minimumTargetScore: 3, maximumTargetScore: 100
  });
  const CLASSES = Object.freeze({
    specter: Object.freeze({ id: 'specter', name: 'Specter', icon: 'S', color: '#b778ff', healthMultiplier: 0.5, movementMultiplier: 1.4, attackMultiplier: 1.2, resistancePercent: 0, attackSpeedMultiplier: 1.5, weapon: 'standard', weaponDamagePercent: 2, skillCost: 12, skill: 'bind', skillDurationSeconds: 4, passiveAttackSpeedPerStack: 0.05 }),
    bulwark: Object.freeze({ id: 'bulwark', name: 'Bulwark', icon: 'B', color: '#ff9b45', healthMultiplier: 4, movementMultiplier: 0.6, attackMultiplier: 1, resistancePercent: 0, attackSpeedMultiplier: 1, weapon: 'shotgun', weaponDamagePercent: 4, pellets: 5, shotgunRange: SETTINGS.bulwarkShotgunRange, shotgunConeRadians: SETTINGS.bulwarkShotgunConeRadians, skillCost: 30, skill: 'nuclear', skillRadius: SETTINGS.bulwarkRadius, skillChargeSeconds: 4, skillSlowMultiplier: 0.2, passiveSpawnShieldLayers: 1 }),
    aegis: Object.freeze({ id: 'aegis', name: 'Aegis', icon: 'A', color: '#52f3d0', healthMultiplier: 1, movementMultiplier: 1.1, attackMultiplier: 0.7, resistancePercent: 60, attackSpeedMultiplier: 1, weapon: 'laser', laserTickIntervalSeconds: SETTINGS.aegisTickIntervalSeconds, laserBaseDamagePercent: 0.2, laserDamageDoublingPerSecond: 1, laserMaxDoublings: SETTINGS.aegisMaxDoublings, skillCost: 9, skill: 'heal', skillHealPercent: 50, passiveSkillPointRegenPerStack: 0.1 }),
    eclipse: Object.freeze({ id: 'eclipse', name: 'Eclipse', icon: 'E', color: '#ff4fd8', healthMultiplier: 1, movementMultiplier: 0.85, attackMultiplier: 0.9, resistancePercent: 20, attackSpeedMultiplier: 1, weapon: 'hex-volley', volleyProjectiles: 4, volleyDamageBase: 2, volleyDelaySeconds: SETTINGS.eclipseVolleyDelaySeconds, skillCost: 9, skill: 'nanobot-hex', skillRange: SETTINGS.eclipseSkillRange, skillTargetCount: 2, nanoDamagePercentPerSecond: 2, nanoDurationSeconds: 10, weaknessDamagePercent: 25, passiveKillInvisibilitySeconds: 3, passiveKillSpeedMultiplier: 1.15 })
  });
  const TEAM_COLORS = ['#00f0ff', '#ff3bc8'];
  const HULL_POINTS = Object.freeze({
    specter: Object.freeze([[18, 0], [4, 4], [-10, 6], [-14, 2], [-14, -2], [-10, -6], [4, -4]]),
    bulwark: Object.freeze([[16, 0], [8, 8], [-6, 10], [-14, 6], [-16, 0], [-14, -6], [-6, -10], [8, -8]]),
    aegis: Object.freeze([[14, 0], [9, 5], [2, 8], [-8, 7], [-12, 0], [-8, -7], [2, -8], [9, -5]]),
    eclipse: Object.freeze([[16, 0], [6, 6], [-4, 8], [-10, 4], [-12, 0], [-10, -4], [-4, -8], [6, -6]])
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrapAngle = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const randomPoint = (game, margin = SETTINGS.worldEdgeMargin) => {
    const h = Math.max(40, game.arenaSize / 2 - margin);
    return { x: (Math.random() * 2 - 1) * h, y: (Math.random() * 2 - 1) * h };
  };
  const enemy = (a, b, mode) => mode === 'ffa' ? a.id !== b.id : a.team !== b.team;
  const maxSP = player => (CLASSES[player.classId] || CLASSES.specter).skillCost;
  function startingSP(game, player) {
    const cls = CLASSES[player.classId] || CLASSES.specter;
    const aegisAllies = game.players.filter(q => q.id !== player.id && q.team === player.team && q.classId === 'aegis').length;
    return cls.skillCost * (0.2 + aegisAllies * 0.05);
  }
  function hullVertices(player, scale = SETTINGS.shipScale) {
    const points = HULL_POINTS[player.classId] || HULL_POINTS.specter;
    const angle = player.angle + (player.bank || 0), cos = Math.cos(angle), sin = Math.sin(angle);
    return points.map(([x, y]) => ({ x: player.x + (x * cos - y * sin) * scale, y: player.y + (x * sin + y * cos) * scale }));
  }
  function pointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const a = vertices[i], b = vertices[j];
      if ((a.y > point.y) !== (b.y > point.y) &&
          point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function segmentIntersectionParameter(start, end, a, b) {
    const rx = end.x - start.x, ry = end.y - start.y, sx = b.x - a.x, sy = b.y - a.y;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 1e-10) return null;
    const qx = a.x - start.x, qy = a.y - start.y;
    const t = (qx * sy - qy * sx) / denominator, u = (qx * ry - qy * rx) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
  }
  function projectPointToSegment(point, start, end) {
    const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1) : 0;
    const x = start.x + dx * t, y = start.y + dy * t;
    return { t, distanceSquared: (point.x - x) ** 2 + (point.y - y) ** 2 };
  }
  function segmentPolygonHit(start, end, vertices, margin = 0) {
    if (pointInPolygon(start, vertices)) return 0;
    let nearest = null;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      const intersection = segmentIntersectionParameter(start, end, a, b);
      if (intersection != null) {
        nearest = nearest == null ? intersection : Math.min(nearest, intersection);
        continue;
      }
      if (margin <= 0) continue;
      const candidates = [
        { t: 0, d2: projectPointToSegment(start, a, b).distanceSquared },
        { t: 1, d2: projectPointToSegment(end, a, b).distanceSquared },
        { t: projectPointToSegment(a, start, end).t, d2: projectPointToSegment(a, start, end).distanceSquared },
        { t: projectPointToSegment(b, start, end).t, d2: projectPointToSegment(b, start, end).distanceSquared }
      ].sort((x, y) => x.d2 - y.d2);
      if (candidates[0].d2 <= margin * margin) {
        const t = length ? Math.max(0, candidates[0].t - margin / length) : 0;
        nearest = nearest == null ? t : Math.min(nearest, t);
      }
    }
    return nearest;
  }

  function normalizeConfig(config = {}) {
    let mode = config.mode === 'teams' || config.mode === 'team' ? 'teams' : 'ffa';
    const kind = ['last-kite', 'last-team', 'koth'].includes(config.kind) ? config.kind : 'deathmatch';
    if (kind === 'last-team' || kind === 'koth') mode = 'teams';
    if (kind === 'last-kite') mode = 'ffa';
    const length = ['5', '10', 'score'].includes(String(config.length)) ? String(config.length) : '5';
    const defaultScoreTarget = mode === 'teams' ? SETTINGS.teamScoreTarget : SETTINGS.scoreTarget;
    return { mode, kind, length, difficulty: ['easy', 'normal', 'hard'].includes(config.difficulty) ? config.difficulty : 'normal',
      teamSize: clamp(Number(config.teamSize) || SETTINGS.teamSize, SETTINGS.minimumTeamSize, SETTINGS.maximumTeamSize), targetScore: clamp(Number(config.targetScore) || defaultScoreTarget, SETTINGS.minimumTargetScore, SETTINGS.maximumTargetScore),
      shipScale: clamp(Number(config.shipScale) || SETTINGS.shipScale, 1, 2.4),
      botsEnabled: config.botsEnabled !== false, energyEnabled: config.energyEnabled !== false,
      botCount: config.botCount != null && Number.isFinite(Number(config.botCount)) ? clamp(Math.floor(Number(config.botCount)), 0, SETTINGS.rosterSize - 1) : null };
  }

  function createPlayer(id, name, team, isBot, color, difficulty, classId = 'specter') {
    const cls = CLASSES[classId] || CLASSES.specter;
    return { id, name, team, isBot, color, difficulty, x: 0, y: 0, vx: 0, vy: 0, angle: 0, bank: 0,
      classId: cls.id, maxHealth: SETTINGS.baseHealth * cls.healthMultiplier, health: SETTINGS.baseHealth * cls.healthMultiplier, alive: true, respawnAt: 0, shieldUntil: 0, lastDamageAt: 0,
      lastFireAt: -99, kills: 0, deaths: 0, assists: 0, shots: 0, hits: 0,
      energy: SETTINGS.energyMax, dashReadyAt: 0, dashUntil: 0, eclipseNextVolleyAt: 0,
      muzzleUntil: 0,
      sp: 0, droneTargetId: null, dronePulseTargetId: null, dronePulseAt: -Infinity, droneNextPulseAt: SETTINGS.dronePulseInterval,
      eclipseAimTargetId: null,
      boundUntil: 0, slowUntil: 0, nanobotUntil: 0, weaknessUntil: 0, nanoSourceId: null,
      shieldLayers: 0, invisibleUntil: 0,
      damageBy: {}, streak: 0, lastKillAt: -99, regenPulseAt: -99, trail: [],
      botThinkAt: 0, botAim: 0, botMove: { x: 0, y: 0 }, botStrafe: Math.random() < 0.5 ? -1 : 1,
      overheated: false, emptyEnergyMode: false, energyCooldownAt: 0, emptyEnergyNextFireAt: 0, aegisMultiplier: 1, aegisContinuousHitTime: 0, aegisLastHitTargetId: null,
      aegisLastHitAt: null, aegisLockTargetId: null, aegisLockTargetHealth: null, aegisBeamCurve: null,
      aegisRelockImmunityUntil: {}, aegisLockBrokenTargetId: null, aegisLockBrokenAt: -Infinity };
  }

  function spawnPlayer(game, p, now = game.time) {
    let point = randomPoint(game, SETTINGS.safeSpawnMargin);
    for (let tries = 0; tries < SETTINGS.spawnSearchAttempts; tries++) {
      const candidate = randomPoint(game, SETTINGS.safeSpawnMargin);
      if (game.players.every(q => q === p || !q.alive || distance(q, candidate) > SETTINGS.spawnSafeDistance)) { point = candidate; break; }
    }
    Object.assign(p, { x: point.x, y: point.y, vx: 0, vy: 0, health: p.maxHealth,
      alive: true, respawnAt: 0, shieldUntil: now + SETTINGS.spawnShieldSeconds,
      lastDamageAt: now, damageBy: {}, energy: SETTINGS.energyMax, energyCooldownAt: now, emptyEnergyNextFireAt: now,
      sp: startingSP(game, p), trail: [], droneTargetId: null, dronePulseTargetId: null,
      overheated: false, emptyEnergyMode: false, aegisMultiplier: 1, aegisContinuousHitTime: 0, aegisLastHitTargetId: null,
      aegisLastHitAt: null, aegisLockTargetId: null, aegisLockTargetHealth: null, aegisBeamCurve: null,
      aegisRelockImmunityUntil: {}, aegisLockBrokenTargetId: null, aegisLockBrokenAt: -Infinity,
      bank: 0, eclipseAimTargetId: null });
    p.angle = Math.atan2(-point.y, -point.x);
    p.shieldLayers = p.classId === 'bulwark' ? 0 : Math.min(SETTINGS.maxSameClassPerTeam, game.players.filter(q => q !== p && q.team === p.team && q.classId === 'bulwark').length);
  }

  function createGame(config = {}, humans = [{ id: 'local', name: 'YOU', team: 0 }]) {
    const cfg = normalizeConfig(config);
    const teamMode = cfg.mode === 'teams';
    const maxRoster = teamMode ? cfg.teamSize * 2 : SETTINGS.rosterSize;
    const game = { config: cfg, time: 0, elapsed: 0, arenaSize: SETTINGS.arenaStartSize,
      players: [], bullets: [], lasers: [], particles: [], damageNumbers: [], healEffects: [], killFeed: [], volleyHits: {},
      scores: teamMode ? [0, 0] : {}, over: false, winner: null, suddenDeath: false,
      humanInputs: {}, nextHillAt: SETTINGS.hillMoveSeconds,
      hill: { x: 0, y: 0, radius: SETTINGS.hillRadius, scoreClock: 0 },
      lastKillEvent: null, lastDeathEvent: null, lastSkillFailureEvent: null, eventId: 0, timeLimit: cfg.length === '5' ? SETTINGS.match5Seconds : cfg.length === '10' ? SETTINGS.match10Seconds : 0,
      scoreLimit: cfg.length === 'score' ? cfg.targetScore : (teamMode ? SETTINGS.teamScoreTarget : SETTINGS.scoreTarget) };
    const humansById = new Map(humans.map((h, i) => [String(h.id), { ...h, id: String(h.id), team: h.team ?? (teamMode ? i % 2 : i) }]));
    const humanPlayers = [...humansById.values()].slice(0, maxRoster);
    const teamCounts = [0, 0];
    if (teamMode) {
      for (const human of humanPlayers) {
        let team = human.team === 1 ? 1 : 0;
        if (teamCounts[team] >= cfg.teamSize) team = teamCounts[0] <= teamCounts[1] ? 0 : 1;
        human.team = team;
        teamCounts[team]++;
      }
    }
    const rosterCount = cfg.botsEnabled
      ? teamMode ? maxRoster : Math.min(maxRoster, humanPlayers.length + (cfg.botCount ?? maxRoster - humanPlayers.length))
      : humanPlayers.length;
    const classCounts = new Map();
    for (let i = 0; i < rosterCount; i++) {
      const human = humanPlayers[i];
      let team = teamMode ? human?.team : i;
      if (teamMode && !human) {
        team = teamCounts[0] <= teamCounts[1] ? 0 : 1;
        teamCounts[team]++;
      }
      const id = human?.id ?? `bot-${i}`;
      const hue = [184, 309, 116, 48, 8, 260, 35, 218][i % 8];
      const used = classCounts.get(team) || {};
      const allowedClasses = Object.keys(CLASSES).filter(key => !teamMode || (used[key] || 0) < SETTINGS.maxSameClassPerTeam);
      const classId = human && CLASSES[human.classId] && (!teamMode || (used[human.classId] || 0) < 2)
        ? human.classId : (isFinite(i) ? allowedClasses[Math.floor(Math.random() * allowedClasses.length)] : 'specter');
      used[classId] = (used[classId] || 0) + 1; classCounts.set(team, used);
      const p = createPlayer(id, human?.name ?? (teamMode ? (team === 0 ? 'ALLY' : 'RIVAL') : 'BOT') + ' ' + (i + 1), team,
        !human, teamMode ? TEAM_COLORS[team] : `hsl(${hue} 100% 62%)`, cfg.difficulty, classId);
      game.players.push(p);
    }
    game.players.forEach(p => spawnPlayer(game, p, 0));
    return game;
  }

  function changePlayerClass(game, playerId, classId) {
    const player = game.players.find(p => p.id === playerId);
    if (!player || !CLASSES[classId]) return false;
    if (game.config.mode === 'teams' &&
        game.players.filter(p => p !== player && p.team === player.team && p.classId === classId).length >= SETTINGS.maxSameClassPerTeam) return false;
    const hadAegis = player.classId === 'aegis';
    player.classId = classId;
    player.maxHealth = SETTINGS.baseHealth * CLASSES[classId].healthMultiplier;
    spawnPlayer(game, player);
    const hasAegis = player.classId === 'aegis';
    if (hadAegis !== hasAegis) {
      for (const ally of game.players) {
        if (ally === player || ally.team !== player.team) continue;
        const passiveSP = CLASSES[ally.classId].skillCost * 0.05;
        ally.sp = clamp(ally.sp + (hasAegis ? passiveSP : -passiveSP), 0, maxSP(ally));
      }
    }
    const bulwarks = game.players.filter(p => p.team === player.team && p.classId === 'bulwark').length;
    for (const ally of game.players) {
      if (ally.team === player.team) ally.shieldLayers = ally.classId === 'bulwark'
        ? 0 : Math.min(SETTINGS.maxSameClassPerTeam, bulwarks);
    }
    return true;
  }

  function botInput(game, p) {
    const difficulty = p.difficulty;
    const reaction = difficulty === 'easy' ? SETTINGS.botEasyReaction : difficulty === 'hard' ? SETTINGS.botHardReaction : SETTINGS.botReactionSeconds;
    const error = difficulty === 'easy' ? SETTINGS.botEasyAimError : difficulty === 'hard' ? SETTINGS.botHardAimError : SETTINGS.botAimError;
    const discipline = difficulty === 'easy' ? SETTINGS.botEasyDiscipline : difficulty === 'hard' ? SETTINGS.botHardDiscipline : SETTINGS.botFireDiscipline;
    if (game.time >= p.botThinkAt) {
      p.botThinkAt = game.time + reaction * (SETTINGS.botReactionJitterMinimum + Math.random() * (SETTINGS.botReactionJitterMaximum - SETTINGS.botReactionJitterMinimum));
    const targets = game.players.filter(q => q.alive && enemy(p, q, game.config.mode) && q.invisibleUntil <= game.time).sort((a, b) => distance(p, a) - distance(p, b));
      const target = targets[0];
      if (target) {
        const aim = Math.atan2(target.y - p.y, target.x - p.x);
        p.botAim = aim + (Math.random() * 2 - 1) * error;
        const d = distance(p, target);
        const centerAngle = Math.atan2(-p.y, -p.x);
        const borderClose = Math.abs(p.x) > game.arenaSize / 2 - SETTINGS.botBorderMargin || Math.abs(p.y) > game.arenaSize / 2 - SETTINGS.botBorderMargin;
        const toward = borderClose ? centerAngle : aim;
        const radial = borderClose ? 1 : d > SETTINGS.botFarTargetDistance ? 1 : d < SETTINGS.botCloseTargetDistance ? -SETTINGS.botRetreatAmount : 0;
        p.botMove = { x: Math.cos(toward) * radial - Math.sin(toward) * p.botStrafe * SETTINGS.botStrafeAmount,
          y: Math.sin(toward) * radial + Math.cos(toward) * p.botStrafe * SETTINGS.botStrafeAmount };
      } else {
        p.botAim = Math.atan2(-p.y, -p.x);
        p.botMove = { x: Math.cos(p.botAim), y: Math.sin(p.botAim) };
      }
      if (Math.random() < SETTINGS.botStrafeChangeChance) p.botStrafe *= -1;
    }
    const target = game.players.filter(q => q.alive && enemy(p, q, game.config.mode) && q.invisibleUntil <= game.time).sort((a, b) => distance(p, a) - distance(p, b))[0];
    const inRange = target && distance(p, target) < SETTINGS.botAttackRange;
    const cls = CLASSES[p.classId], allies = game.players.filter(q => q.alive && q.team === p.team && q.id !== p.id);
    const skill = p.sp >= maxSP(p) && (cls.skill === 'heal'
      ? p.health < p.maxHealth || allies.some(q => q.health < q.maxHealth * .5 && distance(p, q) <= SETTINGS.aegisHealRange)
      : cls.skill === 'nuclear' ? game.players.filter(q => q.alive && enemy(p, q, game.config.mode) && distance(p, q) < cls.skillRadius).length >= 2
      : Boolean(target && distance(p, target) < (cls.skillRange || 600)));
    const canShoot = true;
    const canDash = game.time >= p.dashReadyAt;
    return { moveX: p.botMove.x, moveY: p.botMove.y, aim: p.botAim,
      shoot: Boolean(inRange && Math.random() < discipline && canShoot), dash: canDash && Math.random() < 0.2, skill };
  }

  function activateSkill(game, p) {
    const cls = CLASSES[p.classId], cost = cls.skillCost;
    if (p.sp < maxSP(p)) { game.lastSkillFailureEvent = { id: ++game.eventId, playerId: p.id, at: game.time }; return; }
    const enemies = game.players.filter(q => q.alive && enemy(p, q, game.config.mode)).sort((a, b) => distance(p, a) - distance(p, b));
    const allies = game.players.filter(q => q.alive && q.team === p.team && q.id !== p.id).sort((a, b) => distance(p, a) - distance(p, b));
    if (cls.skill === 'bind' && enemies[0] && distance(p, enemies[0]) <= SETTINGS.botAttackRange) enemies[0].boundUntil = game.time + cls.skillDurationSeconds;
    else if (cls.skill === 'heal') {
      const target = allies.find(q => distance(p, q) <= SETTINGS.aegisHealRange);
      if (target) {
        healPlayer(game, target, cls.skillHealPercent);
        healPlayer(game, p, SETTINGS.aegisHealSelfPercent);
        addFeed(game, `${p.name} healed ${target.name} and self`, '#5dff9d');
      } else {
        healPlayer(game, p, SETTINGS.aegisHealSelfFallbackPercent);
        addFeed(game, `${p.name} healed self`, '#5dff9d');
      }
    }
    else if (cls.skill === 'nanobot-hex') enemies.filter(q => distance(p, q) <= cls.skillRange).slice(0, cls.skillTargetCount).forEach(q => { q.nanobotUntil = game.time + cls.nanoDurationSeconds; q.weaknessUntil = q.nanobotUntil; q.nanoSourceId = p.id; });
    else if (cls.skill === 'nuclear') { p.nuclearAt = game.time + cls.skillChargeSeconds; p.nuclearX = p.x; p.nuclearY = p.y; game.players.filter(q => q.alive && enemy(p, q, game.config.mode) && distance(p, q) <= cls.skillRadius).forEach(q => { q.slowUntil = p.nuclearAt; }); }
    else return;
    p.sp -= cost;
    game.lastSkillEvent = { id: ++game.eventId, playerId: p.id, skill: cls.skill, at: game.time };
  }

  function clearHarmfulEffects(player) {
    player.boundUntil = 0;
    player.slowUntil = 0;
    player.nanobotUntil = 0;
    player.weaknessUntil = 0;
    player.invisibleUntil = 0;
    player.nanoSourceId = null;
    player.nuclearAt = 0;
  }
  function healPlayer(game, player, percent) {
    player.health = Math.min(player.maxHealth, player.health + player.maxHealth * percent / 100);
    player.lastDamageAt = game.time;
    clearHarmfulEffects(player);
    game.healEffects.push({ x: player.x, y: player.y, life: SETTINGS.aegisHealPulseSeconds, maxLife: SETTINGS.aegisHealPulseSeconds });
    addParticles(game, player.x, player.y, '#5dff9d', SETTINGS.aegisHealParticleCount);
  }

  function addParticles(game, x, y, color, count) {
    const room = Math.max(0, SETTINGS.particleCap - game.particles.length);
    for (let i = 0; i < Math.min(count, room); i++) {
      const a = Math.random() * Math.PI * 2, speed = SETTINGS.particleMinimumSpeed + Math.random() * SETTINGS.particleSpeedRange;
      game.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: SETTINGS.particleMinimumLife + Math.random() * SETTINGS.particleLifeRange, maxLife: SETTINGS.particleMaximumLife, color });
    }
  }
  function addFeed(game, text, color = '#fff') { game.killFeed.unshift({ text, color, at: game.time }); game.killFeed.length = Math.min(game.killFeed.length, SETTINGS.killFeedLimit); }
  function dealDamage(game, victim, amount, attacker, ignoreResistance = false, ignoreWeakness = false) {
    if (!victim.alive || game.time < victim.shieldUntil) return false;
    if (victim.shieldLayers > 0) { victim.shieldLayers--; victim.lastDamageAt = game.time; return false; }
    if (amount <= 0) { victim.lastDamageAt = game.time; return false; }
    const victimClass = CLASSES[victim.classId] || CLASSES.specter;
    if (!ignoreResistance) amount *= 1 - victimClass.resistancePercent / 100;
    if (!ignoreWeakness && attacker && attacker.id !== victim.id && victim.weaknessUntil > game.time) amount *= 1 + (CLASSES.eclipse.weaknessDamagePercent / 100);
    victim.health = Math.max(0, victim.health - amount); victim.lastDamageAt = game.time;
    if (attacker && attacker.id !== victim.id) victim.damageBy[attacker.id] = game.time;
    game.damageNumbers.push({ x: victim.x, y: victim.y - SETTINGS.damageNumberYOffset, value: Math.round(amount), color: '#fff', life: SETTINGS.damageNumberSeconds, sourceId: attacker?.id ?? null, targetId: victim.id });
    if (victim.health > 0) return false;
    victim.alive = false; victim.deaths++; victim.streak = 0; victim.nuclearAt = 0; victim.respawnAt = game.time + SETTINGS.respawnSeconds;
    game.lastDeathEvent = { id: ++game.eventId, playerId: victim.id, at: game.time };
    addParticles(game, victim.x, victim.y, victim.color, SETTINGS.deathParticles);
    if (attacker && attacker.id !== victim.id) {
      attacker.kills++; attacker.streak = game.time - attacker.lastKillAt < SETTINGS.killStreakWindow ? attacker.streak + 1 : 1; attacker.lastKillAt = game.time;
      if (attacker.classId === 'eclipse') game.players.filter(q => q.team === attacker.team && q.id !== attacker.id && q.alive).forEach(q => { q.invisibleUntil = game.time + CLASSES.eclipse.passiveKillInvisibilitySeconds; });
      if (game.config.mode === 'ffa') game.scores[attacker.id] = (game.scores[attacker.id] || 0) + 1;
      else game.scores[attacker.team]++;
      const assists = game.players.filter(p => p.id !== attacker.id && victim.damageBy[p.id] != null && game.time - victim.damageBy[p.id] <= SETTINGS.assistWindow);
      assists.forEach(p => { p.assists++; if (game.config.mode === 'ffa') game.scores[p.id] = (game.scores[p.id] || 0) + SETTINGS.assistPoints; else game.scores[p.team] += SETTINGS.assistPoints; });
      const killText = `${attacker.name} eliminated ${victim.name}`;
      addFeed(game, killText, attacker.color);
      game.lastKillEvent = { id: ++game.eventId, attacker: attacker.id, victim: victim.id, streak: attacker.streak, at: game.time };
    } else addFeed(game, `${victim.name} was lost to the zone`, victim.color);
    return true;
  }

  function resetAegisLock(p) {
    p.aegisLockTargetId = null;
    p.aegisLockTargetHealth = null;
    p.aegisBeamCurve = null;
    p.aegisLastHitTargetId = null;
    p.aegisLastHitAt = null;
    p.aegisContinuousHitTime = 0;
    p.aegisMultiplier = 1;
  }

  function aegisCurve(start, end, rawAngle, aimAssist = SETTINGS.aegisAimAssist) {
    const targetAngle = Math.atan2(end.y - start.y, end.x - start.x);
    const effectiveAngle = rawAngle + wrapAngle(targetAngle - rawAngle) * aimAssist;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const control = {
      x: start.x + Math.cos(effectiveAngle) * length * 0.5,
      y: start.y + Math.sin(effectiveAngle) * length * 0.5
    };
    const points = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, inv = 1 - t;
      points.push({
        x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
        y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y
      });
    }
    return { points, effectiveAngle };
  }

  function isAegisTargetDashing(game, target, inputs = {}) {
    const pending = inputs[target.id];
    return target.dashUntil > game.time ||
      Boolean(pending?.dash && game.time >= target.dashReadyAt && target.boundUntil <= game.time);
  }

  function traceAegisBeam(game, p, points, inputs = {}) {
    let nearest = null;
    for (let i = 0; i < points.length - 1; i++) {
      for (const q of game.players) {
        if (!q.alive || !enemy(p, q, game.config.mode) || q.invisibleUntil > game.time || q.boundUntil > game.time ||
            (p.aegisRelockImmunityUntil[q.id] || 0) > game.time ||
            (p.aegisLockBrokenAt === game.time && p.aegisLockBrokenTargetId === q.id) ||
            isAegisTargetDashing(game, q, inputs)) continue;
        const t = segmentPolygonHit(points[i], points[i + 1], hullVertices(q, game.config.shipScale), SETTINGS.aegisHitMargin);
        if (t == null) continue;
        const distanceAlong = i + t;
        if (!nearest || distanceAlong < nearest.distanceAlong) {
          nearest = {
            q, distanceAlong, segmentIndex: i, segmentT: t,
            x: points[i].x + (points[i + 1].x - points[i].x) * t,
            y: points[i].y + (points[i + 1].y - points[i].y) * t
          };
        }
      }
      if (nearest && nearest.distanceAlong < i + 1) break;
    }
    return nearest;
  }

  function validateAegisLock(game, p, inputs = {}) {
    const target = game.players.find(q => q.id === p.aegisLockTargetId);
    if (target && isAegisTargetDashing(game, target, inputs)) {
      p.aegisRelockImmunityUntil[target.id] = game.time + SETTINGS.aegisRelockImmunity;
      p.aegisLockBrokenTargetId = target.id;
      p.aegisLockBrokenAt = game.time;
      resetAegisLock(p);
      return null;
    }
    if (!target || !target.alive || target.invisibleUntil > game.time || target.boundUntil > game.time ||
        distance(p, target) > SETTINGS.aegisLockRange * 1.1 ||
        Math.abs(wrapAngle(Math.atan2(target.y - p.y, target.x - p.x) - p.angle)) >
          SETTINGS.aegisLockBreakAngle * Math.PI / 180 ||
        (p.aegisLockTargetHealth != null && target.health > p.aegisLockTargetHealth + 1e-5)) {
      if (target) {
        p.aegisLockBrokenTargetId = target.id;
        p.aegisLockBrokenAt = game.time;
      }
      resetAegisLock(p);
      return null;
    }
    p.aegisLockTargetHealth = target.health;
    return target;
  }

  function acquireAegisTarget(game, p, inputs = {}) {
    const cone = SETTINGS.aegisAcquireCone * Math.PI / 180;
    return game.players.filter(target => {
      if (!target.alive || !enemy(p, target, game.config.mode) || target.invisibleUntil > game.time ||
          target.boundUntil > game.time || isAegisTargetDashing(game, target, inputs) ||
          (p.aegisRelockImmunityUntil[target.id] || 0) > game.time ||
          (p.aegisLockBrokenAt === game.time && p.aegisLockBrokenTargetId === target.id) ||
          distance(p, target) > SETTINGS.aegisLockRange) return false;
      const angle = Math.atan2(target.y - p.y, target.x - p.x);
      return Math.abs(wrapAngle(angle - p.angle)) <= cone;
    }).sort((a, b) => distance(p, a) - distance(p, b))[0] || null;
  }

  function makeAegisCurve(p, target, aimAssist = SETTINGS.aegisAimAssist) {
    const start = { x: p.x + Math.cos(p.angle) * SETTINGS.bulletMuzzleOffset, y: p.y + Math.sin(p.angle) * SETTINGS.bulletMuzzleOffset };
    return aegisCurve(start, target, p.angle, aimAssist);
  }

  function makeShot(game, p, input, dt = 1/60, allInputs = {}) {
    if (input.shoot && p.invisibleUntil > game.time) p.invisibleUntil = 0;
    if (input.shoot) p.muzzleUntil = game.time + SETTINGS.muzzleFlashSeconds;
    const cls = CLASSES[p.classId] || CLASSES.specter;
    const specterStacks = game.players.filter(q => q.team === p.team && q.id !== p.id && q.classId === 'specter').length;
    if (!input.shoot) { 
      if(cls.weapon === 'laser') { 
        resetAegisLock(p);
      }
      return; 
    }
    let aegisTarget = null;
    if (cls.weapon === 'laser') {
      aegisTarget = validateAegisLock(game, p, allInputs);
      if (!aegisTarget) aegisTarget = acquireAegisTarget(game, p, allInputs);
      if (aegisTarget && !p.aegisLockTargetId) {
        p.aegisLockTargetId = aegisTarget.id;
        p.aegisLockTargetHealth = aegisTarget.health;
      }
      p.aegisBeamCurve = aegisTarget ? makeAegisCurve(p, aegisTarget, SETTINGS.aegisLockedAimAssist).points : null;
    }
    const fireRate = game.config.energyEnabled && p.emptyEnergyMode ? SETTINGS.emptyEnergyFireRate : 1;
    const cooldown = (cls.weapon === 'laser' ? cls.laserTickIntervalSeconds : SETTINGS.fireInterval / (cls.attackSpeedMultiplier * (1 + Math.min(SETTINGS.maxSameClassPerTeam, specterStacks) * CLASSES.specter.passiveAttackSpeedPerStack))) / fireRate;
    if (game.time - p.lastFireAt < cooldown) return;
    if (cls.weapon === 'hex-volley' && game.time < p.emptyEnergyNextFireAt) return;
    
    const a = p.angle;
    if (cls.weapon === 'laser') {
      p.lastFireAt = game.time;
      const start = { x: p.x + Math.cos(a) * SETTINGS.bulletMuzzleOffset, y: p.y + Math.sin(a) * SETTINGS.bulletMuzzleOffset };
      let trace = aegisTarget ? makeAegisCurve(p, aegisTarget, SETTINGS.aegisLockedAimAssist) : null;
      if (!aegisTarget) {
        const end = { x: p.x + Math.cos(a) * SETTINGS.bulletRange, y: p.y + Math.sin(a) * SETTINGS.bulletRange };
        const hit = traceAegisBeam(game, p, [start, end], allInputs);
        if (hit) {
          p.aegisLockTargetId = hit.q.id;
          p.aegisLockTargetHealth = hit.q.health;
          aegisTarget = hit.q;
          trace = makeAegisCurve(p, aegisTarget, SETTINGS.aegisLockedAimAssist);
        }
      }
      let hit = trace ? traceAegisBeam(game, p, trace.points, allInputs) : null;
      p.aegisBeamCurve = trace?.points ?? null;
      if (hit && hit.q.id === p.aegisLockTargetId) p.aegisLockTargetHealth = hit.q.health;
      if (hit) {
        if (SETTINGS.aegisResetOnTargetChange && p.aegisLastHitTargetId && p.aegisLastHitTargetId !== hit.q.id) {
          p.aegisContinuousHitTime = 0;
          p.aegisMultiplier = 1;
        }
        if (p.aegisLastHitAt != null) p.aegisContinuousHitTime += game.time - p.aegisLastHitAt;
        else p.aegisContinuousHitTime = cls.laserTickIntervalSeconds;
        p.aegisLastHitAt = game.time;
        p.aegisLastHitTargetId = hit.q.id;
        const doublings = Math.min(SETTINGS.aegisMaxDoublings, Math.floor(p.aegisContinuousHitTime / SETTINGS.aegisDoublingIntervalSeconds));
        p.aegisMultiplier = Math.pow(2, doublings);
        const damage = SETTINGS.baseHealth * cls.laserBaseDamagePercent / 100 * p.aegisMultiplier * cls.attackMultiplier;
        p.hits++;
        dealDamage(game, hit.q, damage, p);
      } else {
        resetAegisLock(p);
      }
      const end = hit
        ? { x: hit.x, y: hit.y }
        : { x: p.x + Math.cos(a) * SETTINGS.bulletRange, y: p.y + Math.sin(a) * SETTINGS.bulletRange };
      const beamPoints = hit && trace
        ? trace.points.slice(0, hit.segmentIndex + 1).concat([{ x: hit.x, y: hit.y }])
        : trace?.points ?? null;
      game.lasers.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, points: beamPoints,
        color: p.color, life: dt * 1.5, multiplier: p.aegisMultiplier, rawAngle: a,
        effectiveAngle: trace?.effectiveAngle ?? a, targetId: p.aegisLockTargetId,
        width: Math.min(SETTINGS.aegisBeamMaxWidth,
          SETTINGS.aegisBeamWidth + Math.log2(p.aegisMultiplier) * SETTINGS.aegisBeamWidthPerDoubling) });
      p.shots++;
      return;
    }
    if (cls.weapon === 'hex-volley') {
      if (game.time < p.eclipseNextVolleyAt) return;
      // Check if previous volley still has active hexagons
      const hasActiveVolley = game.bullets.some(b => b.hexVolley && b.owner === p.id && b.lifetime && b.lifetime > game.time);
      if (hasActiveVolley) return;
      if (game.config.energyEnabled) {
        p.energy = Math.max(0, p.energy - SETTINGS.energyEclipseVolley);
        if (p.energy <= 0) p.emptyEnergyMode = true;
      }
      p.lastFireAt = game.time;
      p.eclipseNextVolleyAt = game.time + SETTINGS.eclipseHexLifetime;
      if (game.config.energyEnabled && p.energy <= 0) p.emptyEnergyNextFireAt = game.time + SETTINGS.eclipseHexLifetime / SETTINGS.emptyEnergyFireRate;
      const volleyId = `${p.id}:${game.time}:${p.shots}`;
      if (!game.volleyHits[volleyId]) game.volleyHits[volleyId] = 0;
      for(let i = 0; i < cls.volleyProjectiles; i++) {
        const fireAt = game.time + i * cls.volleyDelaySeconds;
        let aimAngle = a;
        // Auto-aim: blend 50% toward best enemy in cone
        const cone = (SETTINGS.eclipseAimCone || 30) * Math.PI / 180;
        const candidates = game.players.filter(q => q.alive && enemy(p,q,game.config.mode) && q.invisibleUntil <= game.time && distance(p,q) <= SETTINGS.bulletRange)
        .map(q => {
          const ang = Math.atan2(q.y - p.y, q.x - p.x);
          return { q, ang, diff: Math.abs(wrapAngle(ang - aimAngle)) };
        })
        .filter(c => c.diff <= cone)
        .sort((x,y) => x.diff - y.diff);
        p.eclipseAimTargetId = candidates[0]?.q.id ?? null;
        if (candidates.length > 0) {
        const best = candidates[0];
        const blend = SETTINGS.eclipseAutoAim !== undefined ? SETTINGS.eclipseAutoAim : 0.5;
        aimAngle += wrapAngle(best.ang - aimAngle) * blend;
        }
        const targetId = candidates[0]?.q.id ?? null;
        game.bullets.push({x:p.x+Math.cos(aimAngle)*SETTINGS.bulletMuzzleOffset,y:p.y+Math.sin(aimAngle)*SETTINGS.bulletMuzzleOffset,vx:Math.cos(aimAngle)*SETTINGS.bulletSpeed,vy:Math.sin(aimAngle)*SETTINGS.bulletSpeed,angle:aimAngle,owner:p.id,team:p.team,color:cls.color,distance:0,range:SETTINGS.bulletRange,bounces:0,damage:0,fireAt,volleyId,hexVolley:true,homingTargetId:targetId,lifetime:game.time + (SETTINGS.eclipseHexLifetime || 1.5)});
        p.shots++;
      }
      return;
    }
    if (cls.weapon === 'shotgun' || cls.weapon === 'standard') {
      const energyCost = cls.weapon === 'shotgun' ? SETTINGS.energyBulwarkShot : SETTINGS.energySpecterShot;
      if (game.config.energyEnabled) {
        p.energy = Math.max(0, p.energy - energyCost);
        if (p.energy <= 0) p.emptyEnergyMode = true;
      }
      p.lastFireAt = game.time;
      const count = cls.weapon === 'shotgun' ? cls.pellets : 1;
      for (let i = 0; i < count; i++) {
        const spread = count > 1 ? ((i / (count - 1)) - .5) * cls.shotgunConeRadians : 0, angle = a + spread;
        game.bullets.push({ x: p.x + Math.cos(angle) * SETTINGS.bulletMuzzleOffset, y: p.y + Math.sin(angle) * SETTINGS.bulletMuzzleOffset,
          vx: Math.cos(angle) * SETTINGS.bulletSpeed, vy: Math.sin(angle) * SETTINGS.bulletSpeed,
          angle, owner: p.id, team: p.team, color: p.color, distance: 0, range: cls.weapon === 'shotgun' ? cls.shotgunRange : SETTINGS.bulletRange, bounces: 0,
          damage: SETTINGS.baseHealth * cls.weaponDamagePercent / 100 * cls.attackMultiplier });
        p.shots++;
      }
      return;
    }
  }

  function updateDrone(game, p) {
    if (!p.alive) { p.droneTargetId = null; return; }
    const target = game.players.filter(q => q.alive && q.id !== p.id && enemy(p, q, game.config.mode) && q.invisibleUntil <= game.time)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    p.droneTargetId = target?.id ?? null;
    if (target && game.time >= p.droneNextPulseAt) {
      p.dronePulseTargetId = target.id;
      p.dronePulseAt = game.time;
      p.droneNextPulseAt = game.time + SETTINGS.dronePulseInterval;
    }
  }

  function checkEnd(game) {
    if (game.config.kind === 'last-kite' || game.config.kind === 'last-team') {
      const living = game.players.filter(p => p.alive);
      if (game.config.kind === 'last-kite' && living.length <= 1) { game.over = true; game.winner = living[0]?.id ?? null; }
      if (game.config.kind === 'last-team' && new Set(living.map(p => p.team)).size <= 1) { game.over = true; game.winner = living[0]?.team ?? null; }
      return;
    }
    if (game.timeLimit && game.elapsed >= game.timeLimit) {
      const values = game.config.mode === 'ffa' ? game.players.map(p => game.scores[p.id] || 0) : game.scores;
      const best = Math.max(...values);
      const winners = game.config.mode === 'ffa' ? game.players.filter(p => (game.scores[p.id] || 0) === best) : values.map((v, i) => v === best ? i : -1).filter(i => i >= 0);
      game.winner = winners.length === 1 ? (game.config.mode === 'ffa' ? winners[0].id : winners[0]) : null;
      game.over = true;
    } else if (game.config.length === 'score' && (game.config.mode === 'ffa' ? game.players.some(p => (game.scores[p.id] || 0) >= game.scoreLimit) : game.scores.some(s => s >= game.scoreLimit))) {
      const values = game.config.mode === 'ffa' ? game.players.map(p => game.scores[p.id] || 0) : game.scores;
      const best = Math.max(...values); const wi = values.indexOf(best);
      game.winner = game.config.mode === 'ffa' ? game.players[wi].id : wi; game.over = true;
    }
  }

  function step(game, inputs = {}, dt = 1 / 60) {
    if (game.over) return game;
    dt = clamp(dt, 0, 0.05); game.elapsed += dt; game.time += dt;
    const shrinkDuration = game.timeLimit || SETTINGS.arenaShrinkSeconds;
    game.arenaSize = Math.max(SETTINGS.arenaEndSize, SETTINGS.arenaStartSize - (SETTINGS.arenaStartSize - SETTINGS.arenaEndSize) * Math.min(game.elapsed / shrinkDuration, 1));
    if (!game.timeLimit && game.elapsed >= SETTINGS.arenaShrinkSeconds && !game.suddenDeath && game.config.length === 'score') {
      const scores = game.config.mode === 'ffa' ? game.players.map(p => game.scores[p.id] || 0) : game.scores;
      if (Math.max(...scores) < game.scoreLimit) game.suddenDeath = true;
    }
    if (game.suddenDeath) game.arenaSize = Math.max(SETTINGS.suddenDeathMinimumSize, game.arenaSize - SETTINGS.suddenDeathShrinkPerSecond * dt);

    if (game.config.kind === 'koth' && game.time >= game.nextHillAt) {
      const pt = randomPoint(game, SETTINGS.hillSpawnMargin); game.hill.x = pt.x; game.hill.y = pt.y; game.hill.scoreClock = 0; game.nextHillAt = game.time + SETTINGS.hillMoveSeconds;
    }

    for (const p of game.players) {
      p.sp = Math.min(maxSP(p), p.sp + (SETTINGS.skillPointRegenPerSecond + game.players.filter(q => q.team === p.team && q.id !== p.id && q.classId === 'aegis').length * CLASSES.aegis.passiveSkillPointRegenPerStack) * dt);
      updateDrone(game, p);
  if (p.nuclearAt && p.alive && game.time >= p.nuclearAt) {
        for (const q of game.players) if (q.alive && enemy(p, q, game.config.mode) && Math.hypot(q.x-p.nuclearX,q.y-p.nuclearY) <= CLASSES.bulwark.skillRadius) { q.shieldUntil=0; if(q.shieldLayers>0) q.shieldLayers--; else dealDamage(game,q,q.health+1,p,true,true); }
        addFeed(game, `${p.name} detonated a nuclear blast`, p.color);
        game.lastSkillEvent = { id: ++game.eventId, playerId: p.id, skill: 'nuclear', at: game.time };
        p.nuclearAt=0;
      }
      if (p.nanobotUntil > game.time && p.alive) dealDamage(game, p, SETTINGS.baseHealth * CLASSES.eclipse.nanoDamagePercentPerSecond / 100 * dt, game.players.find(q => q.id === p.nanoSourceId) || null, false, true);
      if (!p.alive) {
        if (game.config.kind !== 'last-kite' && game.config.kind !== 'last-team' && game.time >= p.respawnAt) spawnPlayer(game, p);
        continue;
      }
      const input = p.isBot ? botInput(game, p) : (inputs[p.id] || {});
      if (input.skill && p.boundUntil <= game.time) { if (p.invisibleUntil > game.time) p.invisibleUntil = 0; activateSkill(game, p); }
      const mx = clamp(Number(input.moveX) || 0, -1, 1), my = clamp(Number(input.moveY) || 0, -1, 1);
      const norm = Math.hypot(mx, my) || 1;
      const previousAngle = p.angle;
      if (Number.isFinite(input.aim)) p.angle = input.aim;
      else if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      p.angle = wrapAngle(p.angle);
      const targetBank = clamp(wrapAngle(p.angle - previousAngle) * 2, -0.18, 0.18);
      p.bank = (p.bank || 0) + (targetBank - (p.bank || 0)) * Math.min(1, dt * 8);
      if (game.config.energyEnabled) {
        if (input.shoot) {
          p.energyCooldownAt = game.time + SETTINGS.energyRegenDelay;
          if (p.energy <= 0) p.emptyEnergyMode = true;
          if (CLASSES[p.classId].weapon === 'laser') {
            p.energy = Math.max(0, p.energy - SETTINGS.energyAegisBeamPerSecond * dt);
            if (p.energy <= 0) p.emptyEnergyMode = true;
          }
        } else if (game.time >= p.energyCooldownAt) {
          p.energy = Math.min(SETTINGS.energyMax, p.energy + SETTINGS.energyRegen * dt);
          if (p.emptyEnergyMode && p.energy >= SETTINGS.emptyEnergyRecoveryThreshold) p.emptyEnergyMode = false;
        }
      } else {
        p.energy = SETTINGS.energyMax;
        p.emptyEnergyMode = false;
      }
      if (input.dash && game.time >= p.dashReadyAt && p.boundUntil <= game.time) {
        p.dashReadyAt = game.time + SETTINGS.dashCooldown; p.dashUntil = game.time + SETTINGS.dashDuration;
        const dx = mx / norm, dy = my / norm;
        if (mx || my) {
          p.vx = dx * SETTINGS.playerSpeed * (CLASSES[p.classId]?.movementMultiplier || 1) * SETTINGS.dashSpeedMultiplier;
          p.vy = dy * SETTINGS.playerSpeed * (CLASSES[p.classId]?.movementMultiplier || 1) * SETTINGS.dashSpeedMultiplier;
        }
      }
      const cls = CLASSES[p.classId] || CLASSES.specter;
        const speed = SETTINGS.playerSpeed * cls.movementMultiplier * (p.trainingSpeedMultiplier || 1) * (p.boundUntil > game.time ? 0 : p.slowUntil > game.time ? cls.skillSlowMultiplier || .2 : 1) * (p.invisibleUntil > game.time ? CLASSES.eclipse.passiveKillSpeedMultiplier : 1);
      const accel = Math.min(1, SETTINGS.acceleration * dt);
      if (p.boundUntil > game.time) { p.vx=0; p.vy=0; }
      else if (game.time >= p.dashUntil) { p.vx += (mx / norm * (mx || my ? speed : 0) - p.vx) * accel; p.vy += (my / norm * (mx || my ? speed : 0) - p.vy) * accel; }
      p.x = clamp(p.x + p.vx * dt, -SETTINGS.worldSize / 2, SETTINGS.worldSize / 2);
      p.y = clamp(p.y + p.vy * dt, -SETTINGS.worldSize / 2, SETTINGS.worldSize / 2);
      if (game.elapsed - p.lastDamageAt >= SETTINGS.regenDelay && p.health < p.maxHealth) {
        if (p.regenPulseAt < p.lastDamageAt + SETTINGS.regenDelay) p.regenPulseAt = game.time;
        p.health = Math.min(p.maxHealth, p.health + p.maxHealth * SETTINGS.regenMaxHealthPercentPerSecond * dt);
      }
      if (Math.abs(p.x) > game.arenaSize / 2 || Math.abs(p.y) > game.arenaSize / 2) dealDamage(game, p, SETTINGS.zoneDamagePerSecond * dt, null);
      if (input.shoot && p.boundUntil <= game.time) makeShot(game, p, input, dt, inputs);
      else if (cls.weapon === 'laser') resetAegisLock(p);
      p.trail.push({ x: p.x, y: p.y, life: SETTINGS.trailLifeSeconds }); if (p.trail.length > SETTINGS.trailPointLimit) p.trail.shift();
    }

    for (const b of game.bullets) {
      if (b.fireAt != null && game.time < b.fireAt) continue;
      if (b.lifetime != null && game.time >= b.lifetime) { b.distance = SETTINGS.bulletRange + 1; continue; }
      if (b.hexVolley && b.homingTargetId) {
        const target = game.players.find(p => p.id === b.homingTargetId);
        if (target?.alive && target.invisibleUntil <= game.time) {
          const desired = Math.atan2(target.y - b.y, target.x - b.x);
          const delta = wrapAngle(desired - b.angle);
          b.angle = wrapAngle(b.angle + clamp(delta, -SETTINGS.eclipseHomingTurnRate * dt, SETTINGS.eclipseHomingTurnRate * dt));
          b.vx = Math.cos(b.angle) * SETTINGS.bulletSpeed;
          b.vy = Math.sin(b.angle) * SETTINGS.bulletSpeed;
        }
      }
      const oldX = b.x, oldY = b.y; b.x += b.vx * dt; b.y += b.vy * dt;
      b.distance += Math.hypot(b.x - oldX, b.y - oldY);
      if (b.bounces > 0 && (Math.abs(b.x) > game.arenaSize / 2 || Math.abs(b.y) > game.arenaSize / 2)) {
        if (Math.abs(b.x) > game.arenaSize / 2) { b.vx *= -1; b.x = clamp(b.x, -game.arenaSize / 2, game.arenaSize / 2); }
        if (Math.abs(b.y) > game.arenaSize / 2) { b.vy *= -1; b.y = clamp(b.y, -game.arenaSize / 2, game.arenaSize / 2); }
        b.bounces--;
      } else if (Math.abs(b.x) > game.arenaSize / 2 || Math.abs(b.y) > game.arenaSize / 2) b.distance = SETTINGS.bulletRange + 1;
      const owner = game.players.find(p => p.id === b.owner);
      if (b.distance > (b.range || SETTINGS.bulletRange)) { b.distance = SETTINGS.bulletRange + 1; continue; }
      let firstHit = null;
      for (const p of game.players) {
        if (!p.alive || (p.invisibleUntil > game.time && owner?.team !== p.team) || !enemy(owner || { id: b.owner, team: b.team }, p, game.config.mode)) continue;
        const t = segmentPolygonHit({ x: oldX, y: oldY }, { x: b.x, y: b.y }, hullVertices(p, game.config.shipScale), SETTINGS.bulletRadius);
        if (t != null && (!firstHit || t < firstHit.t)) {
          firstHit = { p, t, x: oldX + (b.x - oldX) * t, y: oldY + (b.y - oldY) * t };
        }
      }
      if (firstHit) {
        b.distance = SETTINGS.bulletRange + 1;
        if (owner) owner.hits++;
        if (b.hexVolley) {
          game.volleyHits[b.volleyId] = (game.volleyHits[b.volleyId] || 0) + 1;
          b.damage = SETTINGS.baseHealth * CLASSES.eclipse.volleyDamageBase / 100 *
            Math.pow(2, game.volleyHits[b.volleyId] - 1) * CLASSES.eclipse.attackMultiplier;
        }
        addParticles(game, firstHit.x, firstHit.y, firstHit.p.color, SETTINGS.hitParticles);
        dealDamage(game, firstHit.p, b.damage ?? SETTINGS.bulletDamage, owner);
      }
    }
    game.bullets = game.bullets.filter(b => b.distance <= SETTINGS.bulletRange && (b.lifetime == null || b.lifetime > game.time));
    for(const id of Object.keys(game.volleyHits)) if(!game.bullets.some(b=>b.volleyId===id)) delete game.volleyHits[id];
    game.lasers.forEach(l=>l.life-=dt); game.lasers=game.lasers.filter(l=>l.life>0);
    game.particles.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }); game.particles = game.particles.filter(q => q.life > 0);
    game.damageNumbers.forEach(q => { q.y -= SETTINGS.damageNumberRiseSpeed * dt; q.life -= dt; }); game.damageNumbers = game.damageNumbers.filter(q => q.life > 0);
    game.healEffects.forEach(effect => { effect.life -= dt; }); game.healEffects = game.healEffects.filter(effect => effect.life > 0);
    if (game.config.kind === 'koth') {
      const present = game.players.filter(p => p.alive && Math.hypot(p.x - game.hill.x, p.y - game.hill.y) <= game.hill.radius);
      const teams = [...new Set(present.map(p => p.team))];
      if (teams.length === 1) { game.hill.scoreClock += dt; while (game.hill.scoreClock >= SETTINGS.hillPointInterval) { game.hill.scoreClock -= SETTINGS.hillPointInterval; game.scores[teams[0]]++; } }
      if (game.scores.some(s => s >= game.scoreLimit)) { const wi = game.scores.indexOf(Math.max(...game.scores)); game.winner = wi; game.over = true; }
    }
    game.killFeed = game.killFeed.filter(k => game.time - k.at < SETTINGS.killFeedSeconds);
    if (!game.isTraining) checkEnd(game);
    return game;
  }

  function scoreboard(game) {
    return [...game.players].sort((a, b) => (game.config.mode === 'ffa' ? (game.scores[b.id] || 0) - (game.scores[a.id] || 0) : game.scores[b.team] - game.scores[a.team]) || b.kills - a.kills);
  }
  function accuracy(p) { return p.shots ? Math.round(p.hits / p.shots * 100) : 0; }
  function serialize(game, viewerId = null) {
    const snapshot = JSON.parse(JSON.stringify(game));
    for (const p of snapshot.players) {
      if (p.id !== viewerId) {
        delete p.droneTargetId;
        delete p.dronePulseTargetId;
        delete p.dronePulseAt;
        delete p.droneNextPulseAt;
      }
    }
    return snapshot;
  }
  return { SETTINGS, CLASSES, TEAM_COLORS, HULL_POINTS, clamp, wrapAngle, maxSP, hullVertices, normalizeConfig, createGame, changePlayerClass, spawnPlayer, step, scoreboard, accuracy, serialize };
});
