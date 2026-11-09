'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Game = require('./game-core.js');

test('the browser client inline script parses', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, 'expected an inline browser script');
  for (const [, source] of scripts) new vm.Script(source, { filename: 'index.html inline script' });
});

test('Aegis cannot relock a target for 0.75 seconds after it dashes', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'aegis', classId: 'aegis' },
    { id: 'target', classId: 'specter' }
  ]);
  const aegis = sim.players[0], target = sim.players[1];
  aegis.x = aegis.y = 0; target.x = 200; target.y = 0; target.shieldUntil = 0;
  Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, target.id);
  Game.step(sim, { aegis: { shoot: true, aim: 0 }, target: { dash: true, moveX: 1 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, null);
  assert.equal(aegis.aegisRelockImmunityUntil[target.id], sim.time + Game.SETTINGS.aegisRelockImmunity);
  target.dashUntil = 0;
  for (let i = 0; i < 10; i++) Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, null, 'the target remains immune until the timer expires');
  for (let i = 0; i < 6; i++) Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, target.id);
});

test('fills an offline free-for-all roster and moves/fires from input', () => {
  const sim = Game.createGame({ mode: 'ffa', length: 'score' }, [{ id: 'pilot', name: 'PILOT' }]);
  const pilot = sim.players[0], startX = pilot.x;
  for (let n = 0; n < 60; n++) Game.step(sim, { pilot: { moveX: 1, aim: 0, shoot: true } }, 1 / 60);
  assert.equal(sim.players.length, Game.SETTINGS.rosterSize);
  assert.ok(pilot.x > startX + 100);
  assert.ok(pilot.shots > 0);
  assert.ok(sim.bullets.length > 0);
  assert.ok(sim.arenaSize < Game.SETTINGS.arenaStartSize);
});

test('timed matches reach the configured minimum arena at time zero', () => {
  const sim = Game.createGame({ mode: 'ffa', length: '5' }, [{ id: 'pilot', name: 'PILOT' }]);
  sim.time = sim.elapsed = Game.SETTINGS.match5Seconds - 0.05;
  Game.step(sim, {}, 0.05);
  assert.equal(sim.arenaSize, Game.SETTINGS.arenaEndSize);
  assert.equal(sim.over, true);
});

test('last-kite mode does not respawn eliminated pilots', () => {
  const sim = Game.createGame({ mode: 'ffa', kind: 'last-kite' }, [{ id: 'pilot', name: 'PILOT' }]);
  const eliminated = sim.players[1];
  eliminated.alive = false;
  eliminated.respawnAt = 0;
  Game.step(sim, {}, 1 / 60);
  assert.equal(eliminated.alive, false);
});

test('team ruleset creates teams and awards hill points to an uncontested team', () => {
  const sim = Game.createGame({ mode: 'ffa', kind: 'koth', length: 'score' }, [{ id: 'pilot', name: 'PILOT' }]);
  assert.equal(sim.config.mode, 'teams');
  assert.equal(sim.players.length, Game.SETTINGS.teamSize * 2);
  sim.hill.x = sim.hill.y = 0;
  sim.nextHillAt = 100;
  for (const p of sim.players) {
    p.x = p.y = p.vx = p.vy = 0;
    if (p.id !== 'pilot') { p.alive = false; p.respawnAt = 100; }
  }
  for (let n = 0; n < 70; n++) Game.step(sim, {}, 1 / 60);
  assert.ok(sim.scores[0] >= 1);
  assert.equal(sim.scores[1], 0);
});

test('free-for-all shots damage enemies, award a kill, and track accuracy', () => {
  const sim = Game.createGame({ mode: 'ffa', length: 'score' }, [{ id: 'pilot', name: 'PILOT', classId: 'specter' }]);
  const shooter = sim.players[0], target = sim.players[1];
  shooter.classId = 'specter';
  target.classId = 'specter';
  sim.time = sim.elapsed = 3;
  shooter.shots = 1;
  target.isBot = false;
  target.x = 500; target.y = 500; target.vx = target.vy = 0;
  target.health = 10; target.shieldUntil = 0; target.streak = 3;
  sim.bullets.push({ x: target.x, y: target.y, vx: 0, vy: 0, owner: shooter.id, team: shooter.team, color: shooter.color, distance: 0, bounces: 0 });
  Game.step(sim, {}, 1 / 60);
  assert.equal(target.alive, false);
  assert.equal(shooter.kills, 1);
  assert.equal(sim.scores[shooter.id], 1);
  assert.equal(target.streak, 0, 'a player death resets that player\'s streak');
  assert.equal(sim.lastKillEvent.attacker, shooter.id);
  assert.equal(sim.lastDeathEvent.playerId, target.id);
  assert.equal(sim.damageNumbers.at(-1).sourceId, shooter.id);
  assert.equal(sim.damageNumbers.at(-1).targetId, target.id);
  assert.equal(Game.accuracy(shooter), 100);
});

test('team bullets pass through teammates without friendly fire', () => {
  const sim = Game.createGame({ mode: 'teams', length: 'score' }, [{ id: 'pilot', name: 'PILOT', team: 0 }]);
  const shooter = sim.players[0], teammate = sim.players[2];
  for (const player of sim.players) if (player !== shooter && player !== teammate) player.alive = false;
  sim.time = sim.elapsed = 3;
  teammate.isBot = false; teammate.x = 500; teammate.y = 500; teammate.vx = teammate.vy = 0;
  teammate.health = 10; teammate.shieldUntil = 0;
  sim.bullets.push({ x: teammate.x, y: teammate.y, vx: 0, vy: 0, owner: shooter.id, team: shooter.team, color: shooter.color, distance: 0, bounces: 0 });
  Game.step(sim, {}, 1 / 60);
  assert.equal(teammate.alive, true);
  assert.equal(teammate.health, 10);
});

