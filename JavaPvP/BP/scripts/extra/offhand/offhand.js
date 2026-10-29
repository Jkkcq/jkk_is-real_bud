import { world, system, EquipmentSlot } from "@minecraft/server";
import { SWAPPABLE_FOOD_IDS2 } from '../../engine/offhand.js';
const SWAPPABLE_FOOD_SET = new Set(SWAPPABLE_FOOD_IDS2);
import { cfg } from '../../engine/config.js';
import { onOffhandRightClick, onOffhandInteractRelease } from '../../engine/offhandRightClick.js';
import { OFFHAND_SINGLE_EAT_PER_PRESS_ITEMS } from './listed_items.js';
function isOffhandEnabled() {
return cfg.offhand_enabled;
}
function isOffhandFoodsEnabled() {
return cfg.offhand_foods_enabled;
}
const food = {
"apple": { hunger: 4, saturation: 2.4, canEatAtFull: true },
"baked_potato": { hunger: 5, saturation: 6, canEatAtFull: false },
"beetroot": { hunger: 1, saturation: 1, canEatAtFull: false },
"beetroot_soup": { hunger: 6, saturation: 7.2, canEatAtFull: false },
"bread": { hunger: 5, saturation: 6, canEatAtFull: false },
"cake": { hunger: 2, saturation: 0.4, canEatAtFull: false },
"carrot": { hunger: 3, saturation: 3.6, canEatAtFull: false },
"chorus_fruit": { hunger: 4, saturation: 2.4, canEatAtFull: true },
"cooked_chicken": { hunger: 6, saturation: 7.2, canEatAtFull: false },
"cooked_cod": { hunger: 5, saturation: 6, canEatAtFull: false },
"cooked_mutton": { hunger: 6, saturation: 9.6, canEatAtFull: false },
"cooked_porkchop": { hunger: 8, saturation: 12.8, canEatAtFull: false },
"cooked_rabbit": { hunger: 5, saturation: 6, canEatAtFull: false },
"cooked_salmon": { hunger: 6, saturation: 9.6, canEatAtFull: false },
"cookie": { hunger: 2, saturation: 0.4, canEatAtFull: false },
"dried_kelp": { hunger: 1, saturation: 0.2, canEatAtFull: false },
"enchanted_golden_apple": {
hunger: 4, saturation: 9.6, canEatAtFull: true, effects: [
{ effect: "regeneration", duration: 400, amplifier: 1 },
{ effect: "absorption", duration: 2400, amplifier: 3 },
{ effect: "resistance", duration: 6000, amplifier: 0 },
{ effect: "fire_resistance", duration: 6000, amplifier: 0 }
]
},
"golden_apple": {
hunger: 4, saturation: 9.6, canEatAtFull: true, effects: [
{ effect: "regeneration", duration: 100, amplifier: 1 },
{ effect: "absorption", duration: 0, amplifier: 0, clear: true },
{ effect: "absorption", duration: 2400, amplifier: 0 }
]
},
"glow_berries": { hunger: 2, saturation: 0.4, canEatAtFull: false },
"golden_carrot": { hunger: 6, saturation: 14.4, canEatAtFull: false },
"honey_bottle": {
hunger: 6, saturation: 1.2, canEatAtFull: true, effects: [
{ effect: "poison", duration: 0, amplifier: 0, clear: true }
]
},
"melon_slice": { hunger: 2, saturation: 1.2, canEatAtFull: false },
"mushroom_stew": { hunger: 6, saturation: 7.2, canEatAtFull: false },
"poisonous_potato": {
hunger: 2, saturation: 1.2, canEatAtFull: false, effects: [
{ effect: "poison", duration: 100, amplifier: 0, chance: 0.6 }
]
},
"potato": { hunger: 1, saturation: 0.6, canEatAtFull: false },
"pufferfish": {
hunger: 1, saturation: 0.2, canEatAtFull: true, effects: [
{ effect: "poison", duration: 1200, amplifier: 3 },
{ effect: "hunger", duration: 300, amplifier: 2 },
{ effect: "nausea", duration: 300, amplifier: 0 }
]
},
"pumpkin_pie": { hunger: 8, saturation: 4.8, canEatAtFull: false },
"rabbit_stew": { hunger: 10, saturation: 12, canEatAtFull: false },
"beef": { hunger: 3, saturation: 1.8, canEatAtFull: false },
"chicken": {
hunger: 2, saturation: 1.2, canEatAtFull: false, effects: [
{ effect: "hunger", duration: 600, amplifier: 0, chance: 0.3 }
]
},
"cod": { hunger: 2, saturation: 0.4, canEatAtFull: false },
"mutton": { hunger: 2, saturation: 1.2, canEatAtFull: false },
"porkchop": { hunger: 3, saturation: 1.8, canEatAtFull: false },
"rabbit": { hunger: 3, saturation: 1.8, canEatAtFull: false },
"salmon": { hunger: 2, saturation: 0.4, canEatAtFull: false },
"rotten_flesh": {
hunger: 4, saturation: 0.8, canEatAtFull: false, effects: [
{ effect: "hunger", duration: 600, amplifier: 0, chance: 0.8 }
]
},
"spider_eye": {
hunger: 2, saturation: 3.2, canEatAtFull: false, effects: [
{ effect: "poison", duration: 100, amplifier: 0 }
]
},
"cooked_beef": { hunger: 8, saturation: 12.8, canEatAtFull: false },
"suspicious_stew": { hunger: 6, saturation: 7.2, canEatAtFull: true },
"sweet_berries": { hunger: 2, saturation: 1.2, canEatAtFull: false },
"tropical_fish": { hunger: 1, saturation: 0.2, canEatAtFull: false }
};
const use = new Map();
const foodUseRelease = new Map();
const eatenGoldenAppleThisHold = new Set();
onOffhandRightClick(({ player }) => {
if (!isOffhandEnabled() || !isOffhandFoodsEnabled() || !player?.isValid) return false;
const mainhand = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
const offhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
const mainOk = true;
if (!mainOk || !offhand || !SWAPPABLE_FOOD_IDS2.includes(offhand.typeId)) return false;
if (use.get(player.id)) return true;
use.set(player.id, true);
const previous = foodUseRelease.get(player.id);
if (previous !== undefined) system.clearRun(previous);
const release = system.runTimeout(() => {
use.set(player.id, false);
foodUseRelease.delete(player.id);
}, 1200);
foodUseRelease.set(player.id, release);
return true;
});
onOffhandInteractRelease(({ player }) => {
if (!player?.id) return false;
use.delete(player.id);
const release = foodUseRelease.get(player.id);
if (release !== undefined) system.clearRun(release);
foodUseRelease.delete(player.id);
eatenGoldenAppleThisHold.delete(player.id);
offhandEatState.delete(player.id);
stopConsumeAnim(player);
return true;
});
function getOffhandEatStartDelay() {
return Math.max(0, Math.min(40, Math.round(Number(cfg.offhand_eat_start_delay_ticks ?? 5))));
}
function getOffhandEatItemDelay() {
return Math.max(0, Math.min(40, Math.round(Number(cfg.offhand_eat_repeat_delay_ticks ?? 5))));
}
const offhandEatState = new Map();
const offhandFullSoundCooldown = new Map();
const offhandConsumeAnim = new Map();
const chorusOffhandCooldown = new Map();
const startConsumeAnim = (player) => {
if (offhandConsumeAnim.has(player.id)) return;
player.playAnimation("animation.food.consumable_offhand.eating_1st_pov", { blendOutTime: 0.1 });
offhandConsumeAnim.set(player.id, true);
};
const stopConsumeAnim = (player) => {
if (!offhandConsumeAnim.has(player.id)) return;
player.playAnimation("animation.food.consumable_offhand.position_1st_pov", { blendOutTime: 0.1 });
offhandConsumeAnim.delete(player.id);
};
system.runInterval(() => {
if (!isOffhandFoodsEnabled()) return;
const now = system.currentTick;
for (const player of world.getPlayers()) {
const equippable = player?.getComponent("minecraft:equippable");
if (!equippable) continue;
const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
if (!offhand || !SWAPPABLE_FOOD_SET.has(offhand.typeId)) {
offhandEatState.delete(player.id);
stopConsumeAnim(player);
continue;
}
if (eatenGoldenAppleThisHold.has(player.id) && OFFHAND_SINGLE_EAT_PER_PRESS_ITEMS.has(offhand.typeId)) {
offhandEatState.delete(player.id);
stopConsumeAnim(player);
continue;
}
let state = offhandEatState.get(player.id);
const eatStartDelay = getOffhandEatStartDelay();
const eatItemDelay = getOffhandEatItemDelay();
const foodKey = offhand.typeId.split(":").pop().replace("_offhand", "");
const foodData = food[foodKey];
const hunger = player.getComponent("player.hunger").currentValue;
const canEat = !!(foodData && (foodData.canEatAtFull || hunger < 20));
const shouldConsumeAnim = !!(use.get(player.id) && canEat);
if (shouldConsumeAnim) {
startConsumeAnim(player);
} else {
stopConsumeAnim(player);
}
if (use.get(player.id) && (!state || state.itemType !== offhand.typeId)) {
if (canEat) {
offhandEatState.set(player.id, { startTick: now, itemType: offhand.typeId, lastEatSoundTick: now, finishedTick: null });
state = offhandEatState.get(player.id);
} else {
offhandEatState.delete(player.id);
const lastFullSound = offhandFullSoundCooldown.get(player.id) ?? -10;
if (now - lastFullSound >= 10) {
player.playSound("bundle.insert_fail", { volume: 2 });
player.playSound("note.bass", { volume: 0.4 });
offhandFullSoundCooldown.set(player.id, now);
}
continue;
}
}
if (use.get(player.id) && state) {
if (state.finishedTick && now - state.finishedTick < eatItemDelay) {
if (now - state.finishedTick >= eatItemDelay - 1) {
offhandEatState.delete(player.id);
}
continue;
}
if (!state.finishedTick && now - state.startTick >= eatStartDelay && now - state.lastEatSoundTick >= 4) {
let foodName = foodKey.split(":").pop().replace("_offhand", "");
if (foodName === "rotten_flesh") {
foodName = "rotten_flesh2"
}
player.dimension.playSound("random.eat", player.location);
if (!player.hasTag("fopt_low_effects")) {
player.dimension.spawnParticle(`bf:eating_${foodName}`, { x: player.location.x, y: player.location.y + 1.5, z: player.location.z });
}
state.lastEatSoundTick = now;
offhandEatState.set(player.id, state);
}
if (!state.finishedTick && now - state.startTick >= 32) {
const foodKey = offhand.typeId.split(":").pop().replace("_offhand", "");
const foodData = food[foodKey];
if (foodData) {
player.dimension.playSound("random.burp", player.location);
const hunger = player.getComponent("player.hunger").currentValue ?? 20;
const saturation = player.getComponent("player.saturation").currentValue ?? 20;
if (foodData.canEatAtFull || hunger < 20) {
try {
player.getComponent("player.hunger").setCurrentValue(Math.min(hunger + foodData.hunger, 20));
player.getComponent("player.saturation").setCurrentValue(Math.min(saturation + foodData.saturation, 20));
} catch (e) {
player.getComponent("player.hunger").resetToMaxValue();
player.getComponent("player.saturation").resetToMaxValue();
}
if (foodData.effects) {
for (const eff of foodData.effects) {
if (eff.clear) {
player.removeEffect(eff.effect);
continue;
}
if (eff.chance && Math.random() > eff.chance) continue;
player.addEffect(eff.effect, eff.duration, { amplifier: eff.amplifier, showParticles: true });
}
}
if (offhand.typeId === "bf:chorus_fruit_offhand") {
const nowTick = system.currentTick;
const lastTick = chorusOffhandCooldown.get(player.id) ?? 0;
if (nowTick - lastTick >= 40) {
chorusOffhandCooldown.set(player.id, nowTick);
const pos = player.location;
let tries = 0;
let found = false;
while (tries < 8 && !found) {
const offsetX = (Math.random() * 16) - 8;
const offsetY = (Math.random() * 16) - 8;
const offsetZ = (Math.random() * 16) - 8;
const dest = { x: pos.x + offsetX, y: pos.y + offsetY, z: pos.z + offsetZ };
const block = player.dimension.getBlock({ x: Math.floor(dest.x), y: Math.floor(dest.y), z: Math.floor(dest.z) });
const blockDown = player.dimension.getBlock({ x: Math.floor(dest.x), y: Math.floor(dest.y - 1), z: Math.floor(dest.z) });
if (block && blockDown && blockDown.typeId !== "minecraft:air" && block.typeId === "minecraft:air") {
player.teleport(dest, player.dimension);
player.dimension.playSound("entity.enderman.teleport", dest);
found = true;
}
tries++;
}
}
}
if (offhand.amount > 1) {
offhand.amount--;
equippable.setEquipment(EquipmentSlot.Offhand, offhand);
} else {
equippable.setEquipment(EquipmentSlot.Offhand, undefined);
}
if (OFFHAND_SINGLE_EAT_PER_PRESS_ITEMS.has(offhand.typeId)) eatenGoldenAppleThisHold.add(player.id);
}
}
offhandEatState.set(player.id, { ...state, finishedTick: now });
continue;
}
if (!state.finishedTick && now - state.startTick > 200) {
offhandEatState.delete(player.id);
stopConsumeAnim(player);
continue;
}
} else {
offhandEatState.delete(player.id);
stopConsumeAnim(player);
}
}
}), 5;
world.beforeEvents.playerLeave.subscribe(({ player }) => {
const id = player.id;
use.delete(id);
delete use[id];
offhandEatState.delete(id);
eatenGoldenAppleThisHold.delete(id);
offhandConsumeAnim.delete(id);
offhandFullSoundCooldown.delete(id);
const release = foodUseRelease.get(id);
if (release !== undefined) system.clearRun(release);
foodUseRelease.delete(id);
if (globalThis._chorusOffhandCooldown) delete globalThis._chorusOffhandCooldown[id];
chorusOffhandCooldown.delete(id);
});