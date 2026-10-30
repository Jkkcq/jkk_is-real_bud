/**
 * Java Edition parity helpers that were missing or only half-wired:
 * - ender pearl cooldown (20 ticks)
 * - hit interrupts eating / charging use
 * - crit coyote air window after leaving the ground
 * - egg / snowball throw spacing
 */
import { world, system, GameMode } from "@minecraft/server";
import { cfg } from "../engine/config.js";
import { setStateTag, hasStateTag } from "../engine/states.js";

function on(key, fallback = true) {
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

function num(key, fallback, min, max) {
  try {
    const raw = Number(cfg[key] ?? world.getDynamicProperty(key) ?? fallback);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(max, raw));
  } catch {
    return fallback;
  }
}

const pearlCooldownUntil = new Map();
const throwCooldownUntil = new Map();
const usingPlayers = new Map();
const groundedLast = new Map();

function isPlayer(entity) {
  return entity?.typeId === "minecraft:player";
}

function creative(player) {
  try {
    return player.getGameMode?.() === GameMode.Creative;
  } catch {
    return false;
  }
}

world.afterEvents.itemStartUse.subscribe((event) => {
  const player = event.source;
  if (!isPlayer(player)) return;
  usingPlayers.set(player.id, {
    itemId: event.itemStack?.typeId ?? "",
    tick: system.currentTick,
  });
});

world.afterEvents.itemStopUse.subscribe((event) => {
  const player = event.source;
  if (!isPlayer(player)) return;
  usingPlayers.delete(player.id);
});

try {
  world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    if (!isPlayer(player)) return;
    usingPlayers.delete(player.id);
  });
} catch {}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  pearlCooldownUntil.delete(playerId);
  throwCooldownUntil.delete(playerId);
  usingPlayers.delete(playerId);
  groundedLast.delete(playerId);
});

// Crit coyote: brief window where leaving ground still counts as airborne for crits.
system.runInterval(() => {
  const coyoteOn = on("java_crit_coyote_enabled", true);
  const window = coyoteOn ? Math.max(1, Math.min(8, Math.round(num("java_crit_coyote_ticks", 3, 1, 8)))) : 0;
  const pace = system.currentTick % 5 === 0;
  for (const player of world.getPlayers()) {
    try {
      if (coyoteOn) {
        const id = player.id;
        const onGround = Boolean(player.isOnGround);
        const prev = groundedLast.get(id);
        if (prev === undefined) {
          groundedLast.set(id, onGround);
        } else {
          if (prev && !onGround) {
            setStateTag(player, "java_coyote_air", true);
            system.runTimeout(() => {
              try { setStateTag(player, "java_coyote_air", false); } catch {}
            }, window);
          }
          if (onGround) setStateTag(player, "java_coyote_air", false);
          groundedLast.set(id, onGround);
        }
      }
      if (!pace) continue;
      if (on("java_sprint_hunger", true)) {
        const hunger = player.getComponent("minecraft:player.hunger")?.currentValue;
        if (player.isSprinting && typeof hunger === "number" && hunger <= 6) {
          player.addEffect("slowness", 8, { amplifier: 2, showParticles: false });
        }
      }
      if (on("java_berry_slow", true)) {
        const block = player.dimension.getBlock({
          x: Math.floor(player.location.x),
          y: Math.floor(player.location.y),
          z: Math.floor(player.location.z),
        });
        if (block?.typeId === "minecraft:sweet_berry_bush") {
          player.addEffect("slowness", 10, { amplifier: 0, showParticles: false });
        }
      }
    } catch {}
  }
}, 1);

export function canJavaCrit(attacker) {
  if (!attacker) return false;
  try {
    if (attacker.isSprinting) return false;
    if (attacker.isFalling && !attacker.isOnGround) return true;
    if (on("java_crit_coyote_enabled", true) && hasStateTag(attacker, "java_coyote_air") && !attacker.isOnGround) {
      return true;
    }
  } catch {}
  return false;
}