test('team bots fill selected slots evenly when human pilots pick the same team', () => {
  const sim = Game.createGame({ mode: 'teams', teamSize: 2, botsEnabled: true }, [
    { id: 'one', team: 0, classId: 'specter' },
    { id: 'two', team: 0, classId: 'bulwark' }
  ]);
  assert.equal(sim.players.length, 4);
  assert.deepEqual(sim.players.reduce((counts, player) => {
    counts[player.team]++;
    return counts;
  }, [0, 0]), [2, 2]);
  assert.ok(sim.players.every(player => player.team === 0 || player.team === 1));
});

test('Specter fires 1.5 times faster while retaining the continuous-fire energy target', () => {
  assert.equal(Game.CLASSES.specter.attackSpeedMultiplier, 1.5);
  assert.ok(Math.abs(Game.SETTINGS.baseHealth * Game.CLASSES.specter.weaponDamagePercent / 100 *
    Game.CLASSES.specter.attackMultiplier - 10) < 1e-10, 'Specter bullets should deal 10 damage');
  assert.equal(Game.SETTINGS.energySpecterShot, 0.62);
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [{ id: 'pilot', classId: 'specter' }]);
  const pilot = sim.players[0];
  sim.time = 2;
  pilot.lastFireAt = sim.time;
  for (let i = 0; i < 3; i++) Game.step(sim, { pilot: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(pilot.shots, 1, 'a Specter should fire within the 1.5x cooldown');

  const endurance = Game.createGame({ mode: 'ffa', botsEnabled: false }, [{ id: 'pilot', classId: 'specter' }]);
  const specter = endurance.players[0];
  let elapsed = 0;
  while (specter.energy > 0 && elapsed < 35) {
    Game.step(endurance, { pilot: { shoot: true, aim: 0 } }, 1 / 60);
    elapsed += 1 / 60;
  }
  assert.ok(elapsed >= 22 && elapsed <= 28, `Specter energy depleted after ${elapsed.toFixed(2)} seconds`);
});

test('team bots fill the selected human team while keeping final rosters even', () => {
  const sim = Game.createGame({ mode: 'teams', teamSize: 4, botsEnabled: true }, [
    { id: 'pilot', team: 1, classId: 'specter' }
  ]);
  const ownTeam = sim.players.filter(player => player.team === 1);
  const otherTeam = sim.players.filter(player => player.team === 0);
  assert.equal(ownTeam.length, 4);
  assert.equal(otherTeam.length, 4);
  assert.equal(ownTeam.filter(player => player.isBot).length, 3);
  assert.ok(sim.players.every(player => !player.isBot || player.team === 0 || player.team === 1));
});

test('training class changes restore class health and starting skill points', () => {
  const sim = Game.createGame({ mode: 'teams', botsEnabled: false }, [
    { id: 'pilot', team: 0, classId: 'specter' },
    { id: 'ally', team: 0, classId: 'specter' },
    { id: 'enemy', team: 1, classId: 'specter' }
  ]);
  const ally = sim.players.find(player => player.id === 'ally');
  const initialAllySP = ally.sp;
  assert.equal(Game.changePlayerClass(sim, 'pilot', 'aegis'), true);
  assert.equal(ally.sp, initialAllySP + Game.CLASSES.specter.skillCost * 0.05);
  assert.equal(Game.changePlayerClass(sim, 'pilot', 'bulwark'), true);
  const pilot = sim.players[0];
  assert.equal(pilot.classId, 'bulwark');
  assert.equal(pilot.maxHealth, Game.SETTINGS.baseHealth * Game.CLASSES.bulwark.healthMultiplier);
  assert.equal(pilot.health, pilot.maxHealth);
  assert.equal(pilot.sp, Game.CLASSES.bulwark.skillCost * 0.2);
  assert.equal(ally.shieldLayers, 1, 'Bulwark shield layers apply to teammates after a training class switch');
  assert.equal(Game.changePlayerClass(sim, 'missing', 'aegis'), false);
  assert.equal(Game.changePlayerClass(sim, 'pilot', 'unknown'), false);
});

test('dash has an exact 1.5 second elapsed-time cooldown and no energy gate', () => {
  const sim = Game.createGame({ mode: 'ffa', length: 'score' }, [{ id: 'pilot', name: 'PILOT' }]);
  const pilot = sim.players[0];
  pilot.energy = 0;
  Game.step(sim, { pilot: { moveX: 1, dash: true } }, 1 / 60);
  assert.equal(Game.SETTINGS.dashCooldown, 1.5);
  assert.ok(Math.abs(pilot.dashReadyAt - sim.time - 1.5) < 1e-9);
  assert.ok(Math.abs(pilot.dashUntil - sim.time - Game.SETTINGS.dashDuration) < 1e-9);
  assert.equal(pilot.vx, Game.SETTINGS.playerSpeed * Game.CLASSES[pilot.classId].movementMultiplier * Game.SETTINGS.dashSpeedMultiplier);
  const readyAt = pilot.dashReadyAt;
  Game.step(sim, { pilot: { moveX: 1, dash: true } }, 0.5);
  assert.equal(pilot.dashReadyAt, readyAt, 'dash input before cooldown expiry must not restart the timer');
});

test('skill points reset to the class starting amount on respawn and signal insufficient points', () => {
  const sim = Game.createGame({ mode: 'ffa', length: 'score' }, [{ id: 'pilot', name: 'PILOT' }]);
  const pilot = sim.players[0];
  pilot.sp = 1000;
  pilot.alive = false;
  pilot.respawnAt = 0;
  for (const p of sim.players) if (p !== pilot) { p.alive = false; p.respawnAt = 1000; }
  Game.step(sim, {}, 0.05);
  assert.equal(pilot.alive, true);
  assert.equal(pilot.sp, Game.CLASSES[pilot.classId].skillCost * 0.2, 'SP resets to 20% of the class skill cost');
  assert.equal(Game.normalizeConfig({ botsEnabled: false }).botsEnabled, false);
  pilot.sp = 0;
  Game.step(sim, { pilot: { skill: true } }, 0.05);
  assert.equal(sim.lastSkillFailureEvent.playerId, 'pilot');
});

test('class skill costs define the SP cap and initial SP, including Aegis team bonuses', () => {
  const expectedCosts = { specter: 15, bulwark: 30, aegis: 15, eclipse: 20 };
  for (const [classId, skillCost] of Object.entries(expectedCosts)) {
    const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [{ id: classId, classId }]);
    assert.equal(Game.maxSP(sim.players[0]), skillCost);
    assert.equal(sim.players[0].sp, skillCost * 0.2);
  }
  const team = Game.createGame({ mode: 'teams', botsEnabled: false }, [
    { id: 'aegis', team: 0, classId: 'aegis' },
    { id: 'specter', team: 0, classId: 'specter' },
    { id: 'bulwark', team: 0, classId: 'bulwark' },
    { id: 'other-aegis', team: 0, classId: 'aegis' },
    { id: 'enemy', team: 1, classId: 'specter' }
  ]);
  assert.ok(Math.abs(team.players.find(p => p.id === 'aegis').sp - 15 * 0.25) < 1e-10);
  assert.ok(Math.abs(team.players.find(p => p.id === 'specter').sp - 15 * 0.3) < 1e-10);
  assert.ok(Math.abs(team.players.find(p => p.id === 'bulwark').sp - 30 * 0.3) < 1e-10);
  assert.ok(Math.abs(team.players.find(p => p.id === 'enemy').sp - 15 * 0.2) < 1e-10);
});

