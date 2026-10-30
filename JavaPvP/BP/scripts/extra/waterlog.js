import { world, system } from "@minecraft/server";
import { cfg } from '../engine/config.js';
const DIRECTION_OFFSETS = {
Down: { x: 0, y: -1, z: 0 },
Up: { x: 0, y: 1, z: 0 },
North: { x: 0, y: 0, z: -1 },
South: { x: 0, y: 0, z: 1 },
West: { x: -1, y: 0, z: 0 },
East: { x: 1, y: 0, z: 0 },
};
const WEB_CHECK_OFFSETS = [
[0, 0, 0], [0, 1, 0], [0, -1, 0],
[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
];
function getDirectionOffset(direction) {
return DIRECTION_OFFSETS[direction] ?? { x: 0, y: 0, z: 0 };
}
function getBlockSafe(dimension, pos) {
if (pos.y < -64 || pos.y > 319) return null;
return dimension.getBlock(pos);
}
function safeSubscribe(name, getSignal, callback) {
try {
const signal = getSignal();
if (typeof signal?.subscribe !== "function") {
console.warn(`[JPVP] Waterlog event '${name}' is unavailable; skipping that optional hook.`);
return false;
}
signal.subscribe((event) => {
try {
callback(event);
} catch (error) {
console.warn(`[JPVP] Waterlog event '${name}' handler failed.`, error);
}
});
return true;
} catch (error) {
console.warn(`[JPVP] Could not subscribe to waterlog event '${name}'.`, error);
return false;
}
}
safeSubscribe("playerInteractWithBlock", () => world.afterEvents?.playerInteractWithBlock, (event) => {
const { source: player, block, beforeItemStack: item, itemStack } = event;
if (cfg.cobweb_enabled === false) return;
if (item?.typeId !== "minecraft:water_bucket" || block?.typeId !== "minecraft:web" || itemStack?.typeId !== "minecraft:bucket") return;
const aboveLocation = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
const blockAbove = block.dimension.getBlock(aboveLocation);
const preset = cfg.cobweb_preset;
if (preset === 0) {
block.setType("minecraft:air");
return;
}
if (!blockAbove || blockAbove.typeId !== "minecraft:air") {
block.setType("minecraft:air");
return;
}
block.setType("minecraft:air");
block.setType("minecraft:air");
blockAbove.setType("minecraft:water");
system.runTimeout(() => {
const waterBlock = block.dimension.getBlock(aboveLocation);
if (waterBlock?.typeId === "minecraft:water") {
waterBlock.setType("minecraft:flowing_water");
}
}, 2);
});
safeSubscribe("playerPlaceBlock", () => world.afterEvents?.playerPlaceBlock, (event) => {
const block = event.block;
if (cfg.cobweb_enabled === false) return;
if (block.typeId !== "minecraft:web") return;
const { location, dimension } = block;
for (const [dx, dy, dz] of WEB_CHECK_OFFSETS) {
const checkBlock = dimension.getBlock({
x: location.x + dx,
y: location.y + dy,
z: location.z + dz
});
if (checkBlock && (checkBlock.typeId === "minecraft:water" || checkBlock.typeId === "minecraft:flowing_water")) {
block.setType("minecraft:air");
return;
}
}
});
safeSubscribe("playerInteractWithBlockForDoors", () => world.afterEvents?.playerInteractWithBlock, ({ blockFace, block, player, beforeItemStack }) => {
if (!block || !player) return;
const underwaterDoors = cfg.underwater_doors_enabled;
if (!underwaterDoors) return;
const dimension = player.dimension;
const offset = getDirectionOffset(blockFace);
const faceLocation = {
x: block.x + offset.x,
y: block.y + offset.y,
z: block.z + offset.z
};
const faceBlockUp = getBlockSafe(dimension, { x: faceLocation.x, y: faceLocation.y + 1, z: faceLocation.z });
const faceBlock = getBlockSafe(dimension, faceLocation);
if (
beforeItemStack?.typeId.includes("_door") &&
!block.typeId.includes("_door") &&
faceBlock &&
(faceBlock.isWaterlogged || (faceBlockUp && faceBlockUp.isWaterlogged))
) {
faceBlock.setWaterlogged(false);
if (faceBlockUp) faceBlockUp.setWaterlogged(false);
}
});