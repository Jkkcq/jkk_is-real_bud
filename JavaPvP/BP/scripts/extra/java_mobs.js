/**
 * Java-like mob feel for Bedrock:
 * - melee reach from Java widths (shorter than Bedrock lunges)
 * - per-mob attack cooldown
 * - movement pace (heavy / brisk / fast)
 * - brief stop on a landed swing
 * - line-of-sight so melee doesn't connect through walls
 */
import { world, system } from "@minecraft/server";
import { cfg } from "../engine/config.js";

const DEFAULTS = {
  zombie: { width: 0.6, cooldown: 20, pace: "heavy", windup: 8 },
  baby: { reachMul: 0.75, cooldownMul: 0.55, pace: "fast", windup: 4 },
  skeleton: { width: 0.6, cooldown: 20, pace: "normal", windup: 6 },
  spider: { width: 1.4, cooldown: 20, pace: "brisk", windup: 6, losY: 0.6 },
  cave_spider: { width: 0.7, cooldown: 16, pace: "brisk", windup: 5, losY: 0.4 },
  enderman: { width: 0.6, cooldown: 20, pace: "brisk", windup: 6, losY: 2.2 },
  wither_skeleton: { width: 0.7, cooldown: 20, pace: "normal", windup: 8, losY: 1.8 },
  iron_golem: { width: 1.4, cooldown: 30, pace: "heavy", windup: 10 },
  ravager: { width: 1.95, cooldown: 40, pace: "brisk", windup: 10 },
  hoglin: { width: 1.4, cooldown: 40, pace: "brisk", windup: 8 },
  warden: { width: 0.9, cooldown: 30, pace: "brisk", windup: 10, losY: 2.0 },
  piglin: { width: 0.6, cooldown: 20, pace: "brisk", windup: 6 },
  brute: { width: 0.6, cooldown: 12, pace: "brisk", windup: 5 },
  illager: { width: 0.6, cooldown: 20, pace: "brisk", windup: 6 },
  small: { width: 0.4, cooldown: 10, pace: "fast", windup: 3, losY: 0.3 },
  slime: { width: 0.8, cooldown: 20, pace: "normal", windup: 6 },
  bee: { width: 0.6, cooldown: 20, pace: "brisk", windup: 4, losY: 0.4 },
  wolf: { width: 0.6, cooldown: 20, pace: "brisk", windup: 5 },
  bear: { width: 1.4, cooldown: 20, pace: "normal", windup: 8 },
  blaze: { width: 0.6, cooldown: 20, pace: "normal", windup: 6 },
  breeze: { width: 0.6, cooldown: 20, pace: "fast", windup: 6 },
  phantom: { width: 0.9, cooldown: 20, pace: "fast", windup: 4, losY: 0.4 },
  vex: { width: 0.4, cooldown: 14, pace: "fast", windup: 3, losY: 0.4 },
  goat: { width: 0.9, cooldown: 20, pace: "brisk", windup: 6 },
  fallback: { width: 0.6, cooldown: 20, pace: "normal", windup: 6 },
};

const BY_TYPE = {
  "minecraft:zombie": "zombie",
  "minecraft:husk": "zombie",
  "minecraft:drowned": "zombie",
  "minecraft:zombie_villager": "zombie",
  "minecraft:zombified_piglin": "zombie",
  "minecraft:skeleton": "skeleton",
  "minecraft:stray": "skeleton",
  "minecraft:bogged": "skeleton",
  "minecraft:wither_skeleton": "wither_skeleton",
  "minecraft:spider": "spider",
  "minecraft:cave_spider": "cave_spider",
  "minecraft:enderman": "enderman",
  "minecraft:iron_golem": "iron_golem",
  "minecraft:ravager": "ravager",
  "minecraft:hoglin": "hoglin",
  "minecraft:zoglin": "hoglin",
  "minecraft:warden": "warden",
  "minecraft:piglin": "piglin",
  "minecraft:piglin_brute": "brute",
  "minecraft:vindicator": "illager",
  "minecraft:pillager": "illager",
  "minecraft:evoker": "illager",
  "minecraft:witch": "skeleton",
  "minecraft:creeper": "skeleton",
  "minecraft:silverfish": "small",
  "minecraft:endermite": "small",
  "minecraft:slime": "slime",
  "minecraft:magma_cube": "slime",
  "minecraft:bee": "bee",
  "minecraft:wolf": "wolf",
  "minecraft:polar_bear": "bear",
  "minecraft:panda": "bear",
  "minecraft:blaze": "blaze",
  "minecraft:breeze": "breeze",
  "minecraft:phantom": "phantom",
  "minecraft:vex": "vex",
  "minecraft:goat": "goat",
  "minecraft:wither": "ravager",
};

