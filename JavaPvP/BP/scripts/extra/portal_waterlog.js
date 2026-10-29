import { world } from "@minecraft/server";
import { cfg } from '../engine/config.js';
const ADJACENT_DIRECTIONS = [
{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];
world.afterEvents.playerInteractWithBlock.subscribe(({ block, player, itemStack }) => {
if (!cfg.portal_waterlog_enabled) return;
if (!player || player.typeId !== "minecraft:player") return;
if (!itemStack || itemStack.typeId !== "minecraft:water_bucket") return;
if (!block || !block.location) return;
checkNearbyWaterAndPortals(player, block.location);
});
function checkNearbyWaterAndPortals(player, origin) {
const dim = player.dimension;
if (!dim) return;
const { x: px, y: py, z: pz } = origin;
for (let dx = -2; dx <= 2; dx++) {
for (let dy = -2; dy <= 2; dy++) {
for (let dz = -2; dz <= 2; dz++) {
const pos = {
x: Math.floor(px + dx),
y: Math.floor(py + dy),
z: Math.floor(pz + dz),
};
let block;
try {
block = dim.getBlock(pos);
} catch {
continue;
}
if (block?.typeId === "minecraft:water") {
if (checkAdjacentForPortals(pos, dim, player)) return;
}
}
}
}
}
function checkAdjacentForPortals(origin, dim, player) {
for (const offset of ADJACENT_DIRECTIONS) {
const target = {
x: origin.x + offset.x,
y: origin.y + offset.y,
z: origin.z + offset.z
};
let adjacentBlock;
try {
adjacentBlock = dim.getBlock(target);
} catch {
continue;
}
if (adjacentBlock?.typeId === "minecraft:portal") {
breakPortal(target, player);
return true;
}
}
return false;
}
function breakPortal(pos, player) {
const { x, y, z } = pos;
try {
const dim = player.dimension;
dim.getBlock({ x, y, z })?.setType("minecraft:air");
for (let dx = -5; dx <= 5; dx++) {
for (let dy = -5; dy <= 5; dy++) {
for (let dz = -5; dz <= 5; dz++) {
const bx = x + dx, by = y + dy, bz = z + dz;
const block = dim.getBlock({ x: bx, y: by, z: bz });
if (block && block.typeId === "minecraft:portal") {
block.setType("minecraft:air");
}
}
}
}
} catch (error) {
console.warn("Failed to break portal: " + error);
}
}