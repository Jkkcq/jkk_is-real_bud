/**
 * Java behaviors that are more than a small speed/reach tweak.
 * Gated by java_mobs_enabled and java_mob_special.
 */
import { world, system, EquipmentSlot } from "@minecraft/server";
import { cfg } from "../engine/config.js";

const GOLD_ARMOR = new Set([
  "minecraft:golden_helmet",
  "minecraft:golden_chestplate",
  "minecraft:golden_leggings",
  "minecraft:golden_boots",
]);

const KITE = new Set(["minecraft:skeleton", "minecraft:stray", "minecraft:bogged"]);
const JUMPERS = new Set(["minecraft:slime", "minecraft:magma_cube"]);

const aggroUntil = new Map();
const spiderPassive = new Map();
const bearGuarding = new Map();
const witchDrankAt = new Map();
const beeStung = new Set();
const lastHop = new Map();

function specialOn() {
  try {
    if (cfg.java_mobs_enabled === false) return false;
    if (cfg.java_mob_special === false) return false;
    const v = cfg.java_mob_special ?? world.getDynamicProperty("java_mob_special");
    return v === undefined || v === null ? true : Boolean(v);
  } catch {
    return true;
  }
}

function alive(entity) {
  try {
    if (!entity) return false;
    if (typeof entity.isValid === "function") return entity.isValid();
    return entity.isValid !== false;
  } catch {
    return false;
  }
}

function isPlayer(entity) {
  return entity?.typeId === "minecraft:player";
}

function isDay() {
  try {
    return (world.getTimeOfDay() % 24000) < 12000;
  } catch {
    return true;
  }
}

function isRaining(dim) {
  try {
    const weather = dim.getWeather();
    return weather === WeatherType.Rain || weather === WeatherType.Thunder;
  } catch {
    return false;
  }
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

function shove(target, from, horizontal, vertical) {
  if (!alive(target) || !from) return;
  const dx = target.location.x - from.location.x;
  const dz = target.location.z - from.location.z;
  const len = Math.hypot(dx, dz) || 1;
  try {
    target.applyImpulse({ x: (dx / len) * horizontal, y: vertical, z: (dz / len) * horizontal });
  } catch {
    try { target.applyKnockback({ x: dx / len, z: dz / len }, vertical); } catch {}
  }
}

function wearingGold(player) {
  try {
    const equip = player.getComponent("minecraft:equippable");
    if (!equip) return false;
    for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
      const id = equip.getEquipment(slot)?.typeId;
      if (GOLD_ARMOR.has(id)) return true;
    }
  } catch {}
  return false;
}

function hasSky(dim, x, y, z) {
  for (let i = 1; i <= 10; i++) {
    let block;
    try { block = dim.getBlock({ x, y: y + i, z }); } catch { return true; }
    if (!block || block.isAir || block.isLiquid) continue;
    return false;
  }
  return true;
}

function tryTeleport(entity, range) {
  const dim = entity.dimension;
  const base = entity.location;
  for (let i = 0; i < 8; i++) {
    const x = base.x + (Math.random() * 2 - 1) * range;
    const y = base.y + (Math.random() * 8 - 3);
    const z = base.z + (Math.random() * 2 - 1) * range;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    let feet, head, below;
    try {
      feet = dim.getBlock({ x: fx, y: fy, z: fz });
      head = dim.getBlock({ x: fx, y: fy + 1, z: fz });
      below = dim.getBlock({ x: fx, y: fy - 1, z: fz });
    } catch { continue; }
    if (!feet?.isAir || !head?.isAir || !below || below.isAir || below.isLiquid) continue;
    try {
      entity.teleport({ x: fx + 0.5, y: fy, z: fz + 0.5 });
      try { dim.playSound("mob.endermen.portal", entity.location, { volume: 0.6, pitch: 1 }); } catch {}
      return true;
    } catch {}
  }
  return false;
}