test('continuous fire runs each class near 25 seconds and energy refills after firing stops', () => {
  const classes = ['specter', 'bulwark', 'aegis', 'eclipse'];
  for (const classId of classes) {
    const sim = Game.createGame({ mode: 'ffa', length: 'score', botsEnabled: false }, [{ id: 'pilot', classId }]);
    const pilot = sim.players[0];
    let elapsed = 0;
    while (pilot.energy > 0 && elapsed < 35) {
      Game.step(sim, { pilot: { shoot: true, aim: 0 } }, 1 / 60);
      elapsed += 1 / 60;
    }
    assert.ok(elapsed >= 22 && elapsed <= 28, `${classId} depleted after ${elapsed.toFixed(2)} seconds`);
    const depletedAt = elapsed;
    while (pilot.energy < Game.SETTINGS.energyMax && elapsed - depletedAt < 3) {
      Game.step(sim, { pilot: { shoot: false } }, 1 / 60);
      elapsed += 1 / 60;
    }
    assert.ok(elapsed - depletedAt <= SETTINGS_REFILL_MAX_SECONDS, `${classId} refill took ${(elapsed - depletedAt).toFixed(2)} seconds`);
  }
});

const SETTINGS_REFILL_MAX_SECONDS = 2.6;

test('empty energy halves fire rate without blocking shots, dash, or energy-disabled combat', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [{ id: 'pilot', classId: 'specter' }]);
  const pilot = sim.players[0];
  pilot.energy = 0;
  sim.time = sim.elapsed = 1;
  pilot.lastFireAt = sim.time - 1;
  Game.step(sim, { pilot: { shoot: true, dash: true, moveX: 1 } }, 1 / 60);
  assert.equal(pilot.shots, 1);
  assert.ok(pilot.dashUntil > sim.time);
  const firstFireAt = pilot.lastFireAt;
  while (pilot.shots === 1) Game.step(sim, { pilot: { shoot: true } }, 1 / 60);
  assert.ok(pilot.lastFireAt - firstFireAt >= 0.28, 'empty energy halves the faster Specter fire rate');

  const unlimited = Game.createGame({ mode: 'ffa', botsEnabled: false, energyEnabled: false }, [{ id: 'pilot', classId: 'bulwark' }]);
  const unlimitedPilot = unlimited.players[0];
  unlimitedPilot.energy = 0;
  Game.step(unlimited, { pilot: { shoot: true, aim: 0 } }, 1 / 60);
  assert.equal(unlimitedPilot.shots, Game.CLASSES.bulwark.pellets);
  assert.equal(unlimitedPilot.energy, Game.SETTINGS.energyMax);
});

test('single-player controls set bot filling and target score, and class stats affect health and movement', () => {
  const solo = Game.createGame({ mode: 'ffa', length: 'score', botsEnabled: false, targetScore: 42 }, [{ id: 'pilot', name: 'PILOT' }]);
  assert.equal(solo.players.length, 1);
  assert.equal(solo.scoreLimit, 42);
  const bulwarkGame = Game.createGame({ mode: 'ffa', botsEnabled: false }, [{ id: 'tank', classId: 'bulwark' }]);
  const bulwark = bulwarkGame.players[0];
  assert.equal(bulwark.maxHealth, Game.SETTINGS.baseHealth * 4);
  const start = bulwark.x;
  Game.step(bulwarkGame, { tank: { moveX: 1 } }, 0.05);
  assert.equal(bulwark.classId, 'bulwark');
  assert.ok(bulwark.x > start);
});

