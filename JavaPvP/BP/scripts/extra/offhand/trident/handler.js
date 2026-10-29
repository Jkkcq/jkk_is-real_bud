import {
EntityEquippableComponent,
EntityInventoryComponent,
EntityProjectileComponent,
EquipmentSlot,
GameMode,
ItemDurabilityComponent,
ItemEnchantableComponent,
system,
world
} from "@minecraft/server";
import { CustomTrident, waitTicks } from "./data";
import { TridentManager } from "./manager";
import { Weather } from "./weather";
import { setTempVars } from "../attachables_from_script.js";
import { ALLOWED_MAINHAND_TAG } from "../listed_items.js";
import { cfg } from "../../../engine/config.js";
Weather.initialize();
const playerChargeStates = new Map();
const playerRiptideTimestamps = new Map();
let riptideTimeoutId = undefined;
let chargeTimeoutId = undefined;
let isFullyCharged = false;
const interactSessions = new Map();
function isTrident(item) {
return item?.typeId === "bf:trident" || item?.typeId === "minecraft:trident";
}
function getChargeTicks() {
const value = Number(cfg.offhand_trident_charge_ticks ?? 10);
return Number.isFinite(value) ? Math.max(1, Math.min(40, Math.round(value))) : 10;
}
export function activateFromRightClick(source, itemStack) {
if (!source || source.typeId !== "minecraft:player" || !itemStack) return false;
if (cfg.offhand_tridents_enabled === false) return false;
let offhandItem;
try { offhandItem = source.getComponent(EntityEquippableComponent.componentId)?.getEquipment(EquipmentSlot.Offhand); } catch { return false; }
const mainhandTrident = isTrident(itemStack);
let comboWeapon = false;
try { comboWeapon = itemStack.hasTag(ALLOWED_MAINHAND_TAG) && offhandItem?.typeId === "bf:trident"; } catch {}
if (!mainhandTrident && cfg.offhand_enabled === false) return false;
if (!mainhandTrident && !comboWeapon) return false;
if (interactSessions.has(source.id)) return true;
const session = {
source,
itemStack,
started: false,
startRun: undefined,
fallbackRun: undefined,
};
interactSessions.set(source.id, session);
session.startRun = system.runTimeout(() => {
const active = interactSessions.get(source.id);
if (active !== session || !source.isValid) return;
session.started = true;
onItemStartUse({ source, itemStack });
}, 1);
if (mainhandTrident && itemStack.typeId === "minecraft:trident") {
session.fallbackRun = system.runTimeout(() => releaseFromRightClick(source), getChargeTicks() + 1);
}
return true;
}
export function releaseFromRightClick(source) {
const player = source?.player ?? source;
const session = interactSessions.get(player?.id);
if (!session) return false;
interactSessions.delete(player.id);
if (session.startRun !== undefined) system.clearRun(session.startRun);
if (session.fallbackRun !== undefined) system.clearRun(session.fallbackRun);
if (session.started && player?.isValid) {
onItemReleaseUse({ source: player, itemStack: session.itemStack });
}
return true;
}
export function onItemStartUse(data) {
const { source, itemStack } = data;
if (!itemStack) return;
const equippable = source.getComponent(EntityEquippableComponent.componentId);
const offhandSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
const offhandItem = offhandSlot?.getItem();
const playerId = source.id;
const isComboWeapon = itemStack.hasTag(ALLOWED_MAINHAND_TAG) && offhandItem?.typeId === "bf:trident";
const isMainhandTrident = isTrident(itemStack);
if (isComboWeapon || isMainhandTrident) {
if (playerChargeStates.has(playerId)) {
const oldState = playerChargeStates.get(playerId);
if (oldState.chargeTimeoutId !== undefined) {
system.clearRun(oldState.chargeTimeoutId);
}
}
setTempVars(source, { trident_1: 0.0, spam_reset: Math.random() });
system.runTimeout(() => {
if (!source?.isValid) return;
setTempVars(source, { trident_1: 1.0, spam_reset: Math.random() });
source.runCommand("playanimation @s animation.humanoid.custom_brandish_spear trident 1000");
}, 1);
const timeoutId = system.runTimeout(() => {
const currentState = playerChargeStates.get(playerId);
if (currentState) {
currentState.isFullyCharged = true;
currentState.chargeTimeoutId = undefined;
}
}, getChargeTicks());
playerChargeStates.set(playerId, {
isFullyCharged: false,
chargeTimeoutId: timeoutId
});
}
}
export function onItemReleaseUse(data) {
const { source, itemStack } = data;
if (!source?.isValid || !itemStack) return;
const playerId = source.id;
const playerState = playerChargeStates.get(playerId);
const isComboWeapon = itemStack.hasTag(ALLOWED_MAINHAND_TAG);
const isMainhandTrident = isTrident(itemStack);
if (!isComboWeapon && !isMainhandTrident) return;
if (playerState?.chargeTimeoutId !== undefined) {
system.clearRun(playerState.chargeTimeoutId);
}
setTempVars(source, { trident_1: 0.0, spam_reset: Math.random() });
source.runCommand("playanimation @s animation.player.bob trident 0.0");
if (!playerState || !playerState.isFullyCharged) {
playerChargeStates.delete(playerId);
return;
}
playerChargeStates.delete(playerId);
const equippable = source.getComponent(EntityEquippableComponent.componentId);
const activeSlot = isMainhandTrident
? equippable.getEquipmentSlot(EquipmentSlot.Mainhand)
: equippable.getEquipmentSlot(EquipmentSlot.Offhand);
const tridentItem = activeSlot?.getItem();
if (!isTrident(tridentItem)) return;
const tridentData = CustomTrident.find((f) => f.itemID == tridentItem.typeId);
if (!tridentData) return;
const enchComp = tridentItem.getComponent(ItemEnchantableComponent.componentId);
if (tridentData.riptide && (tridentData.riptide.needsEnchant === false || enchComp?.hasEnchantment("riptide"))) {
TridentManager.isInEnvironment(tridentData.riptide.environment, source).then((canRiptide) => {
if (!canRiptide) {
setTempVars(source, { trident_1: 0.0, spam_reset: Math.random() });
return;
}
if (riptideTimeoutId !== undefined) {
system.clearRun(riptideTimeoutId);
riptideTimeoutId = undefined;
}
const actionId = Date.now();
setTempVars(source, { trident_1: 0.0, trident_2: 0.0, trident_3: 0.0, spam_reset: actionId });
TridentManager.riptide(tridentData, enchComp, source);
system.runTimeout(() => {
if (!source?.isValid) return;
const currentSequenceId = Math.random();
playerRiptideTimestamps.set(source.id, Date.now());
setTempVars(source, {
trident_1: 0.0,
trident_2: 2.0,
trident_3: 3.0,
spam_reset: currentSequenceId
});
riptideTimeoutId = system.runTimeout(() => {
if (source?.isValid) {
setTempVars(source, {
trident_1: 0.0,
trident_2: 0.0,
trident_3: 0.0,
spam_reset: Date.now()
});
playerRiptideTimestamps.delete(source.id);
}
riptideTimeoutId = undefined;
}, 20);
}, 3);
});
return;
}
const durComp = tridentItem.getComponent(ItemDurabilityComponent.componentId);
if (!tridentData.projectile || durComp?.damage == durComp?.maxDurability) return;
const projectileData = tridentData.projectile;
const headLoc = source.getHeadLocation();
const projectile = source.dimension.spawnEntity(projectileData.entityID, { x: headLoc.x, y: 100, z: headLoc.z });
projectile.teleport(headLoc);
const projectileComp = projectile.getComponent(EntityProjectileComponent.componentId);
if (!projectileComp) {
projectile.remove();
return;
}
const itemData = TridentManager.getTridentItem(tridentItem);
const lore = tridentItem.getLore();
if (lore && lore.length > 0) {
itemData.lore = lore;
}
projectile.setDynamicProperty("item", JSON.stringify(itemData));
projectile.setDynamicProperty("originalSlotIndex", isMainhandTrident ? String(source.selectedSlotIndex) : "offhand");
projectile.setDynamicProperty("ownerID", source.id);
if (enchComp?.getEnchantments()[0]) projectile.setProperty('trident:is_enchanted', true);
const viewDir = source.getViewDirection();
try {
projectileComp.owner = source;
projectileComp.shoot({
x: viewDir.x * projectileData.thrownVelocity,
y: viewDir.y * projectileData.thrownVelocity,
z: viewDir.z * projectileData.thrownVelocity
});
} catch {
projectile.remove();
return;
}
if (source.getGameMode() !== GameMode.Creative) activeSlot.setItem(undefined);
const sound = projectileData.thrownSound;
if (sound) source.dimension.playSound(sound.id, source.location, { volume: sound.volume, pitch: sound.pitch });
}
system.runInterval(() => {
if (playerRiptideTimestamps.size === 0) return;
for (const player of world.getPlayers()) {
if (!player?.isValid) continue;
if (playerRiptideTimestamps.has(player.id)) {
const launchTime = playerRiptideTimestamps.get(player.id);
if (Date.now() - launchTime > 1000) {
if (!playerChargeStates.has(player.id)) {
setTempVars(player, {
trident_1: 0.0,
trident_2: 0.0,
trident_3: 0.0,
spam_reset: Date.now()
});
playerRiptideTimestamps.delete(player.id);
}
}
}
}
}, 20);
export function onProjectileHitBlock(data) {
const { projectile, dimension } = data;
if (!projectile || !TRIDENT_ENTITY_TYPE_SET.has(projectile.typeId)) return;
if (!projectile.isValid) return;
let itemDataRaw = projectile.getDynamicProperty("item");
if (!itemDataRaw) return;
const itemData = JSON.parse(itemDataRaw);
if (!itemData.enchantments) return;
const loyalty = itemData.enchantments.find((f) => f.id == "enchant.loyalty");
const channeling = itemData.enchantments.find((f) => f.id == "enchant.channeling");
if (loyalty) {
system.runTimeout(() => {
if (projectile && projectile.isValid) projectile.triggerEvent("custom_trident:returning");
});
}
const blockHitData = data.getBlockHit();
const block = blockHitData?.block;
if (channeling && block && Weather.currentWeather === "Thunder") {
if (block.typeId.includes("lightning_rod")) {
dimension.spawnEntity("minecraft:lightning_bolt", block.center());
}
}
}
export function onPlayerLeave(data) {
const charge = playerChargeStates.get(data.playerId);
if (charge?.chargeTimeoutId !== undefined) system.clearRun(charge.chargeTimeoutId);
playerChargeStates.delete(data.playerId);
playerRiptideTimestamps.delete(data.playerId);
const session = interactSessions.get(data.playerId);
if (session?.startRun !== undefined) system.clearRun(session.startRun);
if (session?.fallbackRun !== undefined) system.clearRun(session.fallbackRun);
interactSessions.delete(data.playerId);
}
export function onProjectileHitEntity(data) {
const { projectile, dimension } = data;
if (!projectile || !TRIDENT_ENTITY_TYPE_SET.has(projectile.typeId)) return;
if (!projectile.isValid) return;
let itemDataRaw = projectile.getDynamicProperty("item");
if (!itemDataRaw) return;
const itemData = JSON.parse(itemDataRaw);
if (TridentManager.reduceDurability(itemData) && itemData.durabilityDamage !== undefined) {
itemData.durabilityDamage += 1;
projectile.setDynamicProperty("item", JSON.stringify(itemData));
}
if (!itemData.enchantments) return;
const hitEntity = data.getEntityHit().entity;
const loyalty = itemData.enchantments.find((f) => f.id == "enchant.loyalty");
const channeling = itemData.enchantments.find((f) => f.id == "enchant.channeling");
if (loyalty) {
system.runTimeout(() => {
if (projectile && projectile.isValid) projectile.triggerEvent("custom_trident:returning");
}, waitTicks);
}
if (channeling && hitEntity && Weather.currentWeather === "Thunder") {
const entityLoc = hitEntity.location;
let topMostBlock = undefined;
try {
topMostBlock = dimension.getTopmostBlock({ x: entityLoc.x, z: entityLoc.z });
} catch { }
if (!topMostBlock || topMostBlock.location.y <= entityLoc.y + 1) {
dimension.spawnEntity("minecraft:lightning_bolt", entityLoc);
}
}
}
function copyItemProperties(data, toItem) {
if (data.lore) toItem.setLore(data.lore);
}
let TRIDENT_ENTITY_TYPE_SET;
const TRIDENT_ENTITY_TYPES = (() => {
const types = new Set();
for (const entry of CustomTrident) {
const id = entry?.projectile?.entityID;
if (typeof id === "string" && id.length > 0) types.add(id);
}
const list = [...types];
TRIDENT_ENTITY_TYPE_SET = new Set(list);
return list;
})();
const PICKUP_RADIUS = 2;
const PICKUP_RADIUS_SQUARED = PICKUP_RADIUS * PICKUP_RADIUS;
function collectTridentsByDimension() {
const byDimension = new Map();
if (TRIDENT_ENTITY_TYPES.length === 0) return byDimension;
const scanned = new Set();
for (const player of world.getPlayers()) {
if (!player?.isValid) continue;
const dimension = player.dimension;
if (!dimension || scanned.has(dimension.id)) continue;
scanned.add(dimension.id);
const found = [];
for (const type of TRIDENT_ENTITY_TYPES) {
try {
for (const entity of dimension.getEntities({ type })) found.push(entity);
} catch {
}
}
if (found.length > 0) byDimension.set(dimension.id, found);
}
return byDimension;
}
system.runInterval(() => {
const tridentsByDimension = collectTridentsByDimension();
if (tridentsByDimension.size === 0) return;
for (const player of world.getPlayers()) {
if (!player?.isValid) continue;
const dimension = player.dimension;
const candidates = dimension ? tridentsByDimension.get(dimension.id) : undefined;
if (candidates === undefined || candidates.length === 0) continue;
const { x, y, z } = player.location;
const centreY = y + 1;
const container = player.getComponent(EntityInventoryComponent.componentId)?.container;
if (!container) continue;
for (const tridentEntity of candidates) {
if (!tridentEntity?.isValid) continue;
const tridentLoc = tridentEntity.location;
const dx = tridentLoc.x - x;
const dy = tridentLoc.y - centreY;
const dz = tridentLoc.z - z;
if ((dx * dx + dy * dy + dz * dz) > PICKUP_RADIUS_SQUARED) continue;
const found = CustomTrident.find((f) => f.projectile?.entityID == tridentEntity.typeId);
if (!found || !TridentManager.canPickUp(tridentEntity)) continue;
const ownerID = tridentEntity.getDynamicProperty("ownerID");
if (ownerID != player.id) continue;
const itemDataRaw = tridentEntity.getDynamicProperty("item");
if (!itemDataRaw) continue;
const parsed = JSON.parse(itemDataRaw);
const originalSlotIndexStr = tridentEntity.getDynamicProperty("originalSlotIndex");
if (player.getGameMode() !== GameMode.Creative) {
const item = TridentManager.getItem(parsed);
copyItemProperties(parsed, item);
if (originalSlotIndexStr === "offhand") {
const equippable = player.getComponent(EntityEquippableComponent.componentId);
const offhandSlot = equippable?.getEquipmentSlot(EquipmentSlot.Offhand);
if (offhandSlot && !offhandSlot.getItem()) {
offhandSlot.setItem(item);
} else {
container.addItem(item);
}
} else {
const originalSlotIndex = originalSlotIndexStr ? parseInt(originalSlotIndexStr) : -1;
if (originalSlotIndex >= 0 && originalSlotIndex < container.size && !container.getItem(originalSlotIndex)) {
container.setItem(originalSlotIndex, item);
} else {
container.addItem(item);
}
}
dimension.playSound("random.pop", tridentEntity.location, { pitch: 1 + Math.random(), volume: 0.5 });
tridentEntity.remove();
} else {
dimension.playSound("random.pop", tridentEntity.location, { pitch: 1 + Math.random(), volume: 0.5 });
tridentEntity.remove();
}
}
}
}, 3);
export function onScriptEventReceive(data) {
if (data.id != "custom_trident:trident_return" && data.id != "custom_trident:trident_tick") return;
const tridentEntity = data.sourceEntity;
if (!tridentEntity || !tridentEntity.isValid) return;
const tridentData = CustomTrident.find((f) => f.projectile?.entityID == tridentEntity.typeId);
if (!tridentData) return;
if (data.id == "custom_trident:trident_return") {
let itemData = tridentEntity.getDynamicProperty("item");
if (!itemData) return;
itemData = JSON.parse(itemData);
if (!itemData.enchantments) return;
const loyalty = itemData.enchantments.find((f) => f.id == "enchant.loyalty");
if (!loyalty) return;
const ownerID = tridentEntity.getDynamicProperty("ownerID");
if (!ownerID) return;
const owner = TridentManager.getOwner(ownerID);
if (!owner || !owner.isValid) return;
const loc = tridentEntity.location;
let velocity = tridentData.projectile?.returnSpeed ?? 2;
velocity *= 2 + (loyalty.lvl * 0.25);
const ownerLoc = owner.location;
tridentEntity.teleport(loc, { facingLocation: { x: ownerLoc.x, y: ownerLoc.y + 1, z: ownerLoc.z } });
const viewDir = tridentEntity.getViewDirection();
tridentEntity.teleport({ x: loc.x + viewDir.x + (viewDir.x * velocity), y: loc.y + viewDir.y + (viewDir.y * velocity), z: loc.z + (viewDir.z * velocity) });
if (tridentEntity.getDynamicProperty("returning")) return;
tridentEntity.setDynamicProperty("returning", true);
if (tridentData.projectile?.onReturn) {
tridentData.projectile.onReturn(tridentEntity, tridentEntity.dimension, owner, loyalty.lvl);
}
if (tridentData.projectile?.returnSound) {
const sound = tridentData.projectile.returnSound;
if (owner.typeId == "minecraft:player") owner.playSound(sound.id, { volume: sound.volume, pitch: sound.pitch });
}
} else if (tridentEntity.location.y < -64) {
tridentEntity.runCommand("scriptevent custom_trident:trident_return");
}
}