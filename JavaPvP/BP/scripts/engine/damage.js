import { world } from '@minecraft/server';
import { cfg } from './config.js';
import { hasStateTag, setStateTag } from './states.js';
import { javaEngineEnabled, javaBaseDamageFactor, javaEnchantDamageFactor, javaStrengthBonus, javaWeaknessPenalty } from './javaCombatEngine.js';
import { javaEnchantsEnabled, computeJavaEnchantBonuses, applyJavaOnHitEnchantEffects, getEnchantLevel } from './javaEnchants.js';
const HARDCODED_DAMAGE = {
"bf:wooden_sword": 4, "bf:stone_sword": 5, "bf:iron_sword": 6,
"bf:diamond_sword": 7, "bf:netherite_sword": 8, "bf:golden_sword": 4, "bf:copper_sword": 5,
"minecraft:wooden_sword": 4, "minecraft:stone_sword": 5, "minecraft:iron_sword": 6,
"minecraft:diamond_sword": 7, "minecraft:netherite_sword": 8, "minecraft:golden_sword": 4, "minecraft:copper_sword": 5,
"bf:wooden_axe": 7, "bf:stone_axe": 9, "bf:iron_axe": 9,
"bf:diamond_axe": 9, "bf:netherite_axe": 10, "bf:golden_axe": 7, "bf:copper_axe": 9,
"minecraft:wooden_pickaxe": 2, "minecraft:stone_pickaxe": 3, "minecraft:iron_pickaxe": 4,
"minecraft:golden_pickaxe": 2, "minecraft:diamond_pickaxe": 5, "minecraft:netherite_pickaxe": 6,
"minecraft:copper_pickaxe": 3,
"minecraft:wooden_shovel": 2.5, "minecraft:stone_shovel": 3.5, "minecraft:iron_shovel": 4.5,
"minecraft:golden_shovel": 2.5, "minecraft:diamond_shovel": 5.5, "minecraft:netherite_shovel": 6.5,
"minecraft:copper_shovel": 3.5,
"minecraft:wooden_hoe": 1, "minecraft:stone_hoe": 1, "minecraft:iron_hoe": 1,
"minecraft:golden_hoe": 1, "minecraft:diamond_hoe": 1, "minecraft:netherite_hoe": 1,
"minecraft:copper_hoe": 1,
"minecraft:trident": 9, "minecraft:mace": 6
};
let learnedDamageCache = null;
function getLearnedDamageMap() {
if (learnedDamageCache !== null) return learnedDamageCache;
const saved = world.getDynamicProperty("learned_damage");
if (typeof saved === "string") {
try {
learnedDamageCache = JSON.parse(saved);
return learnedDamageCache;
} catch (e) {
console.warn("Failed to parse learned_damage:", e);
}
}
learnedDamageCache = {};
return learnedDamageCache;
}
function setLearnedDamageMap(obj) {
learnedDamageCache = obj;
world.setDynamicProperty("learned_damage", JSON.stringify(obj));
}
function getSharpnessDamage(level) {
const base = Number(cfg.sharpness_damage_base ?? 0);
const perLevel = Number(cfg.sharpness_damage_per_level ?? 1.25);
return level > 0 ? base + perLevel * level : 0;
}
function getStrengthDamage(level) {
return level > 0 ? Number(cfg.strength_damage_per_level ?? 1.3) * level : 0;
}
function getWeaknessDamage(level) {
return level > 0 ? Number(cfg.weakness_damage_per_level ?? 4) * level : 0;
}
function getMobEnchantmentDamage(item, target) {
if (cfg.java_mob_enchantments_enabled !== true || !item || !target || target.typeId === "minecraft:player") return 0;
try {
const enchants = item.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
const smite = enchants.find(enchant => enchant.type.id === "smite")?.level ?? 0;
const bane = enchants.find(enchant => enchant.type.id === "bane_of_arthropods")?.level ?? 0;
let level = 0;
if (smite > 0 && target.matches?.({ families: ["undead"] })) level = smite;
if (bane > 0 && target.matches?.({ families: ["arthropod"] })) level = Math.max(level, bane);
return level * Number(cfg.mob_enchant_damage_per_level ?? 2.5);
} catch {
return 0;
}
}
function getTargetMultiplier(target) {
const value = target?.typeId === "minecraft:player"
? Number(cfg.player_damage_multiplier ?? 1)
: Number(cfg.mob_damage_multiplier ?? 1);
return Number.isFinite(value) ? value : 1;
}
const COOLDOWN_THRESHOLDS = [0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100];
const COOLDOWN_OUTPUTS = [0,0,0,0,0,0,0,0.3125,0.3445,0.3805,0.4205,0.4645,0.5125,0.5645,0.6205,0.6805,0.7445,0.8125,0.8845,0.9605,1];
function getCooldownDamageScale(percent) {
if (javaEngineEnabled()) {
const p = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
return javaBaseDamageFactor(p);
}
if (percent <= 0) return 0.0;
if (percent >= 100) return 1.0;
const i = Math.ceil(percent / 5) - 1;
const t1 = COOLDOWN_THRESHOLDS[i];
const t2 = COOLDOWN_THRESHOLDS[i + 1];
const o1 = COOLDOWN_OUTPUTS[i];
const o2 = COOLDOWN_OUTPUTS[i + 1];
return o1 + ((percent - t1) / (t2 - t1)) * (o2 - o1);
}
function canLearn(attacker, cooldownPercent, isCrit, target) {
if (cooldownPercent < 100) return false;
if (isCrit) return false;
if (attacker.getEffect("strength")) return false;
if (attacker.getEffect("weakness")) return false;
if (target) {
if (target.getEffect("resistance")) return false;
}
return true;
}
function tryLearnDamage(item, eventDamage, attacker, cooldownPercent, isCrit, target) {
if (!item) return;
const id = item.typeId;
if (HARDCODED_DAMAGE[id] !== undefined) return;
const map = getLearnedDamageMap();
if (item.getTags) {
const tag = item.getTags().find(t => t.startsWith("bf:damage_"));
if (tag) {
const num = Number(tag.split("bf:damage_")[1]);
if (!isNaN(num)) {
if (map[id] === num) return;
map[id] = num;
setLearnedDamageMap(map);
return;
}
}
}
if (map[id] !== undefined) return;
if (!canLearn(attacker, cooldownPercent, isCrit, target)) return;
const base = Math.max(1, Math.round(eventDamage));
map[id] = base;
setLearnedDamageMap(map);
}
function getLearnedDamage(item) {
if (!item) return null;
const id = item.typeId;
if (HARDCODED_DAMAGE[id] !== undefined) return HARDCODED_DAMAGE[id];
const map = getLearnedDamageMap();
if (map[id] !== undefined) return map[id];
if (item.getTags) {
const tag = item.getTags().find(t => t.startsWith("bf:damage_"));
if (tag) {
const num = Number(tag.split("bf:damage_")[1]);
if (!isNaN(num)) return num;
}
}
return null;
}
export function calculateTotalDamage(attacker, eventDamage, selectedItem, cooldownPercent, isCrit = false, target) {
const dmgMult = cfg.damage_multiplier;
const cooldownScaling = cfg.cooldown_damage_scaling;
const targetMultiplier = getTargetMultiplier(target);
let cooldownScale = 1.0;
if (cooldownScaling) {
cooldownScale = getCooldownDamageScale(cooldownPercent);
}
if (!selectedItem) {
return 1 * cooldownScale * dmgMult * targetMultiplier;
}
tryLearnDamage(selectedItem, eventDamage, attacker, cooldownPercent, isCrit, target);
const learned = getLearnedDamage(selectedItem);
if (learned === null) {
return eventDamage * cooldownScale * dmgMult * targetMultiplier;
}
let damage = learned;
const strengthLevel = attacker.getEffect("strength")?.amplifier + 1 || 0;
const weaknessLevel = attacker.getEffect("weakness")?.amplifier + 1 || 0;
const sharpnessLevel =
selectedItem?.getComponent("enchantable")
?.getEnchantments()
.find(e => e.type.id === "sharpness")?.level || 0;
if (javaEngineEnabled()) {
damage += javaStrengthBonus(strengthLevel);
damage -= javaWeaknessPenalty(weaknessLevel);
damage = Math.max(0, damage) * cooldownScale;
if (isCrit && cfg.critical_hits_enabled !== false) {
damage *= Number(cfg.critical_damage_multiplier ?? 1.5);
if (target && attacker) {
try {
const dx = target.location.x - attacker.location.x;
const dz = target.location.z - attacker.location.z;
const rot = attacker.getRotation().y * Math.PI / 180;
const facingX = -Math.sin(rot);
const facingZ = Math.cos(rot);
const dot = dx * facingX + dz * facingZ;
if (dot < -0.3) damage *= 1.15;
} catch {}
}
}
if (selectedItem && (selectedItem.hasTag?.("minecraft:is_axe") || /_axe$/.test(selectedItem.typeId || ""))) {
const lastHit = attacker.getDynamicProperty?.("last_axe_target") || "";
const targetId = target?.id || "";
if (lastHit !== targetId) {
damage *= 1.08;
try { attacker.setDynamicProperty?.("last_axe_target", targetId); } catch {}
}
}
if (hasStateTag?.(attacker, "axe_punish_ready")) {
damage *= 1.1;
try { setStateTag?.(attacker, "axe_punish_ready", false); } catch {}
}
const p = Math.max(0, Math.min(100, Number(cooldownPercent) || 0)) / 100;
if (javaEnchantsEnabled()) {
const pack = computeJavaEnchantBonuses(selectedItem, target, damage, { chargeP: p });
damage += pack.bonusDamage + pack.breachBoost + pack.densityBonus;
try { applyJavaOnHitEnchantEffects(selectedItem, attacker, target); } catch {}
} else {
const enchFactor = javaEnchantDamageFactor(p);
damage += getSharpnessDamage(sharpnessLevel) * enchFactor;
damage += getMobEnchantmentDamage(selectedItem, target) * enchFactor;
}
} else {
damage *= cooldownScale;
if (isCrit && cfg.critical_hits_enabled !== false) {
damage *= Number(cfg.critical_damage_multiplier ?? 1.5);
}
damage += getSharpnessDamage(sharpnessLevel);
damage += getStrengthDamage(strengthLevel);
damage -= getWeaknessDamage(weaknessLevel);
damage += getMobEnchantmentDamage(selectedItem, target);
}
damage *= dmgMult * targetMultiplier;
return damage;
}