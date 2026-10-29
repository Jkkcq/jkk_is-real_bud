import { EquipmentSlot, world } from "@minecraft/server";
import { cfg } from "../engine/config.js";
const ARMOR_SLOTS = [
EquipmentSlot.Head,
EquipmentSlot.Chest,
EquipmentSlot.Legs,
EquipmentSlot.Feet,
];
const IGNORED_CAUSES = new Set([
"drowning", "fall", "flyIntoWall", "freezing", "magic", "none", "override",
"selfDestruct", "starve", "suffocation", "temperature", "thorns", "void", "wither",
]);
function setting(key, fallback) {
try {
  if (cfg && cfg[key] !== undefined) return cfg[key];
} catch {}
const value = world.getDynamicProperty(key);
return value === undefined ? fallback : value;
}
function isValid(entity) {
try {
return typeof entity?.isValid === "function" ? entity.isValid() : Boolean(entity?.isValid);
} catch {
return false;
}
}
world.afterEvents.entityHurt.subscribe((event) => {
if (!setting("true_armor_durability_enabled", false) || !(event.damage > 0) || !isValid(event.hurtEntity)) return;
if (IGNORED_CAUSES.has(String(event.damageSource?.cause ?? ""))) return;
const entity = event.hurtEntity;
const isPlayer = entity.typeId === "minecraft:player";
if (isPlayer && !setting("true_armor_players", true)) return;
if (!isPlayer && !setting("true_armor_mobs", true)) return;
let equippable;
try {
equippable = entity.getComponent("minecraft:equippable");
} catch {
return;
}
if (!equippable) return;
const divisor = Math.max(1, Math.min(40, Number(setting("true_armor_damage_divisor", 4)) || 4));
const amount = Math.max(1, Math.floor(event.damage / divisor));
const fromEntity = Boolean(event.damageSource?.damagingEntity);
for (const slot of ARMOR_SLOTS) {
try {
damageArmorPiece(entity, equippable, slot, amount, fromEntity);
} catch (error) {
console.warn(`[Jk's JPVP] True Armor Durability failed for slot ${slot}.`, error);
}
}
});
function damageArmorPiece(entity, equippable, slot, amount, hitByEntity) {
const item = equippable.getEquipment(slot);
if (!item || (setting("true_armor_ignore_elytra", true) && item.typeId === "minecraft:elytra")) return;
const durability = item.getComponent("minecraft:durability");
if (!durability) return;
const enchantable = item.getComponent("minecraft:enchantable");
const unbreakingLevel = enchantable?.getEnchantment("unbreaking")?.level ?? 0;
const thornsLevel = enchantable?.getEnchantment("thorns")?.level ?? 0;
const lossChance = (60 + 40 / (unbreakingLevel + 1)) / 100;
let finalAmount = 0;
for (let index = 0; index < amount; index++) {
if (Math.random() < lossChance) finalAmount++;
}
if (thornsLevel > 0 && hitByEntity && finalAmount > 0) {
finalAmount += Math.max(0, Math.min(20, Number(setting("true_armor_thorns_extra_damage", 2)) || 0));
}
if (finalAmount <= 0) return;
const nextDamage = durability.damage + finalAmount;
if (nextDamage >= durability.maxDurability) {
equippable.setEquipment(slot, undefined);
if (setting("true_armor_break_sound", true)) {
try {
entity.dimension.playSound("random.break", entity.location);
} catch {
}
}
return;
}
durability.damage = nextDamage;
equippable.setEquipment(slot, item);
}