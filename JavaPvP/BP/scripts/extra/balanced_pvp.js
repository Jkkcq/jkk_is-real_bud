import { world, system, EquipmentSlot } from "@minecraft/server";
import { cfg } from "../engine/config.js";
const PVP_COMBAT_TICKS = 600;
const FAST_ARROW_THRESHOLD = 2.2;
const LOGGER_TAG_PREFIX = "balanced_pvp_logger_";
const LOGGER_DEAD_PREFIX = "balanced_pvp_dead_";
const CRYSTAL_ITEM_IDS = new Set(["minecraft:end_crystal", "minecraft:ender_crystal"]);
const SPEAR_CAPS = {
wooden: 20,
stone: 24,
golden: 24,
copper: 28,
iron: 32,
diamond: 40,
netherite: 48,
};
const combatUntil = new Map();
const combatSnapshots = new Map();
const minecartCaps = new Map();
const pendingCartCaps = [];
const crystalOwnerMarks = [];
const crystalOwners = new Map();
const anchorOwnerMarks = [];
function safeSubscribe(name, getSignal, callback) {
try {
const signal = getSignal();
if (typeof signal?.subscribe !== "function") {
console.warn(`[JPVP] Balanced PvP event '${name}' is unavailable; skipping that optional hook.`);
return false;
}
signal.subscribe((event) => {
try {
callback(event);
} catch (error) {
console.warn(`[JPVP] Balanced PvP event '${name}' handler failed.`, error);
}
});
return true;
} catch (error) {
console.warn(`[JPVP] Could not subscribe to Balanced PvP event '${name}'.`, error);
return false;
}
}
function enabled() {
return cfg.balanced_pvp_enabled === true;
}
function isPlayer(entity) {
return entity?.typeId === "minecraft:player";
}
function safeGetComponent(entity, componentId) {
try { return entity?.getComponent(componentId); } catch { return undefined; }
}
function distanceSquared(a, b) {
const dx = a.x - b.x;
const dy = a.y - b.y;
const dz = a.z - b.z;
return dx * dx + dy * dy + dz * dz;
}
function getDimension(id) {
const rawId = String(id ?? "overworld");
const normalized = rawId.startsWith("minecraft:") ? rawId.slice("minecraft:".length) : rawId;
try { return world.getDimension(normalized); } catch { return world.getDimension(rawId); }
}
function hashName(name) {
let hash = 2166136261;
for (let index = 0; index < String(name).length; index++) {
hash = Math.imul(hash ^ String(name).charCodeAt(index), 16777619);
}
return (hash >>> 0).toString(16);
}
function loggerTag(name) {
return `${LOGGER_TAG_PREFIX}${hashName(name)}`;
}
function deadProperty(name) {
return `${LOGGER_DEAD_PREFIX}${hashName(name)}`;
}
function snapshotPlayer(player) {
try {
return {
id: player.id,
name: player.name,
dimensionId: player.dimension.id,
location: { x: player.location.x, y: player.location.y, z: player.location.z },
};
} catch {
return undefined;
}
}
function markInCombat(player) {
if (!isPlayer(player)) return;
combatUntil.set(player.id, system.currentTick + PVP_COMBAT_TICKS);
const snapshot = snapshotPlayer(player);
if (snapshot) combatSnapshots.set(player.id, snapshot);
}
function markPvpPair(attacker, target) {
if (!isPlayer(attacker) || !isPlayer(target) || attacker.id === target.id) return false;
markInCombat(attacker);
markInCombat(target);
return true;
}
function arrowSpeedCap(projectile) {
try {
const velocity = projectile.getVelocity();
const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
return speed >= FAST_ARROW_THRESHOLD ? 74 : 70;
} catch {
return 70;
}
}
function findNearbyMark(marks, entity, maxDistance) {
let best;
let bestDistance = maxDistance * maxDistance;
const location = entity.location;
const dimension = entity.dimension.id;
for (const mark of marks) {
if (mark.expires < system.currentTick || mark.dimensionId !== dimension) continue;
const currentDistance = distanceSquared(location, mark.location);
if (currentDistance <= bestDistance) {
best = mark;
bestDistance = currentDistance;
}
}
return best;
}
safeSubscribe("playerInteractWithBlock", () => world.beforeEvents?.playerInteractWithBlock, event => {
if (!enabled()) return;
const { block, player, itemStack } = event;
if (CRYSTAL_ITEM_IDS.has(itemStack?.typeId)) {
crystalOwnerMarks.push({
ownerId: player.id,
dimensionId: block.dimension.id,
location: { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 },
expires: system.currentTick + 10,
});
}
if (block.typeId === "minecraft:respawn_anchor" && !block.dimension.id.includes("nether")) {
anchorOwnerMarks.push({
ownerId: player.id,
dimensionId: block.dimension.id,
location: { x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5 },
expires: system.currentTick + 10,
});
}
});
safeSubscribe("playerPlaceBlock", () => world.afterEvents?.playerPlaceBlock, ({ player, block }) => {
if (!enabled() || block.typeId !== "minecraft:respawn_anchor") return;
anchorOwnerMarks.push({
ownerId: player.id,
dimensionId: block.dimension.id,
location: { x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5 },
expires: system.currentTick + 1200,
});
});
safeSubscribe("projectileHitEntity", () => world.afterEvents?.projectileHitEntity, event => {
if (!enabled()) return;
const projectile = event.projectile;
if (projectile?.typeId !== "minecraft:arrow") return;
let hitEntity;
try { hitEntity = event.getEntityHit()?.entity; } catch { return; }
if (hitEntity?.typeId !== "minecraft:tnt_minecart") return;
const owner = isPlayer(event.source) ? event.source : undefined;
const cap = arrowSpeedCap(projectile);
const mark = {
ownerId: owner?.id,
cap,
expires: system.currentTick + 200,
dimensionId: hitEntity.dimension.id,
location: { x: hitEntity.location.x, y: hitEntity.location.y, z: hitEntity.location.z },
};
minecartCaps.set(hitEntity.id, mark);
pendingCartCaps.push(mark);
});
safeSubscribe("entitySpawn", () => world.afterEvents?.entitySpawn, ({ entity }) => {
if (!enabled()) return;
if (entity.typeId === "minecraft:tnt_minecart") {
const mark = findNearbyMark(pendingCartCaps, entity, 3);
if (mark) minecartCaps.set(entity.id, mark);
} else if (entity.typeId === "minecraft:ender_crystal") {
const mark = findNearbyMark(crystalOwnerMarks, entity, 3);
if (mark) crystalOwners.set(entity.id, { ownerId: mark.ownerId, expires: system.currentTick + 1200 });
}
});
safeSubscribe("explosion", () => world.beforeEvents?.explosion, event => {
if (!enabled()) return;
const source = event.source;
if (source?.typeId !== "minecraft:tnt_minecart") return;
const sourceMark = minecartCaps.get(source.id);
if (!sourceMark?.ownerId) return;
const location = { x: source.location.x, y: source.location.y, z: source.location.z };
const dimension = event.dimension;
const sourceId = source.id;
system.runTimeout(() => {
try {
for (const cart of dimension.getEntities({ type: "minecraft:tnt_minecart", location, maxDistance: 7 })) {
if (cart.id !== sourceId) minecartCaps.set(cart.id, sourceMark);
}
} catch { }
}, 1);
});
function selectedItem(player) {
try {
const inventory = player.getComponent("minecraft:inventory")?.container;
return inventory?.getItem(player.selectedSlotIndex);
} catch { return undefined; }
}
function getEnchantmentLevel(item, name) {
try {
return Math.max(0, Number(item.getComponent("minecraft:enchantable")?.getEnchantment(name)?.level ?? 0));
} catch { return 0; }
}
function spearDamageCap(item) {
const id = String(item?.typeId ?? "").split(":").pop().toLowerCase();
for (const [tier, cap] of Object.entries(SPEAR_CAPS)) {
if (id === `${tier}_spear`) return cap;
}
return undefined;
}
function capDamage(event, cap) {
if (Number.isFinite(event.damage) && Number.isFinite(cap)) event.damage = Math.min(event.damage, cap);
}
function minecartPvPOwner(source, target) {
if (source?.typeId !== "minecraft:tnt_minecart") return undefined;
const mark = minecartCaps.get(source.id);
if (mark?.ownerId && mark.ownerId !== target.id && mark.expires >= system.currentTick) return mark;
return undefined;
}
function crystalPvPOwner(source, target) {
if (source?.typeId !== "minecraft:ender_crystal") return undefined;
const mark = crystalOwners.get(source.id);
if (mark?.ownerId && mark.ownerId !== target.id && mark.expires >= system.currentTick) return mark;
return undefined;
}
function nearbyAnchorPvPOwner(target) {
let best;
let bestDistance = 12 * 12;
for (const mark of anchorOwnerMarks) {
if (mark.expires < system.currentTick || mark.dimensionId !== target.dimension.id || mark.ownerId === target.id) continue;
const currentDistance = distanceSquared(target.location, mark.location);
if (currentDistance <= bestDistance) {
best = mark;
bestDistance = currentDistance;
}
}
return best;
}
safeSubscribe("entityHurt", () => world.beforeEvents?.entityHurt, event => {
if (!enabled()) return;
const target = event.hurtEntity;
if (!isPlayer(target)) return;
const source = event.damageSource?.damagingEntity;
const cause = event.damageSource?.cause;
let pvp = false;
let attacker;
if (isPlayer(source)) {
attacker = source;
pvp = markPvpPair(source, target);
}
const cartMark = minecartPvPOwner(source, target);
if (cartMark) {
pvp = true;
attacker = world.getPlayers().find(player => player.id === cartMark.ownerId);
markInCombat(target);
if (attacker && attacker.id !== target.id) markInCombat(attacker);
capDamage(event, cartMark.cap);
}
const crystalMark = crystalPvPOwner(source, target);
if (crystalMark) {
pvp = true;
attacker = world.getPlayers().find(player => player.id === crystalMark.ownerId);
markInCombat(target);
if (attacker && attacker.id !== target.id) markInCombat(attacker);
capDamage(event, 5);
}
const anchorMark = cause === "blockExplosion" ? nearbyAnchorPvPOwner(target) : undefined;
if (anchorMark) {
pvp = true;
attacker = world.getPlayers().find(player => player.id === anchorMark.ownerId);
markInCombat(target);
if (attacker && attacker.id !== target.id) markInCombat(attacker);
capDamage(event, 5);
}
if (!pvp || !isPlayer(attacker)) return;
const item = selectedItem(attacker);
if (cause === "maceSmash" && item?.typeId === "minecraft:mace") {
const density = getEnchantmentLevel(item, "density");
let strength = 0;
try { strength = Math.max(0, attacker.getEffect("strength")?.amplifier + 1 || 0); } catch { }
capDamage(event, 52 + density * 2 + strength * 3);
}
if (cause === "entityAttack") {
const cap = spearDamageCap(item);
if (cap !== undefined) capDamage(event, cap);
}
});
safeSubscribe("entityHurtAfter", () => world.afterEvents?.entityHurt, event => {
if (!enabled() || event.damageSource?.cause !== "maceSmash") return;
const target = event.hurtEntity;
const attacker = event.damageSource?.damagingEntity;
if (!isPlayer(target) || !isPlayer(attacker) || selectedItem(attacker)?.typeId !== "minecraft:mace") return;
try { target.removeEffect("absorption"); } catch { }
});
function combatLoggerFor(name) {
const tag = loggerTag(name);
for (const dimensionName of ["overworld", "nether", "the_end"]) {
try {
const logger = world.getDimension(dimensionName).getEntities({ type: "minecraft:armor_stand", tags: [tag] })[0];
if (logger) return logger;
} catch { }
}
return undefined;
}
function spawnCombatLogger(snapshot) {
try {
const dimension = getDimension(snapshot.dimensionId);
const logger = dimension.spawnEntity("minecraft:armor_stand", snapshot.location);
const tag = loggerTag(snapshot.name);
logger.addTag(tag);
logger.nameTag = snapshot.name;
} catch { }
}
safeSubscribe("playerLeave", () => world.afterEvents?.playerLeave, ({ playerId }) => {
const until = combatUntil.get(playerId) ?? 0;
const snapshot = combatSnapshots.get(playerId);
if (enabled() && until >= system.currentTick && snapshot) spawnCombatLogger(snapshot);
combatUntil.delete(playerId);
combatSnapshots.delete(playerId);
});
safeSubscribe("entityDie", () => world.afterEvents?.entityDie, ({ deadEntity }) => {
try {
const tag = deadEntity.getTags().find(value => value.startsWith(LOGGER_TAG_PREFIX));
if (!tag) return;
const hash = tag.slice(LOGGER_TAG_PREFIX.length);
world.setDynamicProperty(`${LOGGER_DEAD_PREFIX}${hash}`, true);
} catch { }
});
safeSubscribe("playerSpawn", () => world.afterEvents?.playerSpawn, ({ player }) => {
const deathProperty = deadProperty(player.name);
if (world.getDynamicProperty(deathProperty) === true) {
world.setDynamicProperty(deathProperty, false);
player.sendMessage("§cYour combat logger was killed while you were offline.");
system.run(() => {
try { player.kill(); } catch {
try { player.applyDamage(1000, { cause: "magic" }); } catch { }
}
});
return;
}
const logger = combatLoggerFor(player.name);
if (logger) {
try {
player.teleport(logger.location, { dimension: logger.dimension });
logger.remove();
player.sendMessage("§aYou rejoined before your combat logger was killed.");
} catch { }
}
});
function isStasisPearl(item) {
if (!item) return false;
try {
const typeId = String(item.typeId ?? "").toLowerCase();
const name = String(item.nameTag ?? "").toLowerCase();
const lore = item.getLore().join(" ").toLowerCase();
return typeId.includes("stasis") || name.includes("stasis") || lore.includes("stasis");
} catch { return false; }
}
function removeExtraStasisPearls(player) {
let keptOne = false;
const inventory = safeGetComponent(player, "minecraft:inventory")?.container;
if (inventory) {
for (let slot = 0; slot < inventory.size; slot++) {
const item = inventory.getItem(slot);
if (!isStasisPearl(item)) continue;
if (!keptOne) {
keptOne = true;
if (item.amount > 1) {
const single = item.clone();
single.amount = 1;
inventory.setItem(slot, single);
}
} else {
inventory.setItem(slot, undefined);
}
}
}
const equippable = safeGetComponent(player, "minecraft:equippable");
const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
if (isStasisPearl(offhand)) {
if (!keptOne) {
keptOne = true;
if (offhand.amount > 1) {
const single = offhand.clone();
single.amount = 1;
equippable.setEquipment(EquipmentSlot.Offhand, single);
}
} else {
equippable.setEquipment(EquipmentSlot.Offhand, undefined);
}
}
}
safeSubscribe("itemUse", () => world.afterEvents?.itemUse, event => {
if (!enabled() || (combatUntil.get(event.player.id) ?? 0) < system.currentTick) return;
const item = event.itemStack;
const isRod = String(item?.typeId ?? "").includes("fishing_rod");
if (isStasisPearl(item) || isRod) system.run(() => removeExtraStasisPearls(event.player));
});
system.runInterval(() => {
const tick = system.currentTick;
for (const [id, until] of combatUntil) if (until < tick) combatUntil.delete(id);
for (const [id, mark] of minecartCaps) if (mark.expires < tick) minecartCaps.delete(id);
for (const [id, mark] of crystalOwners) if (mark.expires < tick) crystalOwners.delete(id);
for (const marks of [pendingCartCaps, crystalOwnerMarks, anchorOwnerMarks]) {
for (let index = marks.length - 1; index >= 0; index--) {
if (marks[index].expires < tick) marks.splice(index, 1);
}
}
}, 100);