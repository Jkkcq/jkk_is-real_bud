/**
 * Java boss behaviors Bedrock doesn't match:
 * - Ender dragon body/charge launches you (Java knockBack formula)
 * - Wither is slower in phase 1 and stays in ceiling/bedrock traps for farms
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

function easeWither(wither) {
  try {
    const health = wither.getComponent("minecraft:health");
    const max = health?.effectiveMax || health?.defaultValue || 300;
    const ratio = max > 0 ? (health?.currentValue ?? max) / max : 1;
    if (ratio > 0.5) {
      wither.addEffect("slowness", 30, { amplifier: 1, showParticles: false });
    }
  } catch {}
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
      const trapped = isWitherCaged(wither);
      witherState.set(wither.id, { trapped, tick: system.currentTick, loc: { ...wither.location } });
      if (trapped) pinWither(wither);
      else easeWither(wither);
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

function witherExplosion(event) {
  const src = event.source;
  const id = src?.typeId || "";
  if (id === "minecraft:wither" || id.includes("wither_skull")) return true;
  return false;
}

function explosionIsTrapped(event) {
  const src = event.source;
  if (src?.typeId === "minecraft:wither") return witherState.get(src.id)?.trapped === true;
  const pos = src?.location;
  if (!pos) return false;
  for (const state of witherState.values()) {
    if (!state.trapped || !state.loc) continue;
    const dx = state.loc.x - pos.x;
    const dy = state.loc.y - pos.y;
    const dz = state.loc.z - pos.z;
    if (dx * dx + dy * dy + dz * dz <= 20 * 20) return true;
  }
  return false;
}

try {
  world.beforeEvents.explosion.subscribe((event) => {
    if (!witherFarmEnabled() || !witherExplosion(event)) return;
    const trapped = explosionIsTrapped(event);
    try {
      const blocks = typeof event.getImpactedBlocks === "function" ? event.getImpactedBlocks() : [];
      if (trapped) {
        event.setImpactedBlocks([]);
        return;
      }
      const kept = [];
      for (const block of blocks) {
        if (!block) continue;
        if (CAGE_BLOCKS.has(block.typeId)) continue;
        kept.push(block);
        if (kept.length >= 6) break;
      }
      if (typeof event.setImpactedBlocks === "function") event.setImpactedBlocks(kept);
    } catch {}
  });
} catch (error) {
  console.warn("[JPVP] Wither explosion hook unavailable.", error);
}

try {
  console.warn("[JPVP] Java bosses loaded (ender dragon launch, wither trap/farm)");
} catch {}