function inLiquid(entity) {
  try {
    const block = entity.dimension.getBlock({
      x: Math.floor(entity.location.x),
      y: Math.floor(entity.location.y),
      z: Math.floor(entity.location.z),
    });
    return Boolean(block?.isLiquid);
  } catch {
    return false;
  }
}

function nearestFungus(entity) {
  const dim = entity.dimension;
  const x = Math.floor(entity.location.x);
  const y = Math.floor(entity.location.y);
  const z = Math.floor(entity.location.z);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        if (dx * dx + dz * dz > 16) continue;
        let block;
        try { block = dim.getBlock({ x: x + dx, y: y + dy, z: z + dz }); } catch { continue; }
        if (block?.typeId === "minecraft:warped_fungus") {
          return { x: x + dx + 0.5, y: y + dy, z: z + dz + 0.5 };
        }
      }
    }
  }
  return null;
}

function markAggro(entity, ticks = 400) {
  if (!entity?.id) return;
  aggroUntil.set(entity.id, system.currentTick + ticks);
}

function tickSpecial(player) {
  const day = isDay();
  const raining = isRaining(player.dimension);
  let mobs = [];
  try {
    mobs = player.dimension.getEntities({
      location: player.location,
      maxDistance: 32,
      excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb"],
    });
  } catch {
    return;
  }
  let budget = 28;
  for (const mob of mobs) {
    if (budget <= 0) break;
    if (!alive(mob)) continue;
    const id = mob.typeId;
    budget--;
    if (id === "minecraft:spider") {
      const x = Math.floor(mob.location.x);
      const y = Math.floor(mob.location.y);
      const z = Math.floor(mob.location.z);
      const openSky = hasSky(mob.dimension, x, y, z);
      spiderPassive.set(mob.id, day && openSky && !raining);
    } else if (id === "minecraft:polar_bear" && !isBaby(mob)) {
      let guarding = false;
      try {
        const near = mob.dimension.getEntities({ type: "minecraft:polar_bear", location: mob.location, maxDistance: 10 });
        guarding = near.some((other) => other.id !== mob.id && isBaby(other));
      } catch {}
      bearGuarding.set(mob.id, guarding);
      if (guarding) {
        try { mob.addEffect("speed", 30, { amplifier: 1, showParticles: false }); } catch {}
      }
    } else if (KITE.has(id)) {
      const dx = mob.location.x - player.location.x;
      const dz = mob.location.z - player.location.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6 && dist > 1.2) {
        try { mob.addEffect("slowness", 15, { amplifier: 1, showParticles: false }); } catch {}
        try { mob.applyImpulse({ x: (dx / dist) * 0.16, y: 0, z: (dz / dist) * 0.16 }); } catch {}
      }
    } else if (id === "minecraft:phantom") {
      const dx = mob.location.x - player.location.x;
      const dz = mob.location.z - player.location.z;
      if (Math.hypot(dx, dz) < 7 && mob.location.y - player.location.y < 4) {
        try { mob.applyImpulse({ x: 0, y: 0.42, z: 0 }); } catch {}
      }
    } else if (id === "minecraft:ghast") {
      try {
        const below = mob.dimension.getBlock({
          x: Math.floor(mob.location.x),
          y: Math.floor(mob.location.y) - 5,
          z: Math.floor(mob.location.z),
        });
        if (below && !below.isAir) mob.applyImpulse({ x: 0, y: 0.18, z: 0 });
      } catch {}
    } else if (id === "minecraft:blaze") {
      const dx = mob.location.x - player.location.x;
      const dy = mob.location.y - player.location.y;
      const dz = mob.location.z - player.location.z;
      if (dx * dx + dy * dy + dz * dz < 16 * 16) {
        try {
          const vy = mob.getVelocity?.()?.y ?? 0;
          if (vy < 0.08) mob.applyImpulse({ x: 0, y: 0.14, z: 0 });
        } catch {}
      }
    } else if (id === "minecraft:drowned") {
      try {
        if (inLiquid(mob)) mob.addEffect("speed", 30, { amplifier: 0, showParticles: false });
        else mob.addEffect("slowness", 30, { amplifier: 1, showParticles: false });
      } catch {}
    } else if (id === "minecraft:hoglin") {
      const fungus = nearestFungus(mob);
      if (fungus) {
        const dx = mob.location.x - fungus.x;
        const dz = mob.location.z - fungus.z;
        const len = Math.hypot(dx, dz) || 1;
        try { mob.applyImpulse({ x: (dx / len) * 0.35, y: 0.05, z: (dz / len) * 0.35 }); } catch {}
        try { mob.addEffect("speed", 20, { amplifier: 1, showParticles: false }); } catch {}
      }
    } else if (id === "minecraft:enderman") {
      const wet = inLiquid(mob) || (raining && hasSky(mob.dimension, Math.floor(mob.location.x), Math.floor(mob.location.y), Math.floor(mob.location.z)));
      if (wet) tryTeleport(mob, 16);
    } else if (id === "minecraft:witch") {
      try {
        const health = mob.getComponent("minecraft:health");
        const current = health?.currentValue ?? 26;
        const last = witchDrankAt.get(mob.id) ?? -999;
        if (current > 0 && current <= 12 && system.currentTick - last > 80) {
          witchDrankAt.set(mob.id, system.currentTick);
          health.setCurrentValue(Math.min(health.effectiveMax || health.defaultValue || 26, current + 8));
          try { mob.dimension.playSound("random.drink", mob.location, { volume: 0.5, pitch: 1 }); } catch {}
        }
      } catch {}
    } else if (id === "minecraft:piglin" && wearingGold(player)) {
      try { mob.removeEffect("speed"); } catch {}
      try { mob.addEffect("slowness", 25, { amplifier: 2, showParticles: false }); } catch {}
    } else if (JUMPERS.has(id) || id === "minecraft:breeze") {
      const last = lastHop.get(mob.id) ?? -999;
      const dx = player.location.x - mob.location.x;
      const dz = player.location.z - mob.location.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 10 && system.currentTick - last > (id === "minecraft:breeze" ? 18 : 24)) {
        lastHop.set(mob.id, system.currentTick);
        const y = id === "minecraft:breeze" ? 0.55 : id === "minecraft:magma_cube" ? 0.48 : 0.36;
        const toward = id === "minecraft:breeze" ? -0.12 : 0.16;
        try {
          mob.applyImpulse({
            x: dist > 0.2 ? (dx / dist) * toward : 0,
            y,
            z: dist > 0.2 ? (dz / dist) * toward : 0,
          });
        } catch {}
      }
    }
  }
}

