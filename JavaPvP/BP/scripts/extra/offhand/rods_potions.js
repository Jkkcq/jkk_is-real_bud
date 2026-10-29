import { EquipmentSlot, GameMode, ItemStack, Potions, system, world } from "@minecraft/server";
import { cfg } from "../../engine/config.js";
import { onOffhandRightClick } from "../../engine/offhandRightClick.js";
const FISHING_ROD = "minecraft:fishing_rod";
const POTION_TYPES = new Set([
"minecraft:potion",
"minecraft:splash_potion",
"minecraft:lingering_potion"
]);
const WEAPON_TAGS = ["bf:custom_shield_usable", "jk:custom_shield_usable"];
const INTERACTABLE_BLOCK_WORDS = [
"chest", "furnace", "door", "trapdoor", "button", "lever", "gate",
"table", "smoker", "hopper", "dispenser", "dropper", "barrel", "loom",
"grindstone", "anvil", "bed", "shulker", "brewing", "beacon", "bell"
];
const FISH_WEIGHTS = [
["minecraft:cod", 60],
["minecraft:salmon", 25],
["minecraft:pufferfish", 13],
["minecraft:tropical_fish", 2]
];
const lastActionTick = new Map();
const activeHooks = new Map();
const hookStateById = new Map();
const drinking = new Map();
const thrownPotions = new Map();
const lingeringClouds = [];
function isValid(entity) {
try {
return typeof entity?.isValid === "function" ? entity.isValid() : entity?.isValid !== false;
} catch {
return false;
}
}
function hasTag(item, tag) {
try { return Boolean(item?.hasTag(tag)); } catch { return false; }
}
function getHands(player) {
try {
const inventory = player.getComponent("minecraft:inventory")?.container;
const equippable = player.getComponent("minecraft:equippable");
if (!inventory || !equippable) return undefined;
return {
inventory,
equippable,
mainhand: inventory.getItem(player.selectedSlotIndex),
offhand: equippable.getEquipment(EquipmentSlot.Offhand)
};
} catch {
return undefined;
}
}
function allowedMainhand(item) {
return WEAPON_TAGS.some((tag) => hasTag(item, tag));
}
function canUseInteract(event) {
if (event?.kind === "entity") return false;
if (event?.kind !== "block") return true;
const blockId = String(event.block?.typeId ?? "");
return !INTERACTABLE_BLOCK_WORDS.some((word) => blockId.includes(word));
}
function takeActionLock(player, inputTick, ticks) {
const now = Number.isFinite(inputTick) ? inputTick : system.currentTick;
const previous = lastActionTick.get(player.id);
if (previous !== undefined && now - previous < ticks) return false;
lastActionTick.set(player.id, now);
return true;
}
function setOffhand(player, item) {
const equippable = player.getComponent("minecraft:equippable");
if (!equippable) return false;
try {
if (equippable.setEquipment(EquipmentSlot.Offhand, item) === false) throw new Error("Offhand rejected item");
return true;
} catch {
if (!item) return false;
try {
player.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${item.typeId} ${item.amount}`);
return true;
} catch {
return false;
}
}
}
function isCreative(player) {
try { return player.getGameMode() === GameMode.Creative; } catch { return false; }
}
function removeOneOffhand(player, original) {
if (isCreative(player)) return true;
const current = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
if (!current || current.typeId !== original.typeId) return false;
const remaining = current.amount - 1;
if (remaining > 0) {
const copy = current.clone();
copy.amount = remaining;
return setOffhand(player, copy);
}
try {
if (player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Offhand, undefined) !== false) return true;
} catch { }
try {
player.runCommand("replaceitem entity @s slot.weapon.offhand 0 air");
return true;
} catch {
return false;
}
}
function potionInfo(item) {
try {
const component = item?.getComponent("minecraft:potion");
const effectId = component?.potionEffectType?.id;
if (!effectId) return undefined;
return { typeId: item.typeId, effectId: String(effectId) };
} catch {
return undefined;
}
}
function effectDescription(effectId) {
try {
const potionEffect = Potions.getEffectType(effectId);
if (!potionEffect) return undefined;
const raw = String(potionEffect.id ?? effectId).split(":").pop();
const isStrong = raw.startsWith("strong_");
const name = raw.replace(/^(long_|strong_)/, "");
const aliases = {
nightvision: "night_vision",
swiftness: "speed",
leaping: "jump_boost",
healing: "instant_health",
harming: "instant_damage",
infestation: "infested"
};
return {
name,
effect: `minecraft:${aliases[name] ?? name}`,
duration: Math.max(1, Number(potionEffect.durationTicks) || 1),
amplifier: isStrong ? 1 : 0
};
} catch {
return undefined;
}
}
function applyPotionEffect(entity, effectId, durationScale = 1) {
if (!isValid(entity) || effectId.endsWith(":water")) return;
const data = effectDescription(effectId);
if (!data) return;
const duration = Math.max(1, Math.round(data.duration * durationScale));
try {
if (data.name === "turtle_master") {
const strong = data.amplifier > 0;
entity.addEffect("minecraft:slowness", duration, { amplifier: strong ? 5 : 3, showParticles: true });
entity.addEffect("minecraft:resistance", duration, { amplifier: strong ? 3 : 2, showParticles: true });
return;
}
if (data.name === "slowness" && data.amplifier > 0) data.amplifier = 3;
entity.addEffect(data.effect, duration, { amplifier: data.amplifier, showParticles: true });
} catch { }
}
function giveEmptyBottle(player) {
const bottle = new ItemStack("minecraft:glass_bottle", 1);
const inventory = player.getComponent("minecraft:inventory")?.container;
try {
const leftover = inventory?.addItem(bottle);
if (leftover) player.dimension.spawnItem(leftover, player.location);
} catch {
try { player.dimension.spawnItem(bottle, player.location); } catch { }
}
}
function finishDrink(player, info, originalAmount) {
applyPotionEffect(player, info.effectId);
try { player.playSound("random.burp", { volume: 0.7 }); } catch { }
if (isCreative(player)) return;
const current = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
if (!current || current.typeId !== info.typeId) return;
if (originalAmount > 1 && current.amount > 1) {
const remainder = current.clone();
remainder.amount--;
if (setOffhand(player, remainder)) giveEmptyBottle(player);
return;
}
if (!setOffhand(player, new ItemStack("minecraft:glass_bottle", 1))) giveEmptyBottle(player);
}
function startDrink(player, item, info) {
if (drinking.has(player.id)) return true;
drinking.set(player.id, {
typeId: item.typeId,
amount: item.amount,
info,
startedAt: system.currentTick
});
try { player.playSound("random.drink", { volume: 0.7 }); } catch { }
return true;
}
function getProjectileStart(player) {
const direction = player.getViewDirection();
const head = player.getHeadLocation();
return {
direction,
location: {
x: head.x + direction.x * 0.45,
y: head.y + direction.y * 0.45,
z: head.z + direction.z * 0.45
}
};
}
function throwPotion(player, item, info) {
const { direction, location } = getProjectileStart(player);
let projectile;
try {
const entityType = item.typeId === "minecraft:lingering_potion"
? "minecraft:lingering_potion"
: "minecraft:splash_potion";
projectile = player.dimension.spawnEntity(entityType, location);
const component = projectile.getComponent("minecraft:projectile");
if (!component) throw new Error("Potion entity has no projectile component");
component.owner = player;
component.shoot({ x: direction.x * 1.15, y: direction.y * 1.15 - 0.15, z: direction.z * 1.15 });
} catch {
try { projectile?.remove(); } catch { }
return false;
}
thrownPotions.set(projectile.id, {
effectId: info.effectId,
lingering: item.typeId === "minecraft:lingering_potion",
dimension: player.dimension,
expiresAt: system.currentTick + 1200
});
if (!removeOneOffhand(player, item)) {
thrownPotions.delete(projectile.id);
try { projectile.remove(); } catch { }
return false;
}
try { player.playSound("random.bow", { volume: 0.5, pitch: 0.9 }); } catch { }
return true;
}
function applySplash(dimension, location, effectId, radius, scale = 1) {
let entities = [];
try { entities = dimension.getEntities({ location, maxDistance: radius }); } catch { return; }
for (const entity of entities) {
try {
if (!entity.getComponent("minecraft:health")) continue;
const dx = entity.location.x - location.x;
const dy = entity.location.y - location.y;
const dz = entity.location.z - location.z;
const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
const distanceScale = Math.max(0.25, 1 - distance / (radius * 1.5));
applyPotionEffect(entity, effectId, scale * distanceScale);
} catch { }
}
}
function handlePotionImpact(event) {
const projectile = event?.projectile;
const data = projectile && thrownPotions.get(projectile.id);
if (!data) return;
thrownPotions.delete(projectile.id);
const location = event.location ?? projectile.location;
const dimension = event.dimension ?? data.dimension;
if (data.lingering) {
lingeringClouds.push({
dimension,
location,
effectId: data.effectId,
expiresAt: system.currentTick + 600,
nextApplyAt: system.currentTick,
affectedInstantEntities: new Set()
});
} else {
applySplash(dimension, location, data.effectId, 4);
}
}
function isWaterNear(dimension, location) {
const x = Math.floor(location.x);
const y = Math.floor(location.y);
const z = Math.floor(location.z);
for (let dx = -1; dx <= 1; dx++) {
for (let dy = -1; dy <= 1; dy++) {
for (let dz = -1; dz <= 1; dz++) {
try {
if (dimension.getBlock({ x: x + dx, y: y + dy, z: z + dz })?.typeId?.includes("water")) return true;
} catch { }
}
}
}
return false;
}
function giveFish(player) {
let roll = Math.random() * 100;
for (const [typeId, weight] of FISH_WEIGHTS) {
roll -= weight;
if (roll < 0) {
try { player.dimension.spawnItem(new ItemStack(typeId, 1), player.location); } catch { }
try { player.playSound("random.pop", { volume: 0.8, pitch: 1.2 }); } catch { }
return true;
}
}
return false;
}
function damageFishingRod(player) {
if (isCreative(player)) return;
const current = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
if (!current || current.typeId !== FISHING_ROD) return;
let unbreaking = 0;
try { unbreaking = current.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0; } catch { }
if (unbreaking > 0 && Math.random() >= 1 / (unbreaking + 1)) return;
try {
const durability = current.getComponent("minecraft:durability");
if (!durability) return;
const damage = durability.damage + 1;
if (damage >= durability.maxDurability) {
setOffhand(player, undefined);
return;
}
const replacement = current.clone();
replacement.getComponent("minecraft:durability").damage = damage;
setOffhand(player, replacement);
} catch { }
}
function pullEntityToPlayer(player, target) {
if (!isValid(target)) return;
if (target.typeId === "minecraft:item") {
try { target.teleport(player.location); } catch { }
return;
}
try {
const dx = player.location.x - target.location.x;
const dy = player.location.y - target.location.y;
const dz = player.location.z - target.location.z;
const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
target.applyImpulse({ x: dx / distance * 1.1, y: Math.max(0.2, dy / distance * 0.8), z: dz / distance * 1.1 });
} catch { }
}
function reelFishingRod(player, state) {
const hook = state.hook;
const hookLocation = isValid(hook) ? hook.location : state.hitLocation;
let caught = false;
if (isValid(state.hitEntity)) {
pullEntityToPlayer(player, state.hitEntity);
caught = true;
} else if (hookLocation && system.currentTick - state.castAt >= 100 && isWaterNear(state.dimension, hookLocation)) {
caught = giveFish(player);
} else if (state.hitLocation && !state.hitEntity) {
const dx = state.hitLocation.x - player.location.x;
const dy = state.hitLocation.y - player.location.y;
const dz = state.hitLocation.z - player.location.z;
const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
try { player.applyImpulse({ x: dx / distance * 0.75, y: Math.max(0.15, dy / distance * 0.5), z: dz / distance * 0.75 }); } catch { }
}
if (caught) damageFishingRod(player);
try { if (isValid(hook)) hook.remove(); } catch { }
activeHooks.delete(player.id);
if (hook?.id) hookStateById.delete(hook.id);
try { player.playSound("random.bow", { volume: 0.4, pitch: 1.2 }); } catch { }
return true;
}
function castFishingRod(player) {
const { direction, location } = getProjectileStart(player);
let hook;
try {
hook = player.dimension.spawnEntity("minecraft:fishing_hook", location);
const component = hook.getComponent("minecraft:projectile");
if (!component) throw new Error("Fishing hook has no projectile component");
component.owner = player;
component.shoot({ x: direction.x * 1.5, y: direction.y * 1.5, z: direction.z * 1.5 });
} catch {
try { hook?.remove(); } catch { }
return false;
}
const state = {
hook,
dimension: player.dimension,
castAt: system.currentTick,
hitEntity: undefined,
hitLocation: undefined
};
activeHooks.set(player.id, state);
hookStateById.set(hook.id, state);
try { player.playSound("random.bow", { volume: 0.5, pitch: 0.8 }); } catch { }
return true;
}
function useFishingRod(player) {
const active = activeHooks.get(player.id);
if (active && active.dimension === player.dimension && isValid(active.hook)) return reelFishingRod(player, active);
if (active?.hook?.id) hookStateById.delete(active.hook.id);
activeHooks.delete(player.id);
return castFishingRod(player);
}
onOffhandRightClick((event) => {
const player = event?.player;
if (!player || cfg.offhand_enabled === false || !canUseInteract(event)) return false;
const hands = getHands(player);
if (!hands?.offhand || !allowedMainhand(hands.mainhand)) return false;
if (hands.offhand.typeId === FISHING_ROD) {
if (cfg.offhand_projectiles_enabled === false) return false;
if (!takeActionLock(player, event.inputTick, 8)) return true;
if (!useFishingRod(player)) lastActionTick.delete(player.id);
return true;
}
if (!POTION_TYPES.has(hands.offhand.typeId)) return false;
const info = potionInfo(hands.offhand);
if (!info) return false;
if (hands.offhand.typeId === "minecraft:potion") {
if (cfg.offhand_foods_enabled === false) return false;
if (drinking.has(player.id)) return true;
if (!takeActionLock(player, event.inputTick, 36)) return true;
return startDrink(player, hands.offhand, info);
}
if (cfg.offhand_projectiles_enabled === false) return false;
if (!takeActionLock(player, event.inputTick, 8)) return true;
if (!throwPotion(player, hands.offhand, info)) lastActionTick.delete(player.id);
return true;
});
function safeSubscribe(getSignal, handler) {
try {
const signal = getSignal();
if (typeof signal?.subscribe === "function") signal.subscribe((event) => {
try { handler(event); } catch (error) { console.warn("[JPVP] Offhand item action failed.", error); }
});
} catch { }
}
safeSubscribe(() => world.afterEvents.projectileHitEntity, (event) => {
const state = hookStateById.get(event.projectile?.id);
if (state) state.hitEntity = event.hitEntity;
handlePotionImpact(event);
});
safeSubscribe(() => world.afterEvents.projectileHitBlock, (event) => {
const state = hookStateById.get(event.projectile?.id);
if (state) state.hitLocation = event.location;
handlePotionImpact(event);
});
system.runInterval(() => {
const tick = system.currentTick;
for (const [playerId, session] of drinking) {
const player = world.getAllPlayers().find((entry) => entry.id === playerId);
if (!isValid(player)) {
drinking.delete(playerId);
continue;
}
const item = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
if (!item || item.typeId !== session.typeId || item.amount !== session.amount) {
drinking.delete(playerId);
continue;
}
if (tick - session.startedAt < 32) continue;
finishDrink(player, session.info, session.amount);
drinking.delete(playerId);
}
for (let index = lingeringClouds.length - 1; index >= 0; index--) {
const cloud = lingeringClouds[index];
if (tick >= cloud.expiresAt) {
lingeringClouds.splice(index, 1);
continue;
}
if (tick < cloud.nextApplyAt) continue;
cloud.nextApplyAt = tick + 20;
try {
for (const entity of cloud.dimension.getEntities({ location: cloud.location, maxDistance: 3 })) {
if (!entity.getComponent("minecraft:health")) continue;
const instant = /:(healing|strong_healing|harming|strong_harming)$/.test(cloud.effectId);
if (instant && cloud.affectedInstantEntities.has(entity.id)) continue;
applyPotionEffect(entity, cloud.effectId, 0.25);
if (instant) cloud.affectedInstantEntities.add(entity.id);
}
} catch { }
}
for (const [id, potion] of thrownPotions) if (tick >= potion.expiresAt) thrownPotions.delete(id);
}, 1);
safeSubscribe(() => world.afterEvents.playerLeave, ({ playerId }) => {
lastActionTick.delete(playerId);
drinking.delete(playerId);
const state = activeHooks.get(playerId);
activeHooks.delete(playerId);
if (state?.hook?.id) hookStateById.delete(state.hook.id);
try { if (isValid(state?.hook)) state.hook.remove(); } catch { }
});