import { world, system, EquipmentSlot, ItemStack, GameMode } from "@minecraft/server";
import { cfg } from "../engine/config.js";
const DP = {
enabled: "cpvp_enabled",
lastHurt: "cpvp_last_hurt",
pearlFlash: "cpvp_pearl_flash",
hitCrystal: "cpvp_hit_crystal",
anchors: "cpvp_anchors",
airplace: "cpvp_airplace",
invulnTicks: "cpvp_invuln_ticks",
};
function on(key, def = true) {
try {
const v = cfg[key] ?? world.getDynamicProperty(DP[key] ?? key);
if (v === undefined || v === null) return def;
return Boolean(v);
} catch {
return def;
}
}
function invulnTicks() {
try {
const n = Number(cfg.cpvp_invuln_ticks ?? world.getDynamicProperty(DP.invulnTicks) ?? 10);
return Math.max(4, Math.min(20, n));
} catch {
return 10;
}
}
function cpvpOn() {
return on("cpvp_enabled", true);
}
const hurtState = new Map();
function getRawApprox(event) {
const d = Number(event.damage);
return Number.isFinite(d) ? Math.max(0, d) : 0;
}
function trackAndMaybeResidual(event) {
if (!cpvpOn() || !on("cpvp_last_hurt", true)) return;
const entity = event.hurtEntity;
if (!entity || entity.typeId !== "minecraft:player") return;
const now = system.currentTick;
const raw = getRawApprox(event);
if (raw <= 0) return;
const id = entity.id;
const st = hurtState.get(id);
if (st && now <= st.untilTick) {
if (raw > st.lastRaw + 0.05) {
const residual = raw - st.lastRaw;
st.lastRaw = raw;
} else {
st.blocked = true;
}
return;
}
hurtState.set(id, {
lastRaw: raw,
untilTick: now + invulnTicks(),
blocked: false,
});
}
function beforeHurtLastHurt(event) {
if (!cpvpOn() || !on("cpvp_last_hurt", true)) return;
const entity = event.hurtEntity;
if (!entity || entity.typeId !== "minecraft:player") return;
const now = system.currentTick;
const id = entity.id;
const st = hurtState.get(id);
const raw = getRawApprox(event);
if (!st || now > st.untilTick) {
system.run(() => {
hurtState.set(id, {
lastRaw: raw,
untilTick: system.currentTick + invulnTicks(),
blocked: false,
});
});
return;
}
if (raw <= st.lastRaw + 0.01) {
try { event.cancel = true; } catch {}
return;
}
const residual = raw - st.lastRaw;
st.lastRaw = raw;
try {
if (typeof event.damage === "number") {
event.damage = residual;
}
} catch {}
}
try {
world.beforeEvents.entityHurt.subscribe(beforeHurtLastHurt);
} catch {
try {
world.afterEvents.entityHurt.subscribe(trackAndMaybeResidual);
} catch {}
}
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
hurtState.delete(playerId);
});
const recentPearl = new Map();
function pearlFlash(player) {
if (!cpvpOn() || !on("cpvp_pearl_flash", true)) return;
if (!player || player.typeId !== "minecraft:player") return;
const now = system.currentTick;
if ((recentPearl.get(player.id) ?? -99) + 5 > now) return;
recentPearl.set(player.id, now);
try {
const hp = player.getComponent("minecraft:health");
if (hp && hp.currentValue > 1) {
player.applyDamage?.(1, { cause: "fall" });
}
} catch {
try {
player.addEffect("resistance", invulnTicks(), { amplifier: 4, showParticles: false });
} catch {}
}
hurtState.set(player.id, {
lastRaw: 1,
untilTick: system.currentTick + invulnTicks(),
blocked: false,
});
}
try {
world.afterEvents.projectileHitBlock.subscribe((ev) => {
try {
const proj = ev.projectile;
if (!proj || proj.typeId !== "minecraft:ender_pearl") return;
const owner = proj.owner ?? ev.source;
if (owner?.typeId === "minecraft:player") {
system.run(() => pearlFlash(owner));
}
} catch {}
});
} catch {}
try {
world.afterEvents.projectileHitEntity.subscribe((ev) => {
try {
const proj = ev.projectile;
if (!proj || proj.typeId !== "minecraft:ender_pearl") return;
const owner = proj.owner ?? ev.source;
if (owner?.typeId === "minecraft:player") {
system.run(() => pearlFlash(owner));
}
} catch {}
});
} catch {}
try {
world.afterEvents.entityHitEntity.subscribe((ev) => {
if (!cpvpOn() || !on("cpvp_hit_crystal", true)) return;
const hit = ev.hitEntity;
if (!hit || hit.typeId !== "minecraft:ender_crystal") return;
try {
if (hit.isValid) hit.triggerEvent("minecraft:crystal_explode");
} catch {
try { hit.kill?.(); } catch {}
}
});
} catch {}
const lastAnchorBoom = new Map();
function posKey(dimId, x, y, z) {
return `${dimId}|${Math.floor(x)}|${Math.floor(y)}|${Math.floor(z)}`;
}
function isCreative(player) {
try {
const m = player.getGameMode();
return m === GameMode.Creative || String(m).toLowerCase().includes("creative");
} catch {
return false;
}
}
function consumeOne(player, typeId) {
if (isCreative(player)) return true;
try {
const inv = player.getComponent("minecraft:inventory")?.container;
if (!inv) return false;
const slot = player.selectedSlotIndex;
const item = inv.getItem(slot);
if (item?.typeId === typeId) {
if (item.amount <= 1) inv.setItem(slot, undefined);
else {
item.amount -= 1;
inv.setItem(slot, item);
}
return true;
}
const eq = player.getComponent("minecraft:equippable");
const off = eq?.getEquipment(EquipmentSlot.Offhand);
if (off?.typeId === typeId) {
if (off.amount <= 1) eq.setEquipment(EquipmentSlot.Offhand, undefined);
else {
const next = new ItemStack(typeId, off.amount - 1);
eq.setEquipment(EquipmentSlot.Offhand, next);
}
return true;
}
} catch {}
return false;
}
function holding(player, typeId) {
try {
const inv = player.getComponent("minecraft:inventory")?.container;
const main = inv?.getItem(player.selectedSlotIndex);
if (main?.typeId === typeId) return true;
const off = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
return off?.typeId === typeId;
} catch {
return false;
}
}
function tryAnchorExplode(player, block) {
if (!cpvpOn() || !on("cpvp_anchors", true)) return false;
if (!block || block.typeId !== "minecraft:respawn_anchor") return false;
let charges = 0;
try {
charges = Number(block.permutation?.getState?.("respawn_anchor_charge") ?? 0);
} catch {}
if (charges <= 0) return false;
if (holding(player, "minecraft:glowstone")) return false;
const { x, y, z } = block.location;
const dim = block.dimension;
const key = posKey(dim.id, x, y, z);
try {
block.setType("minecraft:air");
} catch {
return false;
}
try {
dim.createExplosion(
{ x: x + 0.5, y: y + 0.5, z: z + 0.5 },
5,
{ breaksBlocks: true, causesFire: false, source: player }
);
} catch {
try {
dim.runCommand(`summon ender_crystal ${x} ${y} ${z}`);
} catch {}
}
lastAnchorBoom.set(key, { tick: system.currentTick, playerId: player.id, dimId: dim.id, x, y, z });
if (on("cpvp_airplace", true) && holding(player, "minecraft:respawn_anchor")) {
system.runTimeout(() => {
try {
if (!holding(player, "minecraft:respawn_anchor")) return;
const b = dim.getBlock({ x, y, z });
if (!b || (!b.isAir && !b.isLiquid)) return;
if (!consumeOne(player, "minecraft:respawn_anchor")) return;
b.setType("minecraft:respawn_anchor");
} catch {}
}, 1);
}
return true;
}
try {
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
try {
if (!cpvpOn() || !on("cpvp_anchors", true)) return;
const player = event.player;
const block = event.block;
if (!player || !block) return;
if (block.typeId !== "minecraft:respawn_anchor") return;
let charges = 0;
try {
charges = Number(block.permutation?.getState?.("respawn_anchor_charge") ?? 0);
} catch {}
if (charges > 0 && !holding(player, "minecraft:glowstone")) {
event.cancel = true;
system.run(() => tryAnchorExplode(player, block));
}
} catch {}
});
} catch {}
system.runInterval(() => {
const now = system.currentTick;
for (const [k, v] of lastAnchorBoom) {
if (now - v.tick > 40) lastAnchorBoom.delete(k);
}
for (const [id, st] of hurtState) {
if (now > st.untilTick + 40) hurtState.delete(id);
}
}, 40);
system.run(() => {
try {
world.sendMessage(
"§6[CPvP]§r mechanics loaded (pearl flash, lastHurt, hit-crystal, anchors/airplace). §7Config keys cpvp_*"
);
} catch {}
});