test('class weapons use their class-specific shot patterns and damage rules', () => {
  const shotgunGame = Game.createGame({ mode: 'ffa', botsEnabled: false }, [{ id: 'tank', classId: 'bulwark' }]);
  Game.step(shotgunGame, { tank: { shoot: true, aim: 0 } }, 1 / 60);
  assert.equal(shotgunGame.players[0].shots, Game.CLASSES.bulwark.pellets);
  assert.equal(shotgunGame.bullets.length, Game.CLASSES.bulwark.pellets);

  const laserGame = Game.createGame({ mode: 'ffa', botsEnabled: false }, [{ id: 'medic', classId: 'aegis' }, { id: 'target', classId: 'specter' }]);
  const laser = laserGame.players[0], target = laserGame.players[1];
  laser.angle = 0; laser.x = laser.y = 0; target.x = 120; target.y = 0; target.shieldUntil = 0;
  const before = target.health;
  Game.step(laserGame, { medic: { shoot: true, aim: 0 } }, 1 / 60);
  assert.ok(target.health < before);
  assert.equal(laserGame.lasers.length, 1);
});

test('a Specter-bound target cannot shoot, dash, or activate skills', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'bound', classId: 'specter' },
    { id: 'enemy', classId: 'bulwark' }
  ]);
  const bound = sim.players[0], enemy = sim.players[1];
  bound.x = bound.y = 0; bound.boundUntil = 2; bound.sp = Game.maxSP(bound);
  enemy.x = 100; enemy.y = 0; enemy.shieldUntil = 0;
  Game.step(sim, { bound: { shoot: true, dash: true, skill: true, moveX: 1, aim: 0 } }, 0.05);
  assert.equal(bound.shots, 0);
  assert.equal(bound.dashUntil, 0);
  assert.equal(bound.sp, Game.maxSP(bound));
  assert.equal(sim.lastSkillEvent, undefined);
});

test('Eclipse weakness uses attacker-specific multipliers and burn bypasses resistance', () => {
  const weapon = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'source', classId: 'eclipse' },
    { id: 'victim', classId: 'eclipse' }
  ]);
  const source = weapon.players[0], victim = weapon.players[1];
  source.x = 0; source.y = 0;
  victim.x = 70; victim.y = 0; victim.angle = victim.bank = 0;
  victim.shieldUntil = 0; victim.weaknessUntil = 10;
  weapon.bullets.push({ x: 28, y: 0, vx: 760, vy: 0, owner: source.id, team: source.team,
    color: source.color, distance: 0, range: 820, bounces: 0, damage: 0,
    hexVolley: true, volleyId: 'weakness', lifetime: 10 });
  Game.step(weapon, {}, 0.05);
  assert.ok(Math.abs(victim.health - (victim.maxHealth - 1.8)) < 1e-8);

  const dot = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'source', classId: 'eclipse' },
    { id: 'victim', classId: 'eclipse' }
  ]);
  const dotVictim = dot.players[1];
  dotVictim.health = 90; dotVictim.shieldUntil = 0; dotVictim.nanobotUntil = 10; dotVictim.weaknessUntil = 10; dotVictim.nanoSourceId = 'source';
  Game.step(dot, {}, 0.05);
  assert.ok(Math.abs(dotVictim.health - 89.9) < 1e-8, 'burn bypasses resistance and weakness multipliers');
});

test('Eclipse skill marks up to two nearby enemies for four seconds and refuses empty casts', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'eclipse', classId: 'eclipse' },
    { id: 'near-one', classId: 'specter' },
    { id: 'near-two', classId: 'bulwark' },
    { id: 'far', classId: 'aegis' }
  ]);
  const caster = sim.players[0];
  caster.x = caster.y = 0; caster.sp = Game.maxSP(caster);
  sim.players[1].x = 100; sim.players[1].y = 0;
  sim.players[2].x = 0; sim.players[2].y = 200;
  sim.players[3].x = 500; sim.players[3].y = 0;
  for (const target of sim.players.slice(1)) target.shieldUntil = 0;
  Game.step(sim, { eclipse: { skill: true } }, 0.01);
  for (const target of sim.players.slice(1, 3)) {
    assert.ok(Math.abs(target.nanobotUntil - (sim.time + 4)) < 1e-9);
    assert.ok(Math.abs(target.weaknessUntil - (sim.time + 4)) < 1e-9);
  }
  assert.equal(sim.players[3].weaknessUntil, 0);
  assert.equal(caster.sp, 0);

  const empty = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'eclipse', classId: 'eclipse' }, { id: 'far', classId: 'specter' }
  ]);
  const alone = empty.players[0]; alone.x = alone.y = 0; alone.sp = Game.maxSP(alone);
  empty.players[1].x = 1000; empty.players[1].y = 0;
  Game.step(empty, { eclipse: { skill: true } }, 0.01);
  assert.equal(alone.sp, Game.maxSP(alone));
  assert.equal(empty.lastSkillFailureEvent.reason, 'no-targets');
});

test('Specter binds every visible or invisible enemy in range without charging an empty cast', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'specter', classId: 'specter' }, { id: 'first', classId: 'bulwark' },
    { id: 'hidden', classId: 'eclipse' }, { id: 'edge', classId: 'aegis' },
    { id: 'far', classId: 'aegis' }
  ]);
  const caster = sim.players[0];
  caster.x = caster.y = 0; caster.sp = Game.maxSP(caster);
  sim.players[1].x = 100; sim.players[1].y = 0;
  sim.players[2].x = 200; sim.players[2].y = 0; sim.players[2].invisibleUntil = 10;
  sim.players[3].x = Game.SETTINGS.specterBindRange; sim.players[3].y = 0;
  sim.players[4].x = Game.SETTINGS.specterBindRange + 1; sim.players[4].y = 0;
  Game.step(sim, { specter: { skill: true } }, 0.01);
  assert.ok(sim.players[1].boundUntil > sim.time);
  assert.ok(sim.players[2].boundUntil > sim.time);
  assert.ok(sim.players[3].boundUntil > sim.time, 'the exact 420-unit radius is included');
  assert.equal(sim.players[4].boundUntil, 0);
  assert.equal(caster.sp, 0);

  caster.sp = Game.maxSP(caster);
  sim.players.slice(1).forEach(target => { target.x = 1000; target.boundUntil = 0; });
  Game.step(sim, { specter: { skill: true } }, 0.01);
  assert.equal(caster.sp, Game.maxSP(caster));
  assert.equal(sim.lastSkillFailureEvent.reason, 'no-targets');
});