// Hit cancels item use (eating / drawing) — Java-like interrupt.
world.afterEvents.entityHurt.subscribe((event) => {
  if (!on("java_hit_interrupt_use", true)) return;
  const player = event.hurtEntity;
  if (!isPlayer(player)) return;
  if ((Number(event.damage) || 0) <= 0) return;
  if (!usingPlayers.has(player.id)) return;
  system.run(() => {
    try {
      usingPlayers.delete(player.id);
      // Nudge inventory slot to force Bedrock to drop the use state.
      const slot = player.selectedSlotIndex;
      player.selectedSlotIndex = (slot + 1) % 9;
      system.runTimeout(() => {
        try { player.selectedSlotIndex = slot; } catch {}
      }, 1);
      try { player.playSound("random.break", { volume: 0.15, pitch: 1.6 }); } catch {}
    } catch {}
  });
});

try {
  world.beforeEvents.itemUse.subscribe((event) => {
    const player = event.source;
    if (!isPlayer(player) || creative(player)) return;
    const id = event.itemStack?.typeId ?? "";

    if (id === "minecraft:ender_pearl" && on("java_pearl_cooldown_enabled", true)) {
      const until = pearlCooldownUntil.get(player.id) ?? 0;
      if (system.currentTick < until) {
        event.cancel = true;
        const left = Math.max(1, until - system.currentTick);
        try {
          player.onScreenDisplay.setActionBar(`§cPearl cooldown §f${(left / 20).toFixed(1)}s`);
        } catch {}
        return;
      }
    }

    if ((id === "minecraft:egg" || id === "minecraft:snowball") && on("java_throwable_cooldown_enabled", true)) {
      const until = throwCooldownUntil.get(player.id) ?? 0;
      if (system.currentTick < until) {
        event.cancel = true;
        return;
      }
    }
  });
} catch (e) {
  console.warn("[JPVP] beforeEvents.itemUse unavailable; pearl/throwable cooldowns limited.", e);
}

try {
  world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    if (!isPlayer(player) || creative(player)) return;
    const id = event.itemStack?.typeId ?? "";

    if (id === "minecraft:ender_pearl" && on("java_pearl_cooldown_enabled", true)) {
      const ticks = Math.max(5, Math.min(40, Math.round(num("java_pearl_cooldown_ticks", 20, 5, 40))));
      pearlCooldownUntil.set(player.id, system.currentTick + ticks);
    }

    if ((id === "minecraft:egg" || id === "minecraft:snowball") && on("java_throwable_cooldown_enabled", true)) {
      const ticks = Math.max(1, Math.min(20, Math.round(num("java_throwable_cooldown_ticks", 4, 1, 20))));
      throwCooldownUntil.set(player.id, system.currentTick + ticks);
    }
  });
} catch (e) {
  console.warn("[JPVP] afterEvents.itemUse unavailable for throwable cooldown tracking.", e);
}

try {
  console.warn("[JPVP] Java parity module loaded (pearl CD, hit-interrupt, crit coyote, throwables)");
} catch {}

const pearlFallAt = new Map();
function applyPearlFall(player) {
  if (!player || player.typeId !== "minecraft:player" || !on("java_pearl_fall_damage", true)) return;
  const now = system.currentTick;
  if ((pearlFallAt.get(player.id) ?? -30) + 8 > now) return;
  pearlFallAt.set(player.id, now);
  system.run(() => {
    try {
      if (player.isValid === false) return;
      player.applyDamage(5, { cause: "fall" });
    } catch {}
  });
}
try {
  world.afterEvents.projectileHitBlock.subscribe((event) => {
    if (event.projectile?.typeId !== "minecraft:ender_pearl") return;
    const owner = event.source ?? event.projectile?.owner;
    applyPearlFall(owner);
  });
  world.afterEvents.projectileHitEntity.subscribe((event) => {
    if (event.projectile?.typeId !== "minecraft:ender_pearl") return;
    const owner = event.source ?? event.projectile?.owner;
    applyPearlFall(owner);
  });
} catch {}
