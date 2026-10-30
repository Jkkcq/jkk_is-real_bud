/**
 * Java boss behaviors Bedrock doesn't match:
 * - Ender dragon body/charge launches you (Java knockBack formula)
 * - Wither uses Java HP, spawn charge, skull pattern, and the half-health phase
 */
import { world, system } from "@minecraft/server";
import { cfg } from "../engine/config.js";

const CAGE_BLOCKS = new Set([
  "minecraft:bedrock",
  "minecraft:barrier",
  "minecraft:end_portal",
  "minecraft:end_portal_frame",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:jigsaw",
  "minecraft:reinforced_deepslate",
]);

const dragonLaunchAt = new Map();
const witherState = new Map();

function on(key, fallback = true) {
  try {
    if (cfg.java_mobs_enabled === false) return false;
    const v = cfg[key];
    if (v === undefined || v === null) {
      const dp = world.getDynamicProperty(key);
      return dp === undefined || dp === null ? fallback : Boolean(dp);
    }
    return Boolean(v);
  } catch {
    return fallback;
  }
}

function dragonLaunchEnabled() {
  return on("java_dragon_launch", true);
}

function witherFarmEnabled() {
  return on("java_wither_farm", true);
}

function xzSpeed(entity) {
  try {
    const v = entity.getVelocity();
    return Math.hypot(v?.x || 0, v?.z || 0);
  } catch {
    return 0;
  }
}

function launchFromDragon(dragon, target, charging) {
  const dx = target.location.x - dragon.location.x;
  const dz = target.location.z - dragon.location.z;
  const h = Math.max(dx * dx + dz * dz, 0.1);
  let ix = (dx / h) * 4;
  let iz = (dz / h) * 4;
  const mag = Math.hypot(ix, iz) || 1;
  const cap = charging ? 2.35 : 1.35;
  if (mag > cap) {
    ix = (ix / mag) * cap;
    iz = (iz / mag) * cap;
  }
  const iy = charging ? 0.55 : 0.28;
  try {
    target.applyImpulse({ x: ix, y: iy, z: iz });
  } catch {
    try {
      const len = Math.hypot(dx, dz) || 1;
      target.applyKnockback({ x: dx / len, z: dz / len }, charging ? 0.85 : 0.45);
    } catch {}
  }
  try {
    target.dimension.playSound(charging ? "mob.enderdragon.growl" : "mob.enderdragon.flap", target.location, { volume: 0.6, pitch: charging ? 0.8 : 1.1 });
  } catch {}
}

function tryDragonLaunch(dragon, target, charging, gap) {
  if (!target || target.typeId === "minecraft:ender_dragon") return;
  const now = system.currentTick;
  const last = dragonLaunchAt.get(target.id) ?? -999;
  if (now - last < gap) return;
  const dx = target.location.x - dragon.location.x;
  const dz = target.location.z - dragon.location.z;
  const dist = Math.hypot(dx, dz);
  const reach = charging ? 8.5 : 6.2;
  if (dist > reach) return;
  dragonLaunchAt.set(target.id, now);
  launchFromDragon(dragon, target, charging);
}

function solid(block) {
  if (!block) return false;
  try {
    if (block.isAir || block.isLiquid) return false;
    if (typeof block.isSolid === "boolean") return block.isSolid;
    return true;
  } catch {
    return false;
  }
}

function isWitherCaged(wither) {
  const dim = wither.dimension;
  const x = Math.floor(wither.location.x);
  const y = Math.floor(wither.location.y);
  const z = Math.floor(wither.location.z);
  let ceiling = false;
  let bedrock = false;
  for (let dy = 1; dy <= 4; dy++) {
    let block;
    try { block = dim.getBlock({ x, y: y + dy, z }); } catch { continue; }
    if (!block || block.isAir) continue;
    if (block.typeId === "minecraft:bedrock") bedrock = true;
    if (solid(block)) {
      ceiling = true;
      break;
    }
  }
  if (!ceiling && !bedrock) return false;
  let walls = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    try {
      if (solid(dim.getBlock({ x: x + dx, y, z: z + dz }))) walls++;
    } catch {}
  }
  return bedrock || walls >= 3;
}

