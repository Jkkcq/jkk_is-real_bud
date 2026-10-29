import { world, system, GameMode, BlockPermutation } from "@minecraft/server";
import { cfg } from "../engine/config.js";
const FACE = Object.freeze({
Down: { x: 0, y: -1, z: 0 }, Up: { x: 0, y: 1, z: 0 },
North: { x: 0, y: 0, z: -1 }, South: { x: 0, y: 0, z: 1 },
West: { x: -1, y: 0, z: 0 }, East: { x: 1, y: 0, z: 0 },
});
const INTERACTIVE = new Set([
"minecraft:chest", "minecraft:trapped_chest", "minecraft:ender_chest", "minecraft:barrel",
"minecraft:hopper", "minecraft:dropper", "minecraft:dispenser", "minecraft:furnace",
"minecraft:blast_furnace", "minecraft:smoker", "minecraft:brewing_stand", "minecraft:enchanting_table",
"minecraft:anvil", "minecraft:chipped_anvil", "minecraft:damaged_anvil", "minecraft:crafting_table",
"minecraft:cartography_table", "minecraft:fletching_table", "minecraft:smithing_table",
"minecraft:loom", "minecraft:stonecutter", "minecraft:grindstone", "minecraft:beacon",
"minecraft:lectern", "minecraft:noteblock", "minecraft:jukebox", "minecraft:bell",
"minecraft:lever", "minecraft:daylight_detector", "minecraft:daylight_detector_inverted",
"minecraft:repeater", "minecraft:comparator", "minecraft:unpowered_repeater", "minecraft:powered_repeater",
"minecraft:unpowered_comparator", "minecraft:powered_comparator",
"minecraft:bed", "minecraft:respawn_anchor", "minecraft:crafter", "minecraft:chiseled_bookshelf",
]);
function enabled() {
try {
const v = cfg.java_block_placement;
if (v !== undefined && v !== null) return v !== false;
} catch {}
try {
return world.getDynamicProperty("java_block_placement") !== false;
} catch {}
return true;
}
function isInteractive(block) {
if (!block?.typeId) return false;
const id = block.typeId;
if (INTERACTIVE.has(id)) return true;
if (id.endsWith("_bed") || id.endsWith("_shulker_box") || id.includes("shulker_box")) return true;
if (id.includes("button") || id.includes("door") || id.includes("fence_gate") || id.includes("trapdoor")) return true;
return false;
}
function isCreative(player) {
try {
const m = player.getGameMode();
if (m === GameMode.Creative || m === "Creative") return true;
if (typeof m === "string" && m.toLowerCase().includes("creative")) return true;
} catch {}
return false;
}
function itemIsBlock(item) {
if (!item?.typeId) return false;
try {
BlockPermutation.resolve(item.typeId);
return true;
} catch {
return false;
}
}
function faceOffset(face) {
if (!face) return undefined;
if (typeof face === "string" && FACE[face]) return FACE[face];
try {
const name = face?.toString?.() || String(face);
for (const key of Object.keys(FACE)) {
if (name.toLowerCase().includes(key.toLowerCase())) return FACE[key];
}
} catch {}
return undefined;
}
function getMainhand(player) {
try {
return player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
} catch {
return undefined;
}
}
function safeSubscribe(getSignal, handler) {
try {
const signal = getSignal();
if (typeof signal?.subscribe !== "function") return false;
signal.subscribe((event) => {
try { handler(event); } catch (e) {
console.warn("[JPVP] java_block_placement handler failed", e);
}
});
return true;
} catch {
return false;
}
}
function shouldCancelPlaceAgainstInteractive(player, clickedBlock) {
if (!enabled() || !player || !clickedBlock) return false;
try {
if (player.isSneaking) return false;
} catch {}
if (!isInteractive(clickedBlock)) return false;
const item = getMainhand(player);
if (!itemIsBlock(item)) return false;
return true;
}
function isFloatingPlacement(block) {
if (!block) return false;
const dim = block.dimension;
const { x, y, z } = block.location;
for (const d of Object.values(FACE)) {
try {
const n = dim.getBlock({ x: x + d.x, y: y + d.y, z: z + d.z });
if (!n) continue;
if (!n.isAir) return false;
} catch {}
}
return true;
}
safeSubscribe(() => world.beforeEvents?.playerPlaceBlock, (event) => {
if (!enabled()) return;
const player = event.player;
if (!player) return;
let clicked;
try {
const placed = event.block;
const off = faceOffset(event.face ?? event.blockFace);
if (placed && off) {
clicked = placed.dimension.getBlock({
x: placed.location.x - off.x,
y: placed.location.y - off.y,
z: placed.location.z - off.z,
});
}
if (!clicked && event.block && isInteractive(event.block) && !player.isSneaking) {
clicked = event.block;
}
} catch {}
if (shouldCancelPlaceAgainstInteractive(player, clicked)) {
event.cancel = true;
return;
}
try {
if (!isCreative(player) && event.block && isFloatingPlacement(event.block)) {
event.cancel = true;
}
} catch {}
});
console.warn("[JPVP] Java-style block placement active for main hand + offhand (config: java_block_placement)");