system.runInterval(() => {
  if (!specialOn()) return;
  const now = system.currentTick;
  if (now % 80 === 0) {
    for (const [id, until] of aggroUntil) if (until < now) aggroUntil.delete(id);
    for (const [id, tick] of witchDrankAt) if (now - tick > 400) witchDrankAt.delete(id);
    if (beeStung.size > 40) beeStung.clear();
  }
  for (const player of world.getPlayers()) {
    try { tickSpecial(player); } catch {}
  }
}, 10);

try {
  world.beforeEvents.entityHurt.subscribe((event) => {
    if (!specialOn()) return;
    const attacker = event.damageSource?.damagingEntity;
    const target = event.hurtEntity;
    if (!attacker || !target) return;
    const now = system.currentTick;
    if (attacker.typeId === "minecraft:piglin" && isPlayer(target) && wearingGold(target)) {
      event.cancel = true;
      return;
    }
    if (attacker.typeId === "minecraft:spider" && spiderPassive.get(attacker.id) === true && (aggroUntil.get(attacker.id) ?? 0) <= now) {
      event.cancel = true;
      return;
    }
    if (attacker.typeId === "minecraft:polar_bear" && !isBaby(attacker)) {
      const guarding = bearGuarding.get(attacker.id) === true;
      const angry = (aggroUntil.get(attacker.id) ?? 0) > now;
      if (!guarding && !angry) event.cancel = true;
    }
  });
} catch (error) {
  console.warn("[JPVP] Java special mob hurt gate failed.", error);
}

