import { getCooldownPercentage } from './cooldown.js';
import { world, system, EquipmentSlot } from '@minecraft/server';
import { getPlayerState, hasStateTag, setStateTag, getShieldState, setShieldState, restoreLastVelocity } from './states.js';
import { cfg } from './config.js';
import { onOffhandRightClick, onOffhandInteractRelease } from './offhandRightClick.js';
function isShieldItem(item) {
if (!item) return false;
try {
if (item.hasTag("jk:custom_shield") || item.hasTag("bf:custom_shield") || item.hasTag("minecraft:is_shield")) return true;
} catch { }
return /^(?:minecraft:shield|(?:jk|bf):(?:custom_)?shield(?:_[a-z0-9_]+)?)$/.test(item.typeId ?? "");
}
function getShieldAnimation(player) {
const inventory = player.getComponent("minecraft:inventory")?.container;
const equippable = player.getComponent("minecraft:equippable");
if (!inventory || !equippable) return "animation.player.shield_off";
const mainHand = inventory.getItem(player.selectedSlotIndex);
const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
const hasShieldMain = isShieldItem(mainHand);
const hasShieldOff = isShieldItem(offhand);
const shieldStatus = getShieldState(player);
const isBlocking = shieldStatus === 'up';
const sidePosePref = player.getDynamicProperty("shield_side_pose");
const useSidePose = sidePosePref === undefined ? true : Boolean(sidePosePref);
if (hasShieldOff) {
if (isBlocking) return "shield_offhand";
return useSidePose
? "animation.shield.wield_off_hand_first_person2_side"
: "animation.shield.wield_off_hand_first_person2";
}
if (hasShieldMain) {
return isBlocking
? "animation.shield.wield_main_hand_first_person_blocking2"
: useSidePose
? "animation.shield.wield_main_hand_first_person2_side"
: "animation.shield.wield_main_hand_first_person2";
}
return "animation.player.shield_off";
}
export function updateShieldAnimation(player) {
try {
const anim = getShieldAnimation(player);
player.playAnimation(anim, { blendOutTime: 1000000000, loop: true });
} catch (e) {
console.warn("Error updating shield animation:", e);
}
}
const isShieldSystemEnabled = () => cfg.custom_shield_enabled !== false;
const setShieldActive = (player, active) => {
setShieldState(player, active ? 'up' : 'down');
};
function isAxeShieldDisable(attacker, item) {
if (cfg.custom_shield_axe_break_enabled === false) return false;
let isAxe = hasStateTag(attacker, "axe");
try { isAxe ||= Boolean(item?.hasTag("minecraft:is_axe") || item?.typeId?.includes("axe")); } catch { }
if (!isAxe) return false;
const chance = Math.max(0, Math.min(100, Number(cfg.custom_shield_axe_disable_chance ?? 100)));
return Math.random() * 100 < chance;
}
function isShieldFacingAttacker(attacker, target) {
try {
const attackerYaw = Number(attacker.getRotation().y);
const targetYaw = Number(target.getRotation().y);
const angle = Math.abs((((attackerYaw - targetYaw) % 360) + 540) % 360 - 180);
const threshold = Math.max(30, Math.min(180, Number(cfg.shield_facing_threshold_degrees ?? 90)));
return angle <= threshold;
} catch { return false; }
}
world.afterEvents.playerSpawn.subscribe((event) => {
if (isShieldSystemEnabled()) return;
const player = event.player;
system.runTimeout(() => {
system.runTimeout(() => {
updateShieldAnimation(player);
}, 4);
}, 100);
});
world.afterEvents.itemUse.subscribe(event => {
const player = event.source;
const inventory = player.getComponent("minecraft:inventory")?.container;
if (!inventory) return;
const selectedItem = inventory.getItem(player.selectedSlotIndex);
updateShieldAnimation(player);
const piercingLevel = selectedItem ? (selectedItem.getComponent("enchantable")?.getEnchantments().find(e => e.type.id === "piercing")?.level || 0) : 0;
if (piercingLevel > 0) {
setStateTag(player, "piercing_bow", true);
} else {
setStateTag(player, "piercing_bow", false);
}
player.setDynamicProperty("pending_piercing", piercingLevel);
});
const shieldHoldActive = new Set();
const pendingShieldActivation = new Map();
const lastShieldClickTick = new Map();
function hasUsableShieldForCurrentUse(player) {
try {
const inventory = player.getComponent("minecraft:inventory")?.container;
const equippable = player.getComponent("minecraft:equippable");
const mainhand = inventory?.getItem(player.selectedSlotIndex);
const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
if (isShieldItem(mainhand)) return true;
return isShieldItem(offhand) && (mainhand?.hasTag("jk:custom_shield_usable") || mainhand?.hasTag("bf:custom_shield_usable"));
} catch { return false; }
}
onOffhandRightClick(({ player, inputTick }) => {
if (!player || !hasUsableShieldForCurrentUse(player)) return false;
if (lastShieldClickTick.get(player.id) === inputTick) return true;
lastShieldClickTick.set(player.id, inputTick);
if (shieldHoldActive.has(player.id) || pendingShieldActivation.has(player.id)) return true;
if (!isShieldSystemEnabled() || getShieldState(player) === 'broken') return true;
const raiseDelayEnabled = cfg.custom_shield_raise_delay_enabled === true;
const raiseDelay = raiseDelayEnabled
? Math.max(0, Math.min(20, Math.round(Number(cfg.custom_shield_raise_delay_ticks ?? 5))))
: 1;
const activation = system.runTimeout(() => {
pendingShieldActivation.delete(player.id);
if (!player.isValid || !hasUsableShieldForCurrentUse(player)
|| !isShieldSystemEnabled() || getShieldState(player) === 'broken') return;
shieldHoldActive.add(player.id);
setShieldActive(player, true);
updateShieldAnimation(player);
}, raiseDelay);
pendingShieldActivation.set(player.id, activation);
return true;
});
onOffhandInteractRelease(({ player }) => {
if (!player?.id) return false;
const pending = pendingShieldActivation.get(player.id);
if (pending !== undefined) system.clearRun(pending);
pendingShieldActivation.delete(player.id);
if (!shieldHoldActive.delete(player.id)) return false;
const shieldState = getPlayerState(player).shield;
shieldState.raiseToken++;
if (isShieldSystemEnabled() && getShieldState(player) !== 'broken') setShieldState(player, 'down');
updateShieldAnimation(player);
return true;
});
try {
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
const pending = pendingShieldActivation.get(playerId);
if (pending !== undefined) system.clearRun(pending);
pendingShieldActivation.delete(playerId);
shieldHoldActive.delete(playerId);
lastShieldClickTick.delete(playerId);
});
} catch { }
export function isArrowHittingShield(projectile, target, attacker) {
if (projectile.typeId !== 'minecraft:arrow' || Number(attacker?.getDynamicProperty("pending_piercing") ?? 0) > 0) return false;
if (getShieldState(target) !== 'up' || getShieldState(target) === 'broken' || isShieldFacingAttacker(attacker, target)) return false;
const equippable = target.getComponent("minecraft:equippable");
const inventory = target.getComponent("minecraft:inventory")?.container;
if (!equippable || !inventory) return false;
const mainHandItem = inventory.getItem(target.selectedSlotIndex);
const offhandItem = equippable.getEquipment(EquipmentSlot.Offhand);
const hasShield = isShieldItem(offhandItem) || isShieldItem(mainHandItem);
if (!hasShield) return false;
const defenderYaw = DRot.y * (Math.PI / 180);
const defenderLoc = target.location;
const arrowVel = projectile.getVelocity();
const arrowSpeed = Math.sqrt(arrowVel.x ** 2 + arrowVel.y ** 2 + arrowVel.z ** 2);
const offset = 0.3 + ((Math.min(arrowSpeed, 5.0) - 1.1) / (5.0 - 1.1)) * 1.2;
system.run(() => {
try {
const spawnPos = {
x: defenderLoc.x - Math.sin(defenderYaw) * offset,
y: defenderLoc.y + 1.0,
z: defenderLoc.z + Math.cos(defenderYaw) * offset,
};
const deflected = target.dimension.spawnEntity("minecraft:arrow", spawnPos);
const incomingVel = arrowVel;
const scale = 0.8;
deflected.applyImpulse({
x: -incomingVel.x * scale,
y: Math.max(0.1, incomingVel.y * 0.5),
z: -incomingVel.z * scale
});
const proj = deflected.getComponent("minecraft:projectile");
if (proj) proj.owner = target;
deflected.clearVelocity();
} catch (_) { }
restoreLastVelocity(target);
system.runTimeout(() => { try { restoreLastVelocity(target); } catch (_) { } }, 2);
target.dimension.playSound("item.shield.block", target.location);
const eq2 = target.getComponent("minecraft:equippable");
const inv2 = target.getComponent("minecraft:inventory")?.container;
if (eq2 && inv2) {
handleShieldDurability(target, eq2, inv2,
inv2.getItem(target.selectedSlotIndex),
eq2.getEquipment(EquipmentSlot.Offhand)
);
}
});
return true;
}
export function handlePlayerShieldBlock(attacker, target) {
if (!attacker || !target) return false;
const shieldStatus = getShieldState(target);
if (shieldStatus === 'broken' || isShieldFacingAttacker(attacker, target) || !attacker) return false;
if (shieldStatus !== 'up') return false;
const equippable = target.getComponent("minecraft:equippable");
const inventory = target.getComponent("minecraft:inventory")?.container;
if (!equippable || !inventory) return false;
const mainHandItem = inventory.getItem(target.selectedSlotIndex);
const offhandItem = equippable.getEquipment(EquipmentSlot.Offhand);
const hasShield = isShieldItem(offhandItem) || isShieldItem(mainHandItem);
if (!hasShield) return false;
const tick = system.currentTick;
const state = getPlayerState(target);
const lastTick = state.shield.lastItemDamageTick || 0;
if (tick - lastTick > 5) {
state.shield.lastItemDamageTick = tick;
handleShieldDurability(target, equippable, inventory, mainHandItem, offhandItem);
}
const _attackerInv = attacker.getComponent("minecraft:inventory")?.container;
const mainHandItemA = typeof attacker.selectedSlotIndex === "number"
? _attackerInv?.getItem(attacker.selectedSlotIndex)
: (attacker.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand) ?? _attackerInv?.getItem(0));
if (isAxeShieldDisable(attacker, mainHandItemA)) {
system.run(() => {
breakShield(target, attacker, mainHandItem);
});
} else {
system.run(() => {
target.dimension.playSound("item.shield.block", target.location);
});
}
if (mainHandItemA?.typeId == "minecraft:mace" && attacker.isFalling) {
system.run(() => {
attacker.applyImpulse({ x: 0, y: -2, z: 0});
attacker.playSound("item.shield.block", { volume: 1, pitch: 0.5 });
attacker.playSound("note.bass", { volume: 1, pitch: 1 });
});
}
return true;
}
export function handleVanillaShieldBlock(attacker, target) {
const inventory = attacker.getComponent("minecraft:inventory")?.container;
if (!inventory) return;
const currentVelocity = attacker.getVelocity();
const rotationY = attacker.getRotation().y * 0.017453293;
try {
const knockbackX = -Math.sin(rotationY) * 0.79;
const knockbackZ = Math.cos(rotationY) * 0.79;
attacker.applyKnockback(
{ x: currentVelocity.x + knockbackX, z: currentVelocity.z + knockbackZ },
currentVelocity.y - 0.1
);
} catch (e) { }
const mainHandItem = inventory.getItem(attacker.selectedSlotIndex);
if (isAxeShieldDisable(attacker, mainHandItem)) {
setShieldState(target, 'broken');
return;
}
target.dimension.playSound("item.shield.block", target.location);
}
function handleShieldDurability(target, equippable, inventory, mainHandItem, offhandItem) {
system.run(() => {
if (isShieldItem(offhandItem)) {
const damage = Math.max(0, Math.round(Number(mainHandItem?.typeId === "minecraft:mace"
? cfg.custom_shield_mace_durability ?? 10
: cfg.custom_shield_hit_durability ?? 1)));
const durabilityComp = offhandItem.getComponent("minecraft:durability");
if (durabilityComp && durabilityComp.damage + damage < durabilityComp.maxDurability) {
durabilityComp.damage += damage;
equippable.setEquipment(EquipmentSlot.Offhand, offhandItem);
} else if (durabilityComp) {
equippable.setEquipment(EquipmentSlot.Offhand, undefined);
target.playSound("random.break");
}
}
if (isShieldItem(mainHandItem)) {
const durabilityComp = mainHandItem.getComponent("minecraft:durability");
const damage = Math.max(0, Math.round(Number(mainHandItem?.typeId === "minecraft:mace"
? cfg.custom_shield_mace_durability ?? 10
: cfg.custom_shield_hit_durability ?? 1)));
if (durabilityComp && durabilityComp.damage + damage < durabilityComp.maxDurability) {
durabilityComp.damage += damage;
inventory.setItem(target.selectedSlotIndex, mainHandItem);
} else if (durabilityComp) {
inventory.setItem(target.selectedSlotIndex, undefined);
target.playSound("random.break");
}
}
});
}
export function breakShield(target, attacker) {
target.dimension.playSound("random.break", target.location, { volume: 1, pitch: 1.2 });
setShieldState(target, 'broken');
const cooldownSec = Number(cfg.custom_shield_cooldown ?? 5);
const cooldownTicks = Math.max(1, Math.round(cooldownSec * 20));
updateShieldAnimation(target);
system.runTimeout(() => {
if (getShieldState(target) === 'broken') {
setShieldState(target, 'down');
updateShieldAnimation(target);
}
}, cooldownTicks);
const cooldownPercent = getCooldownPercentage(attacker);
const shieldStunning = Boolean(cfg.custom_shield_stunning ?? true);
if (shieldStunning && cooldownPercent > 85) {
setStateTag(target, "shield_stun", true);
setStateTag(target, "recent_axe_stun", true);
system.runTimeout(() => {
setStateTag(target, "shield_stun", false);
setStateTag(target, "recent_axe_stun", false);
}, Math.max(1, Math.round(Number(cfg.custom_shield_stun_ticks ?? 4))));
}
}