function pinWither(wither) {
  try {
    const v = wither.getVelocity?.() || { x: 0, y: 0, z: 0 };
    const yImpulse = v.y > 0 ? -v.y - 0.12 : -0.06;
    wither.applyImpulse({ x: v.x * -0.35, y: yImpulse, z: v.z * -0.35 });
  } catch {}
  try {
    wither.addEffect("slowness", 25, { amplifier: 5, showParticles: false });
  } catch {}
}



const JAVA_WITHER_HP = 300;
const WITHER_SPAWN_TICKS = 220;
const skullVolley = new Map();
const lastBlueSkull = new Map();

function witherVitals(wither) {
  try {
    const health = wither.getComponent("minecraft:health");
    const max = Number(health?.effectiveMax || health?.defaultValue || JAVA_WITHER_HP);
    const current = Number(health?.currentValue ?? max);
    const safeMax = max > 0 ? max : JAVA_WITHER_HP;
    return { health, max: safeMax, current, ratio: current / safeMax, scale: safeMax / JAVA_WITHER_HP };
  } catch {
    return null;
  }
}

function spawnTickOf(wither, now, ratio) {
  try {
    const saved = wither.getDynamicProperty("jpvp_wither_born");
    if (typeof saved === "number") return saved;
  } catch {}
  const born = ratio > 0.98 ? now : now - WITHER_SPAWN_TICKS;
  try { wither.setDynamicProperty("jpvp_wither_born", born); } catch {}
  return born;
}

function isSpawning(wither, now, ratio) {
  return now - spawnTickOf(wither, now, ratio) < WITHER_SPAWN_TICKS;
}

function nearestPlayer(entity, range) {
  let best = null;
  let bestDist = range * range;
  try {
    const players = entity.dimension.getEntities({ type: "minecraft:player", location: entity.location, maxDistance: range });
    for (const player of players) {
      const dx = player.location.x - entity.location.x;
      const dy = player.location.y - entity.location.y;
      const dz = player.location.z - entity.location.z;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        best = player;
        bestDist = dist;
      }
    }
  } catch {}
  return best;
}

function dashWither(wither, player) {
  const dx = player.location.x - wither.location.x;
  const dy = (player.location.y + 0.6) - wither.location.y;
  const dz = player.location.z - wither.location.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  try {
    wither.applyImpulse({ x: (dx / len) * 1.15, y: Math.max(-0.15, (dy / len) * 0.4), z: (dz / len) * 1.15 });
  } catch {}
  try { wither.dimension.playSound("mob.wither.shoot", wither.location, { volume: 0.9, pitch: 0.65 }); } catch {}
}

function javaWitherTick(wither, now) {
  const prev = witherState.get(wither.id);
  if (prev?.tick === now) return;
  const vitals = witherVitals(wither);
  if (!vitals || vitals.current <= 0) return;
  const spawning = isSpawning(wither, now, vitals.ratio);
  const trapped = isWitherCaged(wither);
  let regenTick = prev?.regenTick ?? now;
  let nextDash = prev?.nextDash ?? now + 50;
  let armored = prev?.armored === true;
  if (!spawning && now - regenTick >= 20) {
    regenTick = now;
    try {
      const live = witherVitals(wither) || vitals;
      live.health.setCurrentValue(Math.min(live.max, live.current + Math.max(1, live.scale)));
    } catch {}
  }
  const ratio = witherVitals(wither)?.ratio ?? vitals.ratio;
  if (!spawning && ratio <= 0.5 && !armored) {
    armored = true;
    try { wither.dimension.playSound("mob.wither.hurt", wither.location, { volume: 1, pitch: 0.5 }); } catch {}
  }
  if (ratio > 0.5) armored = false;
  witherState.set(wither.id, {
    trapped,
    spawning,
    tick: now,
    loc: { x: wither.location.x, y: wither.location.y, z: wither.location.z },
    regenTick,
    nextDash,
    armored,
    ratio,
  });
  if (spawning) {
    try { wither.addEffect("slowness", 40, { amplifier: 5, showParticles: false }); } catch {}
    return;
  }
  if (trapped) {
    pinWither(wither);
    return;
  }
  if (ratio > 0.5) {
    try { wither.addEffect("slowness", 30, { amplifier: 1, showParticles: false }); } catch {}
    return;
  }
  try { wither.removeEffect("slowness"); } catch {}
  const player = nearestPlayer(wither, 32);
  if (player && now >= nextDash) {
    witherState.get(wither.id).nextDash = now + 50;
    dashWither(wither, player);
  }
}

