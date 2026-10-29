import { world, system, EquipmentSlot } from "@minecraft/server";
import { cfg } from "../engine/config.js";
const FIRE_BLOCKS = new Set([
"minecraft:fire",
"minecraft:soul_fire",
"minecraft:lava",
"minecraft:flowing_lava",
]);
const PROJECTILE_TYPES = new Set([
"minecraft:arrow",
"minecraft:snowball",
"minecraft:egg",
"minecraft:wind_charge_projectile",
"minecraft:thrown_trident",
"minecraft:ender_pearl",
]);
const RAIL_TYPES = new Set([
"minecraft:rail",
"minecraft:powered_rail",
"minecraft:golden_rail",
"minecraft:detector_rail",
"minecraft:activator_rail",
]);
const projectileFireExpiry = new Map();
const cartInteractionLock = new Set();
function enabled(setting) {
return cfg.tnt_minecarts_enabled !== false && cfg[setting] !== false;
}
function isValid(entity) {
try { return Boolean(entity?.isValid); } catch { return false; }
}
function getEquippable(player) {
try { return player.getComponent("minecraft:equippable"); } catch { return undefined; }
}
function placeCartAndConsume(player, dimension, location, slot) {
if (!isValid(player)) return false;
const equippable = getEquippable(player);
const currentItem = equippable?.getEquipment(slot);
if (currentItem?.typeId !== "rad:tnt_minecart") return false;
try {
dimension.spawnEntity("minecraft:tnt_minecart", location);
equippable.setEquipment(slot, undefined);
return true;
} catch {
return false;
}
}
function primeCartIfNearFire(dimension, location) {
const centerX = Math.floor(location.x);
const centerY = Math.floor(location.y);
const centerZ = Math.floor(location.z);
for (let dx = -2; dx <= 2; dx++) {
for (let dy = -1; dy <= 1; dy++) {
for (let dz = -2; dz <= 2; dz++) {
try {
const block = dimension.getBlock({ x: centerX + dx, y: centerY + dy, z: centerZ + dz });
if (!block || !FIRE_BLOCKS.has(block.typeId)) continue;
const primedCart = dimension.spawnEntity("minecraft:tnt_minecart", location);
primedCart.triggerEvent("minecraft:on_instant_prime");
return true;
} catch { }
}
}
}
return false;
}
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
if (!PROJECTILE_TYPES.has(entity.typeId)) return;
try {
if (entity.getComponent("minecraft:onfire")) {
projectileFireExpiry.set(entity.id, system.currentTick + 200);
}
} catch { }
});
system.runInterval(() => {
const tick = system.currentTick;
for (const [id, expiry] of projectileFireExpiry) {
if (expiry < tick) projectileFireExpiry.delete(id);
}
}, 100);
world.afterEvents.projectileHitEntity.subscribe(event => {
const projectile = event.projectile;
if (!projectile) return;
const fireExpiry = projectileFireExpiry.get(projectile.id);
projectileFireExpiry.delete(projectile.id);
if (!enabled("tnt_minecarts_projectiles") || !PROJECTILE_TYPES.has(projectile.typeId)) return;
let hitEntity;
try { hitEntity = event.getEntityHit()?.entity; } catch { return; }
if (hitEntity?.typeId !== "minecraft:tnt_minecart") return;
if (fireExpiry !== undefined && fireExpiry >= system.currentTick) return;
try {
if (isValid(hitEntity)) hitEntity.triggerEvent("despawn");
primeCartIfNearFire(event.dimension, event.location);
} catch { }
});
world.beforeEvents.explosion.subscribe(event => {
const source = event.source;
if (source?.typeId !== "minecraft:tnt_minecart" || !enabled("tnt_minecarts_chain_launch")) return;
const sourceId = source.id;
const location = { x: source.location.x, y: source.location.y, z: source.location.z };
const dimension = event.dimension;
system.runTimeout(() => {
let nearbyCarts = [];
try {
nearbyCarts = dimension.getEntities({ type: "minecraft:tnt_minecart", location, maxDistance: 7 });
} catch { return; }
for (const cart of nearbyCarts) {
if (cart.id === sourceId) continue;
system.runTimeout(() => {
try {
if (!isValid(cart)) return;
cart.teleport({ x: location.x, y: location.y + 2, z: location.z });
cart.triggerEvent("rad:inactive");
system.runTimeout(() => {
try {
if (isValid(cart)) cart.triggerEvent("minecraft:on_instant_prime");
} catch { }
}, 1);
} catch { }
}, 1);
}
}, 1);
});
world.beforeEvents.playerInteractWithBlock.subscribe(event => {
const { player, block } = event;
if (!enabled("tnt_minecarts_offhand") || cartInteractionLock.has(player.id)) return;
if (!RAIL_TYPES.has(block.typeId)) return;
const equippable = getEquippable(player);
if (equippable?.getEquipment(EquipmentSlot.Offhand)?.typeId !== "rad:tnt_minecart") return;
event.cancel = true;
cartInteractionLock.add(player.id);
const location = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
const dimension = block.dimension;
system.run(() => {
try { placeCartAndConsume(player, dimension, location, EquipmentSlot.Offhand); }
finally { cartInteractionLock.delete(player.id); }
});
});
world.beforeEvents.playerInteractWithEntity.subscribe(event => {
const { player, target } = event;
if (!enabled("tnt_minecarts_stackable") || cartInteractionLock.has(player.id)) return;
if (target.typeId !== "minecraft:tnt_minecart") return;
const equippable = getEquippable(player);
if (!equippable) return;
let slot;
if (equippable.getEquipment(EquipmentSlot.Mainhand)?.typeId === "rad:tnt_minecart") {
slot = EquipmentSlot.Mainhand;
} else if (equippable.getEquipment(EquipmentSlot.Offhand)?.typeId === "rad:tnt_minecart") {
slot = EquipmentSlot.Offhand;
}
if (slot === undefined) return;
event.cancel = true;
cartInteractionLock.add(player.id);
const location = { x: target.location.x, y: target.location.y, z: target.location.z };
const dimension = target.dimension;
system.run(() => {
try {
if (isValid(target)) placeCartAndConsume(player, dimension, location, slot);
} finally {
cartInteractionLock.delete(player.id);
}
});
});