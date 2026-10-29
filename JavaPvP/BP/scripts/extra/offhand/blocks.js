import { world, system, EquipmentSlot, BlockPermutation, GameMode, ItemStack } from "@minecraft/server";
import { cfg } from "../../engine/config.js";
import { onOffhandRightClick } from "../../engine/offhandRightClick.js";
const FACE = Object.freeze({
Down: { x: 0, y: -1, z: 0 }, Up: { x: 0, y: 1, z: 0 },
North: { x: 0, y: 0, z: -1 }, South: { x: 0, y: 0, z: 1 },
West: { x: -1, y: 0, z: 0 }, East: { x: 1, y: 0, z: 0 },
});
const PLANTS = new Set([
"minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern",
"minecraft:deadbush", "minecraft:snow_layer", "minecraft:fire", "minecraft:soul_fire",
"minecraft:vine", "minecraft:glow_lichen", "minecraft:seagrass", "minecraft:tall_seagrass",
"minecraft:kelp", "minecraft:kelp_plant", "minecraft:waterlily", "minecraft:azalea",
"minecraft:flowering_azalea", "minecraft:hanging_roots", "minecraft:crimson_roots",
"minecraft:warped_roots", "minecraft:nether_sprouts", "minecraft:crimson_fungus",
"minecraft:warped_fungus", "minecraft:brown_mushroom", "minecraft:red_mushroom",
"minecraft:torchflower", "minecraft:torchflower_crop", "minecraft:pitcher_plant",
"minecraft:pitcher_crop", "minecraft:wheat", "minecraft:carrots", "minecraft:potatoes",
"minecraft:beetroot", "minecraft:melon_stem", "minecraft:pumpkin_stem", "minecraft:sweet_berry_bush",
"minecraft:bamboo", "minecraft:sugar_cane", "minecraft:cocoa", "minecraft:reeds",
"minecraft:pink_petals", "minecraft:big_dripleaf", "minecraft:small_dripleaf",
"minecraft:spore_blossom", "minecraft:coral_fan", "minecraft:deadbush",
"minecraft:poppy", "minecraft:blue_orchid", "minecraft:allium", "minecraft:azure_bluet",
"minecraft:red_tulip", "minecraft:orange_tulip", "minecraft:white_tulip", "minecraft:pink_tulip",
"minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:lily_of_the_valley",
"minecraft:wither_rose", "minecraft:sunflower", "minecraft:lilac", "minecraft:rose_bush",
"minecraft:peony", "minecraft:oak_sapling", "minecraft:spruce_sapling", "minecraft:birch_sapling",
"minecraft:jungle_sapling", "minecraft:acacia_sapling", "minecraft:dark_oak_sapling",
"minecraft:cherry_sapling", "minecraft:mangrove_propagule",
]);
function debug(player, message) {
try { if (player.hasTag("offhand_debug")) player.onScreenDisplay.setActionBar(`§e[offhand] ${message}`); } catch { }
}
const pendingBreak = new Map();
const lastHandledTick = new Map();
const placing = new Set();
function isCreativeMode(player) {
try {
const m = player.getGameMode();
if (m === GameMode.Creative) return true;
if (m === "Creative" || m === "creative") return true;
if (typeof m === "string" && m.toLowerCase().includes("creative")) return true;
} catch {}
return false;
}
function isAdventureMode(player) {
try {
const m = player.getGameMode();
if (m === GameMode.Adventure) return true;
if (typeof m === "string" && m.toLowerCase().includes("adventure")) return true;
} catch {}
return false;
}
function isSpectatorMode(player) {
try {
const m = player.getGameMode();
if (m === GameMode.Spectator) return true;
if (typeof m === "string" && m.toLowerCase().includes("spectator")) return true;
} catch {}
return false;
}
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
"minecraft:bed", "minecraft:respawn_anchor", "minecraft:shulker_box",
"minecraft:undyed_shulker_box", "minecraft:crafter", "minecraft:chiseled_bookshelf",
]);
function isInteractiveBlock(block) {
if (!block?.typeId) return false;
const id = block.typeId;
if (INTERACTIVE.has(id)) return true;
if (id.endsWith("_bed") || id.endsWith("_shulker_box") || id.includes("button")
|| id.includes("door") || id.includes("fence_gate") || id.includes("trapdoor")) return true;
return false;
}
function javaPlacementEnabled() {
const v = cfg.java_block_placement;
if (v !== undefined && v !== null) return v !== false;
return cfg.offhand_block_java_targeting !== false;
}
function handsOf(player) {
try {
const inventory = player.getComponent("minecraft:inventory")?.container;
const equipment = player.getComponent("minecraft:equippable");
if (!inventory || !equipment) return undefined;
return {
main: inventory.getItem(player.selectedSlotIndex),
off: equipment.getEquipment(EquipmentSlot.Offhand),
inventory,
equipment,
};
} catch { return undefined; }
}
function isMainHandUseItem(item) {
if (!item) return false;
try {
return item.typeId === "minecraft:shield" || item.typeId === "bf:shield"
|| item.typeId === "jk:shield" || item.typeId === "minecraft:trident" || item.typeId === "bf:trident"
|| item.hasTag("bf:custom_shield") || item.hasTag("jk:custom_shield");
} catch {
return item.typeId === "minecraft:shield" || item.typeId === "bf:shield" || item.typeId === "jk:shield"
|| item.typeId === "minecraft:trident" || item.typeId === "bf:trident";
}
}
function placeablePermutation(item) {
if (!item?.typeId || item.typeId === "minecraft:shield") return undefined;
try { return BlockPermutation.resolve(item.typeId); } catch { return undefined; }
}
function reachFor(player) {
const raw = Number(cfg.offhand_block_reach ?? 6);
const configured = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 12)) : 6;
if (cfg.offhand_block_java_targeting === false) return configured;
return Math.min(configured, player.getGameMode() === GameMode.Creative ? 5 : 4.5);
}
function blockKey(dimensionId, block) {
try {
const { x, y, z } = block.location;
return `${dimensionId ?? block.dimension?.id ?? ""}:${x},${y},${z}`;
} catch { return undefined; }
}
function isReplaceable(block) {
if (!block) return false;
try {
if (block.isAir || block.isLiquid) return true;
if (cfg.offhand_block_replace_plants === false) return false;
if (PLANTS.has(block.typeId)) return true;
const permutation = block.permutation;
return Boolean(permutation?.hasTag("replaceable") || permutation?.hasTag("minecraft:replaceable"));
} catch { return false; }
}
function validHit(hit) {
const point = hit?.faceLocation;
return Boolean(hit?.block && FACE[hit.face] && point
&& [point.x, point.y, point.z].every(value => Number.isFinite(value) && value >= -0.001 && value <= 1.001));
}
function sameBlock(a, b) {
try {
return Boolean(a && b && a.location.x === b.location.x
&& a.location.y === b.location.y && a.location.z === b.location.z);
} catch { return false; }
}
function aimedBlock(player, maxDistance) {
try {
return player.getBlockFromViewDirection({ maxDistance, includeLiquidBlocks: true, includePassableBlocks: true });
} catch { return undefined; }
}
function clickTarget(player, event, maxDistance) {
if (event.kind === "entity") return undefined;
if (event.kind === "block" && event.block && FACE[event.face]) {
const exactRayHit = aimedBlock(player, maxDistance);
if (sameBlock(exactRayHit?.block, event.block) && exactRayHit.face === event.face && validHit(exactRayHit)) {
return exactRayHit;
}
if (validHit(event)) return event;
}
const hit = aimedBlock(player, maxDistance);
if (!validHit(hit)) return undefined;
if (event.kind !== "block") {
try {
const entityHit = player.getEntitiesFromViewDirection({ maxDistance })
.find(entry => entry?.entity && entry.entity.id !== player.id);
if (entityHit && Number.isFinite(entityHit.distance)
&& (!Number.isFinite(hit.distance) || entityHit.distance <= hit.distance + 0.001)) return undefined;
} catch { }
}
return hit;
}
function withinReach(player, hit, reach) {
try {
const eye = player.getHeadLocation();
const point = {
x: hit.block.location.x + hit.faceLocation.x,
y: hit.block.location.y + hit.faceLocation.y,
z: hit.block.location.z + hit.faceLocation.z,
};
const dx = eye.x - point.x, dy = eye.y - point.y, dz = eye.z - point.z;
return dx * dx + dy * dy + dz * dz <= (reach + 0.1) ** 2;
} catch { return false; }
}
function directionFromYaw(player) {
let yaw;
try { yaw = ((player.getRotation().y % 360) + 360) % 360; } catch { yaw = 0; }
if (yaw < 45 || yaw >= 315) return "south";
if (yaw < 135) return "west";
if (yaw < 225) return "north";
return "east";
}
function orient(permutation, player, face, point) {
if (cfg.offhand_block_orientation_enabled === false) return permutation;
let states;
try { states = permutation.getAllStates(); } catch { return permutation; }
let result = permutation;
const facing = directionFromYaw(player);
const stairFacing = { east: 0, west: 1, south: 2, north: 3 }[facing];
const upper = face === "Down" || (face !== "Up" && point.y > 0.5);
const has = name => Object.prototype.hasOwnProperty.call(states, name);
const apply = (name, value) => { result = result.withState(name, value); };
try {
if (has("minecraft:cardinal_direction")) apply("minecraft:cardinal_direction", facing);
if (has("minecraft:facing_direction")) {
const current = states["minecraft:facing_direction"];
const value = typeof current === "number"
? ({ down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 })[facing]
: facing;
apply("minecraft:facing_direction", value);
}
if (has("weirdo_direction")) apply("weirdo_direction", stairFacing);
if (has("direction")) apply("direction", { south: 0, west: 1, north: 2, east: 3 }[facing]);
if (has("upside_down_bit")) apply("upside_down_bit", upper);
if (has("top_slot_bit")) apply("top_slot_bit", upper);
if (has("minecraft:vertical_half")) apply("minecraft:vertical_half", upper ? "top" : "bottom");
if (has("pillar_axis")) {
const axis = face === "East" || face === "West" ? "x"
: face === "North" || face === "South" ? "z" : "y";
apply("pillar_axis", axis);
}
if (has("torch_facing_direction")) {
const torchFace = face === "Up" ? "top" : face === "Down" ? "unknown"
: ({ North: "south", South: "north", East: "west", West: "east" })[face];
apply("torch_facing_direction", torchFace ?? "unknown");
}
if (has("upper_block_bit")) apply("upper_block_bit", false);
if (has("head_piece_bit")) apply("head_piece_bit", false);
} catch { return permutation; }
return result;
}
function withWaterlogging(permutation, wasLiquid) {
if (!wasLiquid) return permutation;
try {
const states = permutation.getAllStates();
if (Object.prototype.hasOwnProperty.call(states, "waterlogged_bit")) return permutation.withState("waterlogged_bit", true);
if (Object.prototype.hasOwnProperty.call(states, "minecraft:waterlogged")) return permutation.withState("minecraft:waterlogged", true);
} catch { }
return permutation;
}
function intersectsPlayer(player, block) {
try {
const box = player.getAABB();
const x1 = box.center.x - box.extent.x, x2 = box.center.x + box.extent.x;
const y1 = box.center.y - box.extent.y, y2 = box.center.y + box.extent.y;
const z1 = box.center.z - box.extent.z, z2 = box.center.z + box.extent.z;
return x1 < block.location.x + 1 && x2 > block.location.x
&& y1 < block.location.y + 1 && y2 > block.location.y
&& z1 < block.location.z + 1 && z2 > block.location.z;
} catch { return false; }
}
function canPlaceInAdventure(player, item, clickedBlock) {
if (!isAdventureMode(player) || typeof item.getCanPlaceOn !== "function") return true;
try {
const allowed = item.getCanPlaceOn();
return Array.isArray(allowed) && allowed.includes(clickedBlock.typeId);
} catch { return false; }
}
function offhandConsumed(player, typeId, before) {
const now = handsOf(player)?.off;
return !now || (now.typeId === typeId && now.amount < before);
}
function consumeOffhand(player, typeId) {
if (isCreativeMode(player)) return true;
const hands = handsOf(player);
if (!hands?.off || hands.off.typeId !== typeId) return false;
const before = Math.max(1, Number(hands.off.amount) || 1);
try {
if (before <= 1) {
hands.equipment.setEquipment(EquipmentSlot.Offhand, undefined);
} else {
const next = new ItemStack(typeId, before - 1);
try {
if (hands.off.nameTag) next.nameTag = hands.off.nameTag;
} catch {}
hands.equipment.setEquipment(EquipmentSlot.Offhand, next);
}
} catch {}
if (offhandConsumed(player, typeId, before)) return true;
try {
const slot = hands.equipment.getEquipmentSlot?.(EquipmentSlot.Offhand);
if (slot) {
if (before <= 1) slot.setItem(undefined);
else {
try { slot.amount = before - 1; }
catch {
slot.setItem(new ItemStack(typeId, before - 1));
}
}
}
} catch {}
if (offhandConsumed(player, typeId, before)) return true;
try {
if (before <= 1) {
player.runCommand("replaceitem entity @s slot.weapon.offhand 0 air");
} else {
player.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${typeId} ${before - 1}`);
}
} catch {
try {
if (before <= 1) {
player.runCommand("item replace entity @s slot.weapon.offhand with air");
} else {
player.runCommand(`item replace entity @s slot.weapon.offhand with ${typeId} ${before - 1}`);
}
} catch {}
}
return offhandConsumed(player, typeId, before);
}
function prepareTargets(player, hit, item, base, now) {
if (javaPlacementEnabled()) {
if (!hit?.block || !FACE[hit.face] || !validHit(hit)) return undefined;
try {
if (isInteractiveBlock(hit.block) && !player.isSneaking) {
debug(player, "java style: sneak to place against interactive block");
return undefined;
}
} catch {}
}
let replaceClicked = cfg.offhand_block_direct_replace !== false && isReplaceable(hit.block);
if (javaPlacementEnabled()) {
replaceClicked = isReplaceable(hit.block) && (hit.block.isAir || hit.block.isLiquid
|| PLANTS.has(hit.block.typeId)
|| Boolean(hit.block.permutation?.hasTag?.("replaceable")
|| hit.block.permutation?.hasTag?.("minecraft:replaceable")));
}
const offset = replaceClicked ? { x: 0, y: 0, z: 0 } : FACE[hit.face];
if (!offset) return undefined;
const location = {
x: Math.floor(hit.block.location.x + offset.x),
y: Math.floor(hit.block.location.y + offset.y),
z: Math.floor(hit.block.location.z + offset.z),
};
let lower;
try { lower = player.dimension.getBlock(location); } catch { return undefined; }
if (!isReplaceable(lower)) return undefined;
if (!replaceClicked && typeof hit.block.canPlace === "function") {
try { if (!hit.block.canPlace(base, hit.face)) return undefined; } catch { }
}
const wasLiquid = Boolean(lower?.isLiquid);
let lowPermutation = withWaterlogging(orient(base, player, hit.face, hit.faceLocation), wasLiquid);
let targets = [{ block: lower, permutation: lowPermutation, oldPermutation: lower.permutation }];
const states = (() => { try { return lowPermutation.getAllStates(); } catch { return {}; } })();
if (Object.prototype.hasOwnProperty.call(states, "upper_block_bit")) {
const upperLocation = { x: location.x, y: location.y + 1, z: location.z };
let upper;
try { upper = player.dimension.getBlock(upperLocation); } catch { return undefined; }
if (!isReplaceable(upper) || (cfg.offhand_block_prevent_self_placement !== false && intersectsPlayer(player, upper))) return undefined;
let upperPermutation;
try { upperPermutation = lowPermutation.withState("upper_block_bit", true); } catch { return undefined; }
targets.push({ block: upper, permutation: upperPermutation, oldPermutation: upper.permutation });
}
if (cfg.offhand_block_prevent_self_placement !== false && targets.some(target => intersectsPlayer(player, target.block))) return undefined;
const cooldownRaw = Number(cfg.offhand_block_cooldown_ticks ?? 1);
const cooldown = Number.isFinite(cooldownRaw) ? Math.max(0, Math.min(20, Math.round(cooldownRaw))) : 1;
const last = lastHandledTick.get(player.id);
if (last !== undefined && now - last < cooldown) return { cooldown: true };
return { targets, clickedKey: blockKey(player.dimension?.id, hit.block), typeId: item.typeId };
}
function performPlacement(player, item, hit, now) {
const base = placeablePermutation(item);
if (!base) { debug(player, "item is not a placeable block"); return false; }
if (!validHit(hit)) { debug(player, "no valid target face"); return false; }
if (!withinReach(player, hit, reachFor(player))) { debug(player, "target out of reach"); return false; }
if (isSpectatorMode(player) || !canPlaceInAdventure(player, item, hit.block)) { debug(player, "game mode does not allow placing here"); return false; }
if (javaPlacementEnabled() && !validHit(hit)) { debug(player, "java style: look at a block face to place"); return false; }
const prepared = prepareTargets(player, hit, item, base, now);
if (!prepared) { debug(player, "space blocked or placement not allowed"); return false; }
if (prepared.cooldown) return true;
try {
for (const target of prepared.targets) target.block.setPermutation(target.permutation);
if (!consumeOffhand(player, item.typeId)) {
debug(player, "could not take the block from your offhand stack");
for (const target of prepared.targets.reverse()) target.block.setPermutation(target.oldPermutation);
return false;
}
} catch {
for (const target of prepared.targets.reverse()) {
try { target.block.setPermutation(target.oldPermutation); } catch { }
}
return false;
}
lastHandledTick.set(player.id, now);
if (prepared.clickedKey) {
pendingBreak.set(player.id, {
clickedKey: prepared.clickedKey,
itemTypeId: prepared.typeId,
expiresAt: now + 30,
});
}
return true;
}
onOffhandRightClick(event => {
const player = event?.player;
if (!player || cfg.offhand_enabled === false || cfg.offhand_blocks_enabled === false) return false;
if (placing.has(player.id)) return false;
const now = Number.isFinite(event.inputTick) ? event.inputTick : system.currentTick;
const hands = handsOf(player);
if (!hands?.off || isMainHandUseItem(hands.main) || placeablePermutation(hands.main)) return false;
const permutation = placeablePermutation(hands.off);
if (!permutation) return false;
if (lastHandledTick.get(player.id) === now) return true;
const hit = clickTarget(player, event, reachFor(player));
if (!hit) { debug(player, javaPlacementEnabled() ? "java style: aim at a block face (sneak near chests/doors)" : "no block in line of sight"); return false; }
const prior = pendingBreak.get(player.id);
const clickedKey = blockKey(player.dimension?.id, hit.block);
if (prior && (prior.expiresAt < now || prior.itemTypeId !== hands.off.typeId || prior.clickedKey !== clickedKey)) {
pendingBreak.delete(player.id);
}
placing.add(player.id);
try { return performPlacement(player, hands.off, hit, now); }
finally { placing.delete(player.id); }
});
try {
world.beforeEvents.playerBreakBlock.subscribe(event => {
const player = event?.player;
if (!player) return;
const pending = pendingBreak.get(player.id);
if (!pending) return;
const now = system.currentTick;
if (pending.expiresAt < now) {
pendingBreak.delete(player.id);
return;
}
const hands = handsOf(player);
if (hands?.off?.typeId !== pending.itemTypeId) {
pendingBreak.delete(player.id);
return;
}
const key = blockKey(event.dimension?.id ?? player.dimension?.id, event.block);
if (key !== pending.clickedKey) return;
event.cancel = true;
pendingBreak.delete(player.id);
});
} catch (error) {
console.warn("[JPVP] Offhand block break guard is unavailable.", error);
}
try {
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
pendingBreak.delete(playerId);
lastHandledTick.delete(playerId);
placing.delete(playerId);
});
} catch { }