function trackBosses(player) {
  let dragons = [];
  let withers = [];
  try {
    dragons = player.dimension.getEntities({ type: "minecraft:ender_dragon", location: player.location, maxDistance: 64 });
  } catch {}
  try {
    withers = player.dimension.getEntities({ type: "minecraft:wither", location: player.location, maxDistance: 48 });
  } catch {}

  if (dragonLaunchEnabled()) {
    for (const dragon of dragons) {
      const charging = xzSpeed(dragon) > 0.32;
      let nearby = [];
      try {
        nearby = dragon.dimension.getEntities({ location: dragon.location, maxDistance: charging ? 9 : 7 });
      } catch { nearby = [player]; }
      for (const entity of nearby) {
        if (!entity || entity.id === dragon.id) continue;
        if (entity.typeId === "minecraft:item" || entity.typeId === "minecraft:xp_orb") continue;
        tryDragonLaunch(dragon, entity, charging, charging ? 8 : 14);
      }
    }
  }

  if (witherFarmEnabled()) {
    for (const wither of withers) {
      javaWitherTick(wither, system.currentTick);
    }
  }
}

system.runInterval(() => {
  if (cfg.java_mobs_enabled === false) return;
  const now = system.currentTick;
  if (now % 40 === 0) {
    for (const [id, tick] of dragonLaunchAt) {
      if (now - tick > 80) dragonLaunchAt.delete(id);
    }
    for (const [id, state] of witherState) {
      if (now - state.tick > 40) witherState.delete(id);
    }
    for (const [id, volley] of skullVolley) {
      if (now - volley.start > 80) skullVolley.delete(id);
    }
    for (const [id, tick] of lastBlueSkull) {
      if (now - tick > 400) lastBlueSkull.delete(id);
    }
  }
  const seen = new Set();
  for (const player of world.getPlayers()) {
    if (seen.has(player.dimension.id + player.id)) continue;
    seen.add(player.dimension.id + player.id);
    try { trackBosses(player); } catch {}
  }
}, 2);

try {
  world.afterEvents.entityHurt.subscribe((event) => {
    if (!dragonLaunchEnabled()) return;
    const attacker = event.damageSource?.damagingEntity;
    const target = event.hurtEntity;
    if (!attacker || !target || attacker.typeId !== "minecraft:ender_dragon") return;
    const cause = String(event.damageSource?.cause ?? "");
    if (cause !== "entityAttack" && cause !== "contact") return;
    system.run(() => {
      try {
        if (!target.isValid) return;
        tryDragonLaunch(attacker, target, xzSpeed(attacker) > 0.2, 6);
      } catch {}
    });
  });
} catch {}


function phase2WitherNearby(skeleton) {
  try {
    const withers = skeleton.dimension.getEntities({
      type: "minecraft:wither",
      location: skeleton.location,
      maxDistance: 8,
    });
    const now = system.currentTick;
    for (const wither of withers) {
      const vitals = witherVitals(wither);
      if (!vitals || vitals.current <= 0 || vitals.ratio > 0.5) continue;
      if (isSpawning(wither, now, vitals.ratio)) continue;
      return true;
    }
  } catch {}
  return false;
}

function witherSkullKind(source) {
  const id = source?.typeId || "";
  if (id === "minecraft:wither") return "body";
  if (!id.includes("wither_skull")) return "";
  return id.includes("dangerous") ? "blue" : "black";
}

function skullOwner(skull) {
  try {
    const owner = skull.getComponent("minecraft:projectile")?.owner;
    if (owner?.typeId === "minecraft:wither") return owner;
  } catch {}
  try {
    const found = skull.dimension.getEntities({ type: "minecraft:wither", location: skull.location, maxDistance: 8 });
    return found[0];
  } catch {
    return undefined;
  }
}

try {
  world.beforeEvents.explosion.subscribe((event) => {
    if (!witherFarmEnabled()) return;
    const kind = witherSkullKind(event.source);
    if (!kind || typeof event.setImpactedBlocks !== "function") return;
    try {
      const blocks = typeof event.getImpactedBlocks === "function" ? event.getImpactedBlocks() : [];
      if (kind === "black") {
        event.setImpactedBlocks([]);
        return;
      }
      const cap = kind === "blue" ? 8 : blocks.length;
      const kept = [];
      for (const block of blocks) {
        if (!block || CAGE_BLOCKS.has(block.typeId)) continue;
        kept.push(block);
        if (kept.length >= cap) break;
      }
      event.setImpactedBlocks(kept);
    } catch {}
  });
} catch (error) {
  console.warn("[JPVP] Wither explosion hook unavailable.", error);
}

