import { system, world } from "@minecraft/server";
import { cfg } from "../engine/config.js";
const caughtItems = new Map();
const ITEM_LIFETIME_TICKS = 200;
function enabled() {
try {
if (cfg.fishing_items_enabled === true) return true;
if (cfg.fishing_items_enabled === false) return false;
} catch {}
return world.getDynamicProperty("fishing_items_enabled") === true;
}
function isValid(entity) {
try {
return typeof entity?.isValid === "function" ? entity.isValid() : Boolean(entity?.isValid);
} catch {
return false;
}
}
function projectileOwner(projectile) {
try {
return projectile.getComponent("minecraft:projectile")?.owner;
} catch {
return undefined;
}
}
world.afterEvents.projectileHitBlock.subscribe((event) => {
if (!enabled() || event.projectile?.typeId !== "minecraft:fishing_hook") return;
const owner = event.source ?? projectileOwner(event.projectile);
if (owner?.typeId !== "minecraft:player") return;
const radius = Math.max(1, Math.min(8, Number(world.getDynamicProperty("fishing_items_radius") ?? 3)));
try {
const items = event.dimension.getEntities({
type: "minecraft:item",
location: event.location,
maxDistance: radius,
});
for (const item of items) {
if (isValid(item)) {
caughtItems.set(item.id, {
item,
ownerId: owner.id,
dimensionId: event.dimension.id,
expiresAt: system.currentTick + ITEM_LIFETIME_TICKS,
});
}
}
} catch (error) {
console.warn("[Jk's JPVP] Could not track fishing-hook item catches.", error);
}
});
world.afterEvents.itemUse.subscribe((event) => {
const player = event.source;
if (!enabled() || player?.typeId !== "minecraft:player" || event.itemStack?.typeId !== "minecraft:fishing_rod") return;
system.runTimeout(() => retrieveCaughtItems(player), 2);
});
function playerHasActiveHook(player) {
try {
return player.dimension.getEntities({ type: "minecraft:fishing_hook" }).some((hook) => {
return projectileOwner(hook)?.id === player.id;
});
} catch {
return true;
}
}
function retrieveCaughtItems(player) {
if (!enabled() || !isValid(player) || playerHasActiveHook(player)) return;
const pullStep = Math.max(1, Math.min(12, Number(world.getDynamicProperty("fishing_items_pull_step") ?? 4)));
const verticalBoost = Math.max(0, Math.min(4, Number(world.getDynamicProperty("fishing_items_vertical_boost") ?? 1)));
const target = player.location;
for (const [itemId, record] of caughtItems) {
if (record.expiresAt < system.currentTick || !isValid(record.item)) {
caughtItems.delete(itemId);
continue;
}
if (record.ownerId !== player.id || record.dimensionId !== player.dimension.id) continue;
try {
const itemLocation = record.item.location;
const dx = target.x - itemLocation.x;
const dy = target.y - itemLocation.y;
const dz = target.z - itemLocation.z;
const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
if (distance <= pullStep) {
record.item.teleport(target);
} else {
const scale = pullStep / distance;
record.item.teleport({
x: itemLocation.x + dx * scale,
y: itemLocation.y + dy * scale + verticalBoost,
z: itemLocation.z + dz * scale,
});
}
caughtItems.delete(itemId);
} catch (error) {
caughtItems.delete(itemId);
console.warn("[Jk's JPVP] Could not reel in a caught item.", error);
}
}
}
system.runInterval(() => {
for (const [itemId, record] of caughtItems) {
if (record.expiresAt < system.currentTick || !isValid(record.item)) caughtItems.delete(itemId);
}
}, 40);