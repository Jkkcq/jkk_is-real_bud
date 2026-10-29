import { world, system } from "@minecraft/server";
import { cfg } from '../engine/config.js';
import { onOffhandInteractRelease } from '../engine/offhandRightClick.js';
import { OFFHAND_INTERACT_HOLD_ITEMS } from './offhand/listed_items.js';
const xpUseLocks = new Map();
function holdXpUseLock(player) {
const previous = xpUseLocks.get(player.id);
if (previous !== undefined) system.clearRun(previous);
const release = system.runTimeout(() => xpUseLocks.delete(player.id), 40);
xpUseLocks.set(player.id, release);
}
onOffhandInteractRelease(({ player, releaseKind }) => {
if (!player?.id || releaseKind !== "release") return false;
const timeout = xpUseLocks.get(player.id);
if (timeout !== undefined) system.clearRun(timeout);
return xpUseLocks.delete(player.id);
});
try {
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
const timeout = xpUseLocks.get(playerId);
if (timeout !== undefined) system.clearRun(timeout);
xpUseLocks.delete(playerId);
});
} catch { }
function handleExperienceBottleUse(event) {
const { source: player, itemStack: item } = event;
const xpFast = cfg.xp_fast;
if (!xpFast) return;
if (player.isSneaking || item?.typeId !== "minecraft:experience_bottle" || !OFFHAND_INTERACT_HOLD_ITEMS.has(item.typeId)) return;
if (xpUseLocks.has(player.id)) {
holdXpUseLock(player);
return;
}
const inv = player.getComponent("minecraft:inventory")?.container;
if (!inv) return;
const slotIndex = player.selectedSlotIndex;
const stack = inv.getItem(slotIndex);
const xpSpeed = Math.max(1, cfg.xp_speed);
if (!stack || stack.typeId !== "minecraft:experience_bottle" || stack.amount < xpSpeed) return;
holdXpUseLock(player);
const remaining = stack.amount - xpSpeed;
if (!player.matches({ gameMode: 'Creative' })) {
if (remaining > 0) {
stack.amount = remaining;
inv.setItem(slotIndex, stack);
} else {
inv.setItem(slotIndex, undefined);
}
}
if (!player.isValid) return;
const head = player.getHeadLocation();
const view = player.getViewDirection();
const spread = 0.08;
const throwsPerTick = [
Math.ceil(xpSpeed / 3),
Math.floor((xpSpeed + 1) / 3),
Math.floor(xpSpeed / 3)
];
let tick = 0;
function throwBottlesForTick(tickIdx) {
if (!player.isValid || tickIdx >= 3) return;
for (let i = 0; i < throwsPerTick[tickIdx]; i++) {
try {
const bottle = player.dimension.spawnEntity("minecraft:xp_bottle", head);
const projectile = bottle.getComponent("minecraft:projectile");
if (projectile) {
projectile.owner = player;
projectile.shoot({
x: view.x * 0.7 + (Math.random() - 0.5) * spread,
y: view.y * 0.2 + 0.25 + (Math.random() - 0.5) * spread * 0.5,
z: view.z * 0.7 + (Math.random() - 0.5) * spread
});
}
player.playSound("random.bow", { volume: 0.5, pitch: 0.5 });
} catch(e) {}
}
if (tickIdx < 2) {
system.runTimeout(() => throwBottlesForTick(tickIdx + 1), 1);
}
}
throwBottlesForTick(0);
}
world.afterEvents.itemUse.subscribe(handleExperienceBottleUse);
export function checkXp(player) {
if (!cfg.xp_auto_pull) return;
const playerLoc = player.location;
const orbs = player.dimension.getEntities({
type: "minecraft:xp_orb",
location: playerLoc,
maxDistance: 4
});
for (const orb of orbs) {
orb.teleport(playerLoc);
}
}