try {
  world.beforeEvents.entityHurt.subscribe((event) => {
    if (!witherFarmEnabled()) return;
    const wither = event.hurtEntity;
    if (wither?.typeId !== "minecraft:wither") return;
    const vitals = witherVitals(wither);
    if (!vitals || vitals.current <= 0) return;
    const cause = String(event.damageSource?.cause ?? "");
    if (cause !== "void" && isSpawning(wither, system.currentTick, vitals.ratio)) {
      event.cancel = true;
      return;
    }
    if (vitals.ratio <= 0.5 && (cause === "projectile" || cause === "arrow")) {
      event.cancel = true;
      return;
    }
    if (vitals.scale > 1.05 && typeof event.damage === "number" && event.damage > 0) {
      event.damage *= vitals.scale;
    }
  });
} catch (error) {
  console.warn("[JPVP] Wither hurt scaling unavailable.", error);
}

try {
  world.afterEvents.entityHurt.subscribe((event) => {
    if (!witherFarmEnabled()) return;
    const attacker = event.damageSource?.damagingEntity;
    const target = event.hurtEntity;
    if (attacker?.typeId !== "minecraft:wither" || !target) return;
    const cause = String(event.damageSource?.cause ?? "");
    if (cause !== "entityAttack" && cause !== "contact") return;
    const vitals = witherVitals(attacker);
    if (!vitals || vitals.ratio > 0.5) return;
    system.run(() => {
      try {
        if (target.isValid === false) return;
        const dx = target.location.x - attacker.location.x;
        const dz = target.location.z - attacker.location.z;
        const len = Math.hypot(dx, dz) || 1;
        target.applyImpulse({ x: (dx / len) * 0.95, y: 0.45, z: (dz / len) * 0.95 });
      } catch {}
    });
  });
} catch {}

try {
  world.afterEvents.entitySpawn.subscribe((event) => {
    if (!witherFarmEnabled()) return;
    const entity = event.entity;
    if (entity?.typeId === "minecraft:wither_skeleton") {
      system.run(() => {
        try {
          if (!entity.isValid) return;
          if (phase2WitherNearby(entity)) entity.remove();
        } catch {}
      });
      return;
    }
    const skull = entity;
    const kind = witherSkullKind(skull);
    if (kind !== "black" && kind !== "blue") return;
    system.run(() => {
      try {
        if (!skull.isValid) return;
        const owner = skullOwner(skull);
        if (!owner) return;
        const now = system.currentTick;
        const state = witherState.get(owner.id);
        const vitals = witherVitals(owner);
        if (vitals && isSpawning(owner, now, vitals.ratio)) {
          skull.remove();
          return;
        }
        const phase2 = (state?.ratio ?? 1) <= 0.5;
        const windowTicks = phase2 ? 15 : 20;
        const maxSkulls = phase2 ? 4 : 3;
        let volley = skullVolley.get(owner.id);
        if (!volley || now - volley.start > windowTicks) volley = { start: now, count: 0 };
        volley.count += 1;
        skullVolley.set(owner.id, volley);
        if (kind === "blue") {
          const last = lastBlueSkull.get(owner.id) ?? -999;
          if (now - last < 200) {
            skull.remove();
            return;
          }
          lastBlueSkull.set(owner.id, now);
        }
        if (volley.count > maxSkulls) skull.remove();
      } catch {}
    });
  });
} catch {}

try {
  world.afterEvents.projectileHitEntity.subscribe((event) => {
    if (!witherFarmEnabled()) return;
    const id = event.projectile?.typeId || "";
    if (!id.includes("wither_skull")) return;
    const hit = event.getEntityHit?.()?.entity;
    if (!hit) return;
    system.run(() => {
      try {
        if (hit.isValid === false) return;
        hit.addEffect("wither", 200, { amplifier: 1, showParticles: true });
      } catch {}
    });
  });
} catch {}

try {
  console.warn("[JPVP] Java bosses loaded (ender dragon launch, Java wither phases)");
} catch {}
