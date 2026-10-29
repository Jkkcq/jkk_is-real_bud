import { system } from '@minecraft/server';
const NETHERITE_ARMOR_SLOTS = [
["Head", "minecraft:netherite_helmet"],
["Chest", "minecraft:netherite_chestplate"],
["Legs", "minecraft:netherite_leggings"],
["Feet", "minecraft:netherite_boots"],
];
import { cfg } from './config.js';
import { javaEnchantsEnabled, getEnchantLevel, javaKnockbackExtra } from './javaEnchants.js';
import { restoreLastVelocity } from './states.js';
function getKnockbackProfile() {
return cfg.knockback_profile ?? 0;
}
function applySwordAoe(attacker, hitEntity, knockbackVector, knockbackHeight, applyFn) {
if (knockbackHeight === undefined) return;
const nearbyEntities = hitEntity.dimension.getEntities({
location: hitEntity.location,
maxDistance: 1.5,
excludeTypes: [attacker.typeId]
});
for (const entity of nearbyEntities) {
if (entity.id !== hitEntity.id && entity.id !== attacker.id) {
applyFn(entity, knockbackVector, knockbackHeight);
}
}
}
function applyKnockbackProfile108(attacker, hitEntity, selectedItem, kbH, kbV) {
const rotationY = attacker.getRotation().y * (Math.PI / 180);
const sinY = Math.sin(rotationY);
const cosY = Math.cos(rotationY);
const kb = getKnockBack(selectedItem);
const netherite = isWearingNetheriteArmor(hitEntity) && hitEntity.typeId === "minecraft:player";
const isCritical = attacker.isFalling && !attacker.isOnGround;
const isKnockBack = ((selectedItem?.typeId.includes("_axe") || attacker.isSprinting) && !attacker.isFalling && !isCritical);
let knockbackPower = netherite ? 0.7 : 0.7;
let knockbackHeight = netherite ? 0.35 : 0.40;
if (kb >= 1) {
knockbackPower += kb * 0.3;
knockbackHeight += kb * 0.1;
}
if (hitEntity.typeId === "minecraft:player" && !hitEntity?.isOnGround) {
knockbackHeight *= 0.5;
knockbackPower *= 0.5;
}
if (isKnockBack === true) {
knockbackPower = netherite ? 1.6 : 1.2;
knockbackHeight = netherite ? 0.40 : 0.40;
if (kb >= 1) {
knockbackPower += kb * 0.3;
knockbackHeight += kb * 0.1;
}
}
knockbackPower *= kbH;
knockbackHeight *= kbV;
const knockbackVector = {
x: -sinY * knockbackPower,
z: cosY * knockbackPower
};
hitEntity.applyKnockback(knockbackVector, knockbackHeight);
}
function applyKnockbackProfile131(attacker, hitEntity, selectedItem, kbH, kbV) {
const rotationY = attacker.getRotation().y * (Math.PI / 180);
const sinY = Math.sin(rotationY);
const cosY = Math.cos(rotationY);
const isCritical = attacker.isFalling && !attacker.isOnGround;
const isKnockBack = ((selectedItem?.typeId.includes("_axe") || attacker.isSprinting) && !attacker.isFalling && !isCritical);
const kb = getKnockBack(selectedItem);
const netherite = isWearingNetheriteArmor(hitEntity) && hitEntity.typeId === "minecraft:player";
let knockbackPower = netherite ? 0.45 : 0.3;
let knockbackHeight = netherite ? 0.2 : 0.28;
if (!attacker.hasTag("sword")) {
if (kb >= 1) {
knockbackPower += kb * 0.3;
knockbackHeight += kb * 0.1;
}
if (hitEntity.typeId === "minecraft:player" && !hitEntity.isOnGround) {
knockbackHeight *= 0.5;
knockbackPower *= 0.5;
}
if (isKnockBack === true) {
knockbackPower = netherite ? 1.35 : 0.9;
knockbackHeight = netherite ? 0.2 : 0.38;
if (kb >= 1) {
knockbackPower += kb * 0.3;
knockbackHeight += kb * 0.1;
}
}
}
knockbackPower *= kbH;
knockbackHeight *= kbV;
const currentVelo = hitEntity.getVelocity?.();
const knockbackVector = {
x: -sinY * knockbackPower + (currentVelo?.x ?? 0),
z: cosY * knockbackPower + (currentVelo?.z ?? 0)
};
hitEntity.applyKnockback(knockbackVector, knockbackHeight);
if (!isCritical && !isKnockBack && selectedItem?.typeId.includes("_sword")) {
applySwordAoe(attacker, hitEntity, knockbackVector, knockbackHeight, (entity, vec, height) => {
try {
entity.applyKnockback(vec, height);
} catch (e) {}
});
}
}
function applyKnockbackExperimental(attacker, hitEntity, selectedItem, kbH, kbV) {
const rotationY = attacker.getRotation().y * (Math.PI / 180);
const sinY = Math.sin(rotationY);
const cosY = Math.cos(rotationY);
const kb = getKnockBack(selectedItem);
const netherite = isWearingNetheriteArmor(hitEntity) && hitEntity.typeId === "minecraft:player";
const isCritical = attacker.isFalling && !attacker.isOnGround;
const isKnockBack = ((selectedItem?.typeId.includes("_axe") || attacker.isSprinting) && !attacker.isFalling && !isCritical);
let knockbackPower = netherite ? 0.75 : 0.3;
let knockbackHeight = netherite ? 0.30 : 0.40;
if (kb >= 1) {
knockbackPower += kb * 0.3;
knockbackHeight += kb * 0.1;
}
if (hitEntity.typeId === "minecraft:player" && !hitEntity?.isOnGround) {
knockbackHeight *= 0.5;
knockbackPower *= 0.5;
}
if (isKnockBack === true) {
knockbackPower = netherite ? 1.35 : 1;
knockbackHeight = netherite ? 0.22 : 0.40;
if (kb >= 1) {
knockbackPower += kb * 0.3;
knockbackHeight += kb * 0.1;
}
}
knockbackPower *= kbH;
knockbackHeight *= kbV;
const knockbackVector = {
x: -sinY * knockbackPower,
z: cosY * knockbackPower
};
hitEntity.applyKnockback(knockbackVector, knockbackHeight);
}
export function shieldStun(target, attacker) {
if (!attacker || !target || target.isDead) return;
const kbH = cfg.kb_horizontal;
const kbV = cfg.kb_vertical;
const netherite = isWearingNetheriteArmor(target);
const rotationY = attacker.getRotation().y * (Math.PI / 180);
const sinY = Math.sin(rotationY);
const cosY = Math.cos(rotationY);
let knockbackPower = (netherite ? 0.45 : 0.4) * kbH;
let knockbackHeight = (netherite ? 0.30 : 0.40) * kbV;
const knockbackVector = {
x: -sinY * knockbackPower,
z: cosY * knockbackPower
};
system.run(() => {
target.applyKnockback(knockbackVector, knockbackHeight);
});
}
export function isWearingNetheriteArmor(player) {
try {
if (!player || player.isDead) return false;
const equippableComponent = player.getComponent("equippable");
if (!equippableComponent) return false;
let count = 0;
for (const [slot, expectedItem] of NETHERITE_ARMOR_SLOTS) {
const equippedItem = equippableComponent.getEquipment(slot)?.typeId;
if (equippedItem === expectedItem) count++;
}
return count >= 3;
} catch (e) {
return false;
}
}
function getKnockBack(item) {
if (!item) return 0;
const enchantableComponent = item.getComponent("enchantable");
if (!enchantableComponent) return 0;
return enchantableComponent.getEnchantments().find(e => e.type.id === "knockback")?.level || 0;
}
export function applyKnockback(attacker, hitEntity, selectedItem) {
if (!attacker || !hitEntity || hitEntity.isDead) return;
let kbH = cfg.kb_horizontal;
let kbV = cfg.kb_vertical;
if (attacker.isSprinting) {
const base = Number(cfg.sprint_knockback_multiplier ?? 1);
kbH *= base * 1.05;
}
try {
if (selectedItem?.hasTag("minecraft:is_axe")) kbH *= Number(cfg.axe_knockback_multiplier ?? 1);
} catch { }
try {
if (javaEnchantsEnabled() && selectedItem) {
const lvl = getEnchantLevel(selectedItem, ["knockback", "minecraft:knockback"]);
const extra = javaKnockbackExtra(lvl);
kbH += extra.h;
kbV += extra.v;
}
} catch { }
try {
const isCrit = attacker.isFalling && !attacker.isOnGround;
const isSprintHit = attacker.isSprinting && !isCrit;
if (isCrit && cfg.sword_nokb_crit !== false) {
kbV *= Number(cfg.sword_nokb_crit_vertical_mult ?? 0.25);
kbH *= Number(cfg.sword_nokb_crit_horizontal_mult ?? 0.85);
}
if (isSprintHit && cfg.sword_sprint_hit_boost !== false) {
kbH *= Number(cfg.sword_sprint_hit_horizontal_mult ?? 1.15);
}
} catch { }
const profile = getKnockbackProfile();
if (profile === 1) {
applyKnockbackProfile131(attacker, hitEntity, selectedItem, kbH, kbV);
return;
}
if (profile === 2) {
applyKnockbackExperimental(attacker, hitEntity, selectedItem, kbH, kbV);
return;
}
applyKnockbackProfile108(attacker, hitEntity, selectedItem, kbH, kbV);
}