try {
  world.afterEvents.entityHurt.subscribe((event) => {
    if (!specialOn()) return;
    const attacker = event.damageSource?.damagingEntity;
    const target = event.hurtEntity;
    if (!attacker || !target) return;
    const cause = String(event.damageSource?.cause ?? "");
    const aid = attacker.typeId;
    const tid = target.typeId;

    if (isPlayer(attacker)) {
      if (tid === "minecraft:spider" || tid === "minecraft:polar_bear" || tid === "minecraft:enderman") markAggro(target);
      if (tid === "minecraft:zombified_piglin") {
        markAggro(target, 500);
        system.run(() => {
          try {
            const pack = target.dimension.getEntities({ type: "minecraft:zombified_piglin", location: target.location, maxDistance: 32 });
            for (const ally of pack) {
              try { ally.addEffect("speed", 160, { amplifier: 1, showParticles: false }); } catch {}
            }
          } catch {}
        });
      }
    }

    if (aid === "minecraft:iron_golem" && cause === "entityAttack") {
      system.run(() => shove(target, attacker, 0.55, 0.95));
    } else if (aid === "minecraft:ravager" && (cause === "entityAttack" || cause === "contact")) {
      system.run(() => shove(target, attacker, 1.15, 0.32));
    } else if ((aid === "minecraft:hoglin" || aid === "minecraft:zoglin") && cause === "entityAttack") {
      system.run(() => shove(target, attacker, 0.85, 0.28));
    } else if (aid === "minecraft:goat") {
      system.run(() => shove(target, attacker, 1.25, 0.42));
    } else if (aid === "minecraft:warden" && (cause === "sonicBoom" || cause === "sonic_boom" || cause === "magic")) {
      system.run(() => {
        shove(target, attacker, 1.4, 0.55);
        try { attacker.addEffect("slowness", 40, { amplifier: 2, showParticles: false }); } catch {}
      });
    } else if (aid === "minecraft:bee" && isPlayer(target) && !beeStung.has(attacker.id)) {
      beeStung.add(attacker.id);
      system.runTimeout(() => {
        try { if (alive(attacker)) attacker.remove(); } catch {}
      }, 20);
    } else if (aid === "minecraft:cave_spider" && cause === "entityAttack") {
      system.run(() => {
        try {
          if (!target.getEffect("poison")) target.addEffect("poison", 140, { amplifier: 0, showParticles: true });
        } catch {}
      });
    } else if (isPlayer(attacker) && (tid === "minecraft:guardian" || tid === "minecraft:elder_guardian")) {
      system.run(() => {
        try { attacker.applyDamage(2, { cause: "thorns", damagingEntity: target }); } catch {}
      });
    }

    if (cause === "projectile" && tid === "minecraft:enderman") {
      system.run(() => { if (alive(target)) tryTeleport(target, 20); });
    } else if (isPlayer(attacker) && tid === "minecraft:shulker" && Math.random() < 0.45) {
      system.run(() => { if (alive(target)) tryTeleport(target, 8); });
    } else if (isPlayer(attacker) && tid === "minecraft:fireball") {
      system.run(() => reflectFireball(target, attacker));
    }
  });
} catch (error) {
  console.warn("[JPVP] Java special mob reactions failed.", error);
}

function reflectFireball(fireball, player) {
  if (!alive(fireball) || !alive(player)) return;
  const dx = fireball.location.x - player.location.x;
  const dy = fireball.location.y - (player.location.y + 1.4);
  const dz = fireball.location.z - player.location.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  try {
    const velocity = fireball.getVelocity?.();
    if (velocity) {
      fireball.applyImpulse({ x: -velocity.x * 2 + (dx / len) * 1.2, y: -velocity.y * 2 + 0.15, z: -velocity.z * 2 + (dz / len) * 1.2 });
    } else {
      fireball.applyImpulse({ x: (dx / len) * 1.4, y: 0.2, z: (dz / len) * 1.4 });
    }
  } catch {}
  try { player.playSound("random.bowhit", { volume: 0.4, pitch: 1.4 }); } catch {}
}

