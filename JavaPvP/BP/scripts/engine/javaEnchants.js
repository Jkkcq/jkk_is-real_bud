import { system } from "@minecraft/server";
import { cfg } from "./config.js";
export function javaEnchantsEnabled() {
try {
if (cfg.java_enchants_enabled === false) return false;
if (cfg.java_enchants_enabled === true) return true;
} catch {}
return true;
}
export function getEnchantLevel(item, ids) {
if (!item) return 0;
const names = Array.isArray(ids) ? ids : [ids];
try {
const enc = item.getComponent("minecraft:enchantable") || item.getComponent("enchantable");
if (!enc) return 0;
for (const name of names) {
try {
const e = enc.getEnchantment?.(name);
if (e && e.level > 0) return e.level;
} catch {}
}
try {
const list = enc.getEnchantments?.() || [];
for (const name of names) {
const short = String(name).replace("minecraft:", "");
const hit = list.find((x) => {
const id = String(x?.type?.id || x?.type || "");
return id === name || id.endsWith(":" + short) || id === short;
});
if (hit?.level > 0) return hit.level;
}
} catch {}
} catch {}
return 0;
}
export function javaSharpness(level) {
const L = Math.max(0, Number(level) || 0);
return L > 0 ? 0.5 + 0.5 * L : 0;
}
export function javaMobTypeBonus(level) {
const L = Math.max(0, Number(level) || 0);
return L * 2.5;
}
export function isUndead(entity) {
if (!entity) return false;
try {
if (entity.matches?.({ families: ["undead"] })) return true;
} catch {}
const id = entity.typeId || "";
return /zombie|skeleton|wither|phantom|zoglin|drowned|husk|stray|zombified|zombie_villager|wither_skeleton/.test(id);
}
export function isArthropod(entity) {
if (!entity) return false;
try {
if (entity.matches?.({ families: ["arthropod"] })) return true;
} catch {}
const id = entity.typeId || "";
return /spider|cave_spider|silverfish|endermite|bee/.test(id);
}
export function isAquaticOrInWater(entity) {
if (!entity) return false;
try {
if (entity.matches?.({ families: ["aquatic"] })) return true;
} catch {}
const id = entity.typeId || "";
if (/guardian|elder_guardian|squid|glow_squid|dolphin|cod|salmon|tropical_fish|pufferfish|axolotl|turtle/.test(id)) return true;
try {
if (entity.isInWater) return true;
} catch {}
return false;
}
export function javaBreachDamageBoost(rawDamage, breachLevel, target) {
const L = Math.max(0, Math.min(10, Number(breachLevel) || 0));
if (L <= 0 || !target) return 0;
const ignore = Math.min(0.9, 0.15 * L);
let armorMitigation = 0.4;
try {
if (target.typeId === "minecraft:player") {
const eq = target.getComponent("equippable");
let pieces = 0;
for (const slot of ["Head", "Chest", "Legs", "Feet"]) {
const it = eq?.getEquipment?.(slot);
if (it) pieces++;
if (it?.typeId?.includes("netherite")) armorMitigation = Math.max(armorMitigation, 0.7);
else if (it?.typeId?.includes("diamond")) armorMitigation = Math.max(armorMitigation, 0.6);
}
if (pieces === 0) armorMitigation = 0;
else armorMitigation = Math.min(0.8, 0.15 * pieces + (armorMitigation - 0.4));
}
} catch {}
return Math.max(0, rawDamage * armorMitigation * ignore);
}
export function javaDensityBonus(level, fallBlocks) {
const L = Math.max(0, Number(level) || 0);
const f = Math.max(0, Number(fallBlocks) || 0);
return L * 0.5 * f;
}
export function javaSweepDamage(swordDamage, level) {
const L = Math.max(0, Number(level) || 0);
if (L <= 0) {
return 1;
}
const ratio = L / (L + 1);
return 1 + ratio * Math.max(0, swordDamage);
}
export function javaKnockbackExtra(level) {
const L = Math.max(0, Number(level) || 0);
if (L <= 0) return { h: 0, v: 0 };
return {
h: 0.4 * L,
v: 0.05 * L,
};
}
export function applyJavaFireAspect(target, level) {
const L = Math.max(0, Number(level) || 0);
if (L <= 0 || !target) return;
const seconds = 4 * L;
try {
target.setOnFire(seconds, true);
} catch {
try { target.setOnFire(seconds); } catch {}
}
}
export function applyJavaBaneSlow(target, level) {
const L = Math.max(0, Number(level) || 0);
if (L <= 0 || !target || !isArthropod(target)) return;
const ticks = Math.round((1 + 0.5 * L) * 20);
try {
target.addEffect("slowness", ticks, { amplifier: 3, showParticles: true });
} catch {}
}
export function computeJavaEnchantBonuses(item, target, baseAfterCrit, options = {}) {
const out = { bonusDamage: 0, breachBoost: 0, densityBonus: 0 };
if (!javaEnchantsEnabled() || !item) return out;
const p = Math.min(1, Math.max(0, Number(options.chargeP) ?? 1));
const sharpness = getEnchantLevel(item, ["sharpness", "minecraft:sharpness"]);
const smite = getEnchantLevel(item, ["smite", "minecraft:smite"]);
const bane = getEnchantLevel(item, ["bane_of_arthropods", "minecraft:bane_of_arthropods"]);
const impaling = getEnchantLevel(item, ["impaling", "minecraft:impaling"]);
const breach = getEnchantLevel(item, ["breach", "minecraft:breach"]);
const density = getEnchantLevel(item, ["density", "minecraft:density"]);
out.bonusDamage += javaSharpness(sharpness) * p;
if (isUndead(target)) out.bonusDamage += javaMobTypeBonus(smite) * p;
if (isArthropod(target)) out.bonusDamage += javaMobTypeBonus(bane) * p;
if (isAquaticOrInWater(target)) out.bonusDamage += javaMobTypeBonus(impaling) * p;
out.breachBoost = javaBreachDamageBoost(baseAfterCrit + out.bonusDamage, breach, target);
if (options.fallBlocks != null && options.isMaceSmash) {
out.densityBonus = javaDensityBonus(density, options.fallBlocks);
}
return out;
}
export function applyJavaOnHitEnchantEffects(item, attacker, target) {
if (!javaEnchantsEnabled() || !item || !target) return;
const fire = getEnchantLevel(item, ["fire_aspect", "minecraft:fire_aspect"]);
const bane = getEnchantLevel(item, ["bane_of_arthropods", "minecraft:bane_of_arthropods"]);
system.run(() => {
applyJavaFireAspect(target, fire);
applyJavaBaneSlow(target, bane);
});
}