test('team mode uses one color per side while free-for-all honors the selected palette color', () => {
  const selectedColor = Game.SHIP_COLORS[5].value;
  const freeForAll = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'pilot', classId: 'specter', color: selectedColor }
  ]);
  assert.equal(freeForAll.players[0].color, selectedColor);
  const teams = Game.createGame({ mode: 'teams', botsEnabled: false }, [
    { id: 'cyan-one', team: 0, color: selectedColor },
    { id: 'cyan-two', team: 0, color: Game.SHIP_COLORS[1].value },
    { id: 'magenta', team: 1, color: selectedColor }
  ]);
  assert.ok(teams.players.filter(player => player.team === 0).every(player => player.color === Game.TEAM_COLORS[0]));
  assert.ok(teams.players.filter(player => player.team === 1).every(player => player.color === Game.TEAM_COLORS[1]));
  assert.notEqual(Game.TEAM_COLORS[0], Game.TEAM_COLORS[1]);
});

test('Eclipse burn consumes one shield layer per tick and resets regeneration delay', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'source', classId: 'eclipse' }, { id: 'target', classId: 'eclipse' }
  ]);
  const target = sim.players[1];
  target.health = 90; target.shieldUntil = 0; target.shieldLayers = 1;
  target.nanobotUntil = 4; target.weaknessUntil = 4; target.nanoSourceId = 'source';
  Game.step(sim, {}, 0.05);
  assert.equal(target.shieldLayers, 0);
  assert.equal(target.health, 90);
  assert.equal(target.lastDamageAt, sim.time);
  Game.step(sim, {}, 0.05);
  assert.ok(Math.abs(target.health - 89.9) < 1e-8);
  assert.equal(target.lastDamageAt, sim.time);
});

test('Bulwark nuke charge uses the three-second tuning and broadcasts its detonation phase', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'bulwark', classId: 'bulwark' }, { id: 'target', classId: 'specter' }
  ]);
  const source = sim.players[0], target = sim.players[1];
  source.x = source.y = 0; source.sp = Game.maxSP(source);
  target.x = 100; target.y = 0; target.shieldUntil = 0;
  Game.step(sim, { bulwark: { skill: true } }, 0.05);
  assert.equal(source.nuclearAt, sim.time + 3);
  assert.equal(sim.lastSkillEvent.phase, 'charge');
  while (source.alive && sim.time < source.nuclearAt) Game.step(sim, {}, 0.05);
  assert.equal(sim.lastSkillEvent.phase, 'detonate');
});

test('weapon damage, class-specific weakness, Bulwark charge and resistance tuning match the new rules', () => {
  assert.equal(Game.SETTINGS.bulwarkChargeTime, 3);
  assert.equal(Game.SETTINGS.bulwarkPellets, 6);
  assert.deepEqual({ ...Game.SETTINGS.weaknessMultipliers }, { aegis: 2, bulwark: 1.25, specter: 1.25, eclipse: 1.25 });
  assert.equal(Game.CLASSES.aegis.resistancePercent, 20);
  assert.equal(Game.CLASSES.aegis.laserBaseDamagePercent, 1);
  assert.ok(Math.abs(Game.SETTINGS.baseHealth * Game.CLASSES.specter.weaponDamagePercent / 100 *
    Game.CLASSES.specter.attackMultiplier - 10) < 1e-10);
  assert.equal(Game.CLASSES.bulwark.weaponDamagePercent, 6);
  assert.equal(Game.CLASSES.bulwark.pellets, 6);
});

test('Specter, Bulwark and Aegis weapon attacks use the requested percent damage', () => {
  const specterGame = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'specter', classId: 'specter' }, { id: 'target', classId: 'eclipse' }
  ]);
  const specter = specterGame.players[0];
  Game.step(specterGame, { specter: { shoot: true, aim: 0 } }, 0.05);
  assert.ok(Math.abs(specterGame.bullets[0].damage - 10) < 1e-10);

  const bulwarkGame = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'bulwark', classId: 'bulwark' }, { id: 'target', classId: 'eclipse' }
  ]);
  const bulwark = bulwarkGame.players[0];
  Game.step(bulwarkGame, { bulwark: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(bulwark.shots, 6);
  assert.ok(bulwarkGame.bullets.every(bullet => bullet.damage === 6));

  const aegisGame = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'aegis', classId: 'aegis' }, { id: 'target', classId: 'specter' }
  ]);
  const aegis = aegisGame.players[0], target = aegisGame.players[1];
  aegis.x = aegis.y = 0; target.x = 120; target.y = 0; target.shieldUntil = 0;
  Game.step(aegisGame, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.ok(Math.abs(target.health - (target.maxHealth - 0.7)) < 1e-8);
});