try {
  world.afterEvents.entityHitEntity.subscribe((event) => {
    if (!specialOn()) return;
    const hit = event.hitEntity;
    const player = event.damagingEntity;
    if (hit?.typeId === "minecraft:fireball" && isPlayer(player)) {
      system.run(() => reflectFireball(hit, player));
    }
  });
} catch {}

try {
  world.afterEvents.projectileHitEntity.subscribe((event) => {
    if (!specialOn()) return;
    const proj = event.projectile;
    const hit = event.getEntityHit?.()?.entity;
    const source = event.source;
    if (!proj || !hit) return;
    const pid = proj.typeId || "";
    system.run(() => {
      try {
        if (!alive(hit)) return;
        if (pid === "minecraft:snowball" && hit.typeId === "minecraft:blaze") {
          hit.applyDamage(3, { cause: "entityAttack", damagingEntity: source });
        } else if (pid === "minecraft:shulker_bullet") {
          if (!hit.getEffect("levitation")) hit.addEffect("levitation", 200, { amplifier: 0, showParticles: true });
        } else if (pid.includes("wind_charge")) {
          hit.applyImpulse({ x: 0, y: 0.85, z: 0 });
        } else if (pid === "minecraft:arrow" && source?.typeId === "minecraft:stray") {
          hit.addEffect("slowness", 600, { amplifier: 0, showParticles: true });
        } else if (pid === "minecraft:arrow" && source?.typeId === "minecraft:bogged") {
          if (!hit.getEffect("poison")) hit.addEffect("poison", 100, { amplifier: 0, showParticles: true });
        }
      } catch {}
    });
  });
} catch {}

function isChargedCreeper(entity) {
  try {
    if (entity.getComponent("minecraft:is_charged") || entity.getComponent("minecraft:charged")) return true;
  } catch {}
  try {
    if (entity.hasComponent?.("minecraft:is_charged") || entity.hasComponent?.("minecraft:charged")) return true;
  } catch {}
  return false;
}

function someoneClose(entity, range) {
  try {
    const nearby = entity.dimension.getEntities({ location: entity.location, maxDistance: range });
    return nearby.some((other) => other.id !== entity.id && other.typeId !== "minecraft:item" && other.typeId !== "minecraft:xp_orb");
  } catch {
    return true;
  }
}

try {
  world.beforeEvents.explosion.subscribe((event) => {
    if (!specialOn()) return;
    const source = event.source;
    if (source?.typeId !== "minecraft:creeper") return;
    const charged = isChargedCreeper(source);
    if (!someoneClose(source, charged ? 5.5 : 4.2)) {
      event.cancel = true;
      return;
    }
    try {
      const blocks = typeof event.getImpactedBlocks === "function" ? event.getImpactedBlocks() : null;
      if (!blocks || typeof event.setImpactedBlocks !== "function") return;
      const cap = charged ? 28 : 12;
      if (blocks.length <= cap) return;
      const loc = source.location;
      const ranked = blocks.slice().sort((a, b) => {
        const da = (a.location.x - loc.x) ** 2 + (a.location.y - loc.y) ** 2 + (a.location.z - loc.z) ** 2;
        const db = (b.location.x - loc.x) ** 2 + (b.location.y - loc.y) ** 2 + (b.location.z - loc.z) ** 2;
        return da - db;
      });
      event.setImpactedBlocks(ranked.slice(0, cap));
    } catch {}
  });
} catch (error) {
  console.warn("[JPVP] Java creeper explosion hook unavailable.", error);
}

try {
  console.warn("[JPVP] Java special mob behaviors loaded");
} catch {}