const MELEE = new Set(["entityAttack", "contact", "ramAttack"]);
const lastSwing = new Map();
const swingPauseUntil = new Map();
const losCache = new Map();

function flag(key, fallback = true) {
  try {
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

function reachScale() {
  try {
    const n = Number(cfg.java_mob_reach_scale ?? world.getDynamicProperty("java_mob_reach_scale") ?? 1.25);
    return Number.isFinite(n) ? Math.max(0.8, Math.min(1.8, n)) : 1.25;
  } catch {
    return 1.25;
  }
}

function enabled() {
  return flag("java_mobs_enabled", true);
}

function isPlayer(entity) {
  return entity?.typeId === "minecraft:player";
}

function isBaby(entity) {
  try {
    const scale = entity.getComponent("minecraft:scale");
    const value = scale?.value ?? scale?.currentValue;
    if (typeof value === "number" && value > 0 && value < 0.75) return true;
  } catch {}
  try {
    if (entity.matches?.({ families: ["baby"] })) return true;
  } catch {}
  return false;
}

function isMonster(entity) {
  try {
    if (entity.matches?.({ families: ["monster"] })) return true;
    if (entity.matches?.({ families: ["undead"] })) return true;
    if (entity.matches?.({ families: ["illager"] })) return true;
  } catch {}
  return BY_TYPE[entity?.typeId] != null;
}

function profileFor(entity) {
  const key = BY_TYPE[entity?.typeId] || (isMonster(entity) ? "fallback" : null);
  if (!key) return null;
  const base = { ...DEFAULTS[key] };
  if (isBaby(entity)) {
    const baby = DEFAULTS.baby;
    base.width *= 0.7;
    base.cooldown = Math.max(6, Math.round(base.cooldown * baby.cooldownMul));
    base.pace = baby.pace;
    base.windup = baby.windup;
    base.baby = true;
  }
  return base;
}

function javaReach(profile) {
  const width = profile.width;
  const targetWidth = 0.6;
  const raw = Math.sqrt((width * 2) * (width * 2) + targetWidth);
  const babyMul = profile.baby ? DEFAULTS.baby.reachMul : 1;
  return raw * reachScale() * babyMul;
}

function distance(a, b) {
  const dx = a.location.x - b.location.x;
  const dy = a.location.y - b.location.y;
  const dz = a.location.z - b.location.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function eye(entity, profile) {
  const y = entity.location.y + (profile?.losY ?? Math.min(1.6, Math.max(0.4, (profile?.width ?? 0.6) * 2)));
  return { x: entity.location.x, y, z: entity.location.z };
}

function refreshLos(attacker, target, profile) {
  let ok = true;
  try {
    const origin = eye(attacker, profile);
    const dest = eye(target, null);
    const dx = dest.x - origin.x;
    const dy = dest.y - origin.y;
    const dz = dest.z - origin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.2) ok = true;
    else {
      const hit = attacker.dimension.getBlockFromRay(origin, { x: dx / dist, y: dy / dist, z: dz / dist }, {
        maxDistance: dist,
        includePassableBlocks: false,
        includeLiquidBlocks: false,
      });
      if (hit?.block) {
        const bx = hit.block.location.x + 0.5 - origin.x;
        const by = hit.block.location.y + 0.5 - origin.y;
        const bz = hit.block.location.z + 0.5 - origin.z;
        const bd = Math.sqrt(bx * bx + by * by + bz * bz);
        ok = bd >= dist - 0.85;
      }
    }
  } catch {
    ok = true;
  }
  losCache.set(attacker.id, { tick: system.currentTick, ok, targetId: target.id });
  return ok;
}

function applyPace(entity, profile) {
  if (!flag("java_mob_movement", true)) return;
  const paused = (swingPauseUntil.get(entity.id) ?? 0) > system.currentTick;
  const pace = paused ? "pause" : profile.pace;
  try {
    if (pace === "pause") {
      entity.addEffect("slowness", Math.max(5, profile.windup || 8), { amplifier: 4, showParticles: false });
      return;
    }
    if (pace === "normal" || !pace) return;
    const speed = pace === "fast" || pace === "brisk";
    const id = speed ? "speed" : "slowness";
    const amp = pace === "fast" || pace === "tank" ? 1 : 0;
    const cur = entity.getEffect(id);
    if (cur && cur.duration > 12 && cur.amplifier >= amp) return;
    entity.addEffect(id, 40, { amplifier: amp, showParticles: false });
  } catch {}
}

function considerMob(mob, target) {
  const profile = profileFor(mob);
  if (!profile || !target) return;
  if (flag("java_mob_los", true)) refreshLos(mob, target, profile);
  if (flag("java_mob_movement", true) && distance(mob, target) < 18) applyPace(mob, profile);
}

try {
  world.beforeEvents.entityHurt.subscribe((event) => {
    if (!enabled()) return;
    const attacker = event.damageSource?.damagingEntity;
    const target = event.hurtEntity;
    if (!attacker || !target || attacker.id === target.id) return;
    if (isPlayer(attacker)) return;
    const cause = String(event.damageSource?.cause ?? "");
    if (!MELEE.has(cause)) return;
    const profile = profileFor(attacker);
    if (!profile) return;
    if (cause === "contact" && !BY_TYPE[attacker.typeId]) return;

    if (flag("java_mob_reach", true)) {
      const reach = javaReach(profile);
      if (distance(attacker, target) > reach + 0.15) {
        event.cancel = true;
        return;
      }
    }

    if (flag("java_mob_los", true)) {
      const cached = losCache.get(attacker.id);
      if (cached && cached.targetId === target.id && system.currentTick - cached.tick < 12 && cached.ok === false) {
        event.cancel = true;
        return;
      }
    }

    if (flag("java_mob_cooldown", true)) {
      const now = system.currentTick;
      const last = lastSwing.get(attacker.id) ?? -9999;
      if (now - last < profile.cooldown) {
        event.cancel = true;
        return;
      }
      lastSwing.set(attacker.id, now);
      if (flag("java_mob_attack_pause", true)) {
        swingPauseUntil.set(attacker.id, now + (profile.windup || 6));
      }
    }
  });
} catch (error) {
  console.warn("[JPVP] Java mobs hurt hook failed.", error);
}

system.runInterval(() => {
  if (!enabled()) return;
  const now = system.currentTick;
  if (now % 40 === 0) {
    for (const [id, tick] of lastSwing) {
      if (now - tick > 200) lastSwing.delete(id);
    }
    for (const [id, until] of swingPauseUntil) {
      if (until < now) swingPauseUntil.delete(id);
    }
  }
  const seen = new Set();
  for (const player of world.getPlayers()) {
    let mobs;
    try {
      mobs = player.dimension.getEntities({ location: player.location, maxDistance: 28, excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb"] });
    } catch {
      continue;
    }
    let budget = 24;
    for (const mob of mobs) {
      if (budget <= 0) break;
      if (!mob || seen.has(mob.id)) continue;
      seen.add(mob.id);
      if (!profileFor(mob)) continue;
      budget--;
      considerMob(mob, player);
    }
  }
}, 10);

world.afterEvents.entityDie?.subscribe?.(({ deadEntity }) => {
  if (!deadEntity?.id) return;
  lastSwing.delete(deadEntity.id);
  swingPauseUntil.delete(deadEntity.id);
  losCache.delete(deadEntity.id);
});

try {
  console.warn("[JPVP] Java mob behavior loaded (reach, cooldown, pace, swing pause, line of sight)");
} catch {}