test('Aegis pre-locks enemies in its acquisition cone before the first beam tick', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'aegis', classId: 'aegis' },
    { id: 'target', classId: 'specter' }
  ]);
  const aegis = sim.players[0], target = sim.players[1];
  aegis.x = aegis.y = 0; aegis.angle = 0;
  target.x = 200 * Math.cos(10 * Math.PI / 180);
  target.y = 200 * Math.sin(10 * Math.PI / 180);
  target.shieldUntil = 0;
  sim.time = 1;
  aegis.lastFireAt = sim.time;
  const health = target.health;
  Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, target.id);
  assert.equal(target.health, health, 'lock acquisition should precede the first 0.1-second damage tick');
  assert.equal(Game.SETTINGS.aegisLockRange, Math.round(Game.SETTINGS.bulletRange * 0.7));
  assert.equal(Game.SETTINGS.aegisLockedAimAssist, 0.8);
  assert.equal(Game.SETTINGS.aegisLockBreakAngle, 60);
});

test('Aegis beam width grows with damage doublings and remains capped', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false, energyEnabled: false }, [
    { id: 'aegis', classId: 'aegis' },
    { id: 'target', classId: 'bulwark' }
  ]);
  const aegis = sim.players[0], target = sim.players[1];
  aegis.x = aegis.y = 0; target.x = 200; target.y = 0; target.shieldUntil = 0;
  let widest = 0;
  for (let i = 0; i < 24; i++) {
    Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
    widest = Math.max(widest, ...sim.lasers.map(beam => beam.width));
  }
  assert.ok(widest > Game.SETTINGS.aegisBeamWidth);
  assert.ok(widest <= Game.SETTINGS.aegisBeamMaxWidth);
});

test('polygon hull collision rejects circular-hull false positives and sweeps fast projectiles', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'shooter', classId: 'specter' },
    { id: 'target', classId: 'specter' }
  ]);
  const shooter = sim.players[0], target = sim.players[1];
  shooter.x = 0; shooter.y = 500;
  target.x = 100; target.y = 0; target.angle = 0; target.shieldUntil = 0;
  const health = target.health;
  sim.bullets.push({
    x: target.x, y: target.y + 17, vx: 0, vy: 0, owner: shooter.id, team: shooter.team,
    color: shooter.color, distance: 0, range: 300, bounces: 0, damage: 20
  });
  Game.step(sim, {}, 0.05);
  assert.equal(target.health, health, 'a shot outside the narrow hull must not hit just because it is inside the old radius');
  assert.equal(sim.bullets.length, 1);

  const bullet = sim.bullets[0];
  bullet.x = 80; bullet.y = target.y; bullet.vx = 760; bullet.vy = 0;
  Game.step(sim, {}, 0.05);
  assert.equal(target.health, health - 20, 'a fast projectile crossing the polygon must hit continuously');
  assert.equal(shooter.hits, 1);
});

test('Aegis laser acquires only when its path intersects the polygon hull', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'aegis', classId: 'aegis' },
    { id: 'target', classId: 'specter' }
  ]);
  const aegis = sim.players[0], target = sim.players[1];
  aegis.x = 0; aegis.y = 20;
  target.x = 150; target.y = 120; target.angle = target.bank = 0; target.shieldUntil = 0;
  Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, null, 'the beam must miss outside the target polygon');

  aegis.y = 0; target.y = 0;
  aegis.lastFireAt = sim.time - 1;
  Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, target.id);
});

test('ship hull polygons are class-specific, scaled, and rotated with the visible ship', () => {
  assert.deepEqual(Object.keys(Game.HULL_POINTS).sort(), ['aegis', 'bulwark', 'eclipse', 'specter']);
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false, shipScale: 2.2 }, [{ id: 'pilot', classId: 'specter' }]);
  const ship = sim.players[0];
  ship.x = 10; ship.y = 20; ship.angle = 0; ship.bank = 0;
  assert.equal(sim.config.shipScale, 2.2);
  const standard = Game.hullVertices(ship, 1);
  const enlarged = Game.hullVertices(ship, sim.config.shipScale);
  assert.equal(standard[0].x, 28);
  assert.equal(enlarged[0].x, 10 + 18 * 2.2);
  ship.angle = Math.PI / 2;
  const turned = Game.hullVertices(ship, 1);
  assert.ok(Math.abs(turned[0].x - 10) < 1e-10);
  assert.ok(Math.abs(turned[0].y - 38) < 1e-10);
});

test('natural regeneration waits 25 seconds and heals one percent per second for every class', () => {
  for (const classId of Object.keys(Game.CLASSES)) {
    const sim = Game.createGame({ mode: 'ffa', length: 'score', botsEnabled: false }, [{ id: 'pilot', classId }]);
    const pilot = sim.players[0], startingHealth = pilot.maxHealth * 0.5;
    pilot.health = startingHealth;
    pilot.lastDamageAt = 0;
    sim.elapsed = sim.time = Game.SETTINGS.regenDelay - 0.05;
    Game.step(sim, {}, 0.05);
    for (let n = 0; n < 19; n++) Game.step(sim, {}, 0.05);
    assert.ok(Math.abs(pilot.health - (startingHealth + pilot.maxHealth * 0.01)) < 1e-7, `${classId} regenerates 1% of max health per second`);
  }
});

test('Aegis heal restores the nearest in-range ally and self, clears harmful effects, and spends SP', () => {
  const sim = Game.createGame({ mode: 'teams', botsEnabled: false }, [
    { id: 'aegis', name: 'AEGIS', team: 0, classId: 'aegis' },
    { id: 'ally', name: 'ALLY', team: 0, classId: 'specter' },
    { id: 'enemy', name: 'ENEMY', team: 1, classId: 'eclipse' }
  ]);
  const aegis = sim.players.find(player => player.id === 'aegis');
  const ally = sim.players.find(player => player.id === 'ally');
  aegis.x = aegis.y = 0; aegis.health = 40; aegis.sp = Game.maxSP(aegis);
  ally.x = 100; ally.y = 0; ally.health = 10;
  for (const player of [aegis, ally]) Object.assign(player, {
    boundUntil: 20, slowUntil: 20, nanobotUntil: 20, weaknessUntil: 20,
    invisibleUntil: 20, nanoSourceId: 'enemy', nuclearAt: 20
  });
  aegis.boundUntil = 0;
  Game.step(sim, { aegis: { skill: true } }, 0.05);
  assert.equal(ally.health, 35);
  assert.equal(aegis.health, 65);
  assert.equal(aegis.sp, 0);
  for (const player of [aegis, ally]) {
    assert.equal(player.boundUntil, 0);
    assert.equal(player.slowUntil, 0);
    assert.equal(player.nanobotUntil, 0);
    assert.equal(player.weaknessUntil, 0);
    assert.equal(player.invisibleUntil, 0);
    assert.equal(player.nanoSourceId, null);
    assert.equal(player.nuclearAt, 0);
  }
  assert.equal(sim.healEffects.length, 2);
  assert.ok(sim.particles.filter(particle => particle.color === '#5dff9d').length >= 2);
  assert.match(sim.killFeed[0].text, /healed ALLY and self/);
});

test('Aegis heals only itself when no ally is in range and never exceeds maximum health', () => {
  const sim = Game.createGame({ mode: 'teams', botsEnabled: false }, [
    { id: 'aegis', name: 'AEGIS', team: 0, classId: 'aegis' },
    { id: 'ally', name: 'ALLY', team: 0, classId: 'specter' },
    { id: 'enemy', name: 'ENEMY', team: 1, classId: 'eclipse' }
  ]);
  const aegis = sim.players.find(player => player.id === 'aegis');
  const ally = sim.players.find(player => player.id === 'ally');
  aegis.x = aegis.y = 0; aegis.health = 90; aegis.sp = Game.maxSP(aegis);
  ally.x = Game.SETTINGS.aegisHealRange + 100; ally.y = 0; ally.health = 30;
  Game.step(sim, { aegis: { skill: true } }, 0.05);
  assert.equal(aegis.health, aegis.maxHealth);
  assert.equal(ally.health, 30);
  assert.equal(aegis.sp, 0);
  assert.match(sim.killFeed[0].text, /healed self/);
});

test('Aegis bots heal injured allies and themselves when skill points are full', () => {
  const sim = Game.createGame({ mode: 'teams', botsEnabled: false }, [
    { id: 'human', team: 0, classId: 'specter' },
    { id: 'medic', team: 0, classId: 'aegis' },
    { id: 'enemy', team: 1, classId: 'eclipse' }
  ]);
  const medic = sim.players.find(player => player.id === 'medic');
  const ally = sim.players.find(player => player.id === 'human');
  medic.isBot = true; medic.botThinkAt = 0; medic.sp = Game.maxSP(medic); medic.health = medic.maxHealth * 0.6;
  ally.x = 100; ally.y = 0; ally.health = ally.maxHealth * 0.4;
  medic.x = medic.y = 0;
  Game.step(sim, {}, 0.05);
  assert.equal(ally.health, ally.maxHealth * 0.9, 'the bot heals a low-health teammate');
  assert.equal(medic.health, medic.maxHealth * 0.85, 'the bot also heals itself by the team-use amount');
  assert.equal(sim.lastSkillEvent.playerId, medic.id);
});

test('drones lock nearest enemies, pulse periodically, and serialize target data only to their owner', () => {
  const sim = Game.createGame({ mode: 'ffa', length: 'score' }, [{ id: 'pilot', name: 'PILOT' }]);
  const pilot = sim.players[0], target = sim.players[1];
  for (const p of sim.players) if (p !== pilot && p !== target) { p.alive = false; p.respawnAt = 1000; }
  pilot.x = pilot.y = 0;
  target.x = 100; target.y = 0;
  for (let n = 0; n < 40; n++) Game.step(sim, {}, 0.05);
  assert.equal(pilot.droneTargetId, target.id);
  assert.equal(pilot.dronePulseTargetId, target.id);
  assert.ok(sim.time - pilot.dronePulseAt <= Game.SETTINGS.dronePulseDuration);
  const sharedSnapshot = Game.serializeBase(sim);
  const privateView = Game.serialize(sim, pilot.id, sharedSnapshot);
  const publicView = Game.serialize(sim, 'another-viewer', sharedSnapshot);
  assert.equal(privateView.players[0].dronePulseTargetId, target.id);
  assert.equal('dronePulseTargetId' in publicView.players[0], false);
  assert.equal(sharedSnapshot.players[0].dronePulseTargetId, target.id, 'building viewer views must not mutate the shared snapshot');
  assert.equal('dronePulseTargetId' in privateView.players[1], false);
});

test('pickup and temporary weapon systems are absent from simulation state', () => {
  const sim = Game.createGame({ mode: 'ffa' }, [{ id: 'pilot', name: 'PILOT' }]);
  assert.equal('pickups' in sim, false);
  assert.equal('weapon' in sim.players[0], false);
  assert.equal(Object.keys(Game.SETTINGS).some(key => key.toLowerCase().includes('pickup')), false);
});

test('Eclipse auto-aim chooses the closest angle and in-flight hexes track the locked target', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'eclipse', classId: 'eclipse' },
    { id: 'wide-near', classId: 'specter' },
    { id: 'narrow-far', classId: 'specter' }
  ]);
  const shooter = sim.players[0], wide = sim.players[1], narrow = sim.players[2];
  shooter.x = shooter.y = 0;
  shooter.angle = 0;
  wide.x = 100 * Math.cos(25 * Math.PI / 180);
  wide.y = 100 * Math.sin(25 * Math.PI / 180);
  narrow.x = 300 * Math.cos(5 * Math.PI / 180);
  narrow.y = 300 * Math.sin(5 * Math.PI / 180);
  Game.step(sim, { eclipse: { shoot: true, aim: 0 } }, 0.005);
  const hex = sim.bullets.find(b => b.hexVolley);
  assert.equal(hex.homingTargetId, 'narrow-far');
  assert.ok(hex.angle > 2.5 * Math.PI / 180);
  assert.ok(hex.angle <= 2.5 * Math.PI / 180 + Game.SETTINGS.eclipseHomingTurnRate * 0.005 + 1e-6);
});

test('Aegis acquires and curves onto its locked target, then releases outside the 60 degree angle', () => {
  const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
    { id: 'aegis', classId: 'aegis' },
    { id: 'target', classId: 'specter' }
  ]);
  const aegis = sim.players[0], target = sim.players[1];
  aegis.x = aegis.y = 0;
  target.shieldUntil = 0;
  target.x = 200 * Math.cos(17 * Math.PI / 180);
  target.y = 200 * Math.sin(17 * Math.PI / 180);
  aegis.angle = 17 * Math.PI / 180;
  Game.step(sim, { aegis: { shoot: true, aim: aegis.angle } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, target.id);
  assert.equal(aegis.aegisBeamCurve.length, 17);
  assert.ok(target.health < target.maxHealth);

  const healthAfterLock = target.health;
  Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, target.id, 'a 17 degree deviation retains the lock');
  assert.equal(aegis.aegisBeamCurve.length, 17);
  assert.ok(target.health < healthAfterLock, 'the curved beam hits the locked target off the raw aim ray');

  Game.step(sim, { aegis: { shoot: true, aim: -44 * Math.PI / 180 } }, 0.05);
  assert.equal(aegis.aegisLockTargetId, null, 'a deviation above 60 degrees drops the lock');
  assert.equal(aegis.aegisMultiplier, 1);
});

test('Aegis lock releases when its target dashes, is obscured, bound, healed, or out of range', () => {
  for (const reason of ['dash', 'invisible', 'bound', 'healed', 'range', 'stop']) {
    const sim = Game.createGame({ mode: 'ffa', botsEnabled: false }, [
      { id: 'aegis', classId: 'aegis' },
      { id: 'target', classId: 'specter' }
    ]);
    const aegis = sim.players[0], target = sim.players[1];
    aegis.x = aegis.y = 0;
    target.x = 200; target.y = 0;
    target.shieldUntil = 0;
    Game.step(sim, { aegis: { shoot: true, aim: 0 } }, 0.05);
    assert.equal(aegis.aegisLockTargetId, target.id, `${reason}: setup acquires the target`);
    if (reason === 'dash') target.dashUntil = sim.time + 0.2;
    if (reason === 'invisible') target.invisibleUntil = sim.time + 1;
    if (reason === 'bound') target.boundUntil = sim.time + 1;
    if (reason === 'healed') target.health += 1;
    if (reason === 'range') target.x = Game.SETTINGS.bulletRange * 1.2;
    Game.step(sim, { aegis: { shoot: reason !== 'stop', aim: 0 } }, 0.05);
    assert.equal(aegis.aegisLockTargetId, null, `${reason}: lock must be released`);
    assert.equal(aegis.aegisContinuousHitTime, 0, `${reason}: damage doubling resets`);
  }
});

test('Eclipse team kills grant temporary invisibility and movement speed to allies', () => {
  const sim = Game.createGame({ mode: 'teams', botsEnabled: false }, [
    { id: 'eclipse', team: 0, classId: 'eclipse' },
    { id: 'ally', team: 0, classId: 'specter' },
    { id: 'victim', team: 1, classId: 'specter' }
  ]);
  const eclipse = sim.players[0], ally = sim.players[1], victim = sim.players[2];
  victim.health = 1;
  victim.shieldUntil = 0;
  victim.x = 500; victim.y = 500;
  sim.bullets.push({ x: victim.x, y: victim.y, vx: 0, vy: 0, owner: eclipse.id,
    team: eclipse.team, color: eclipse.color, distance: 0, bounces: 0, damage: 5 });
  Game.step(sim, {}, 1 / 60);
  assert.equal(eclipse.kills, 1);
  assert.ok(ally.invisibleUntil >= sim.time + Game.CLASSES.eclipse.passiveKillInvisibilitySeconds);

  ally.x = ally.y = 0;
  ally.invisibleUntil = sim.time + 1;
  Game.step(sim, { [ally.id]: { moveX: 1 } }, 0.05);
  const expectedSpeed = Game.SETTINGS.playerSpeed * Game.CLASSES.specter.movementMultiplier *
    Game.CLASSES.eclipse.passiveKillSpeedMultiplier;
  assert.ok(ally.vx > 0 && ally.vx < expectedSpeed);
  assert.ok(ally.invisibleUntil > sim.time);
});

test('network snapshots retain local damage feedback and cap cosmetic particles', () => {
  const sim = Game.createGame({ botsEnabled: false }, [{ id: 'pilot' }]);
  sim.particles = Array.from({ length: 100 }, (_, index) => ({ index }));
  sim.damageNumbers = [
    { sourceId: 'pilot', targetId: 'enemy' },
    { sourceId: 'enemy', targetId: 'other' }
  ];
  const snapshot = Game.serialize(sim, 'pilot');
  assert.equal(snapshot.particles.length, Game.SETTINGS.networkParticleLimit);
  assert.equal(snapshot.players[0].trail.length, 0);
  assert.deepEqual(snapshot.damageNumbers, [{ sourceId: 'pilot', targetId: 'enemy' }]);
});
