import { world, system, ButtonState } from '@minecraft/server';
import { cfg } from './config.js';
import { calculateTotalDamage } from './damage.js';
import { startCooldown, getCooldownPercentage } from './cooldown.js';
import { javaEngineEnabled, javaCanSpecialAttack, JAVA_SPECIAL_MIN_P, getJavaProgress } from './javaCombatEngine.js';
import { javaEnchantsEnabled, getEnchantLevel, javaSweepDamage } from './javaEnchants.js';
import { handlePlayerShieldBlock, isArrowHittingShield, breakShield } from './shield.js';
import { applyKnockback, shieldStun } from './knockback.js';
import { getPlayerState, hasStateTag, setStateTag, getShieldState, restoreLastVelocity } from './states.js';
import { canJavaCrit } from '../extra/java_parity.js';
const damageLock = new Set();
const spamCounter = new Map();
const inputModeCache = new Map();
function classifyInputMode(raw) {
const mode = String(raw || "").toLowerCase();
if (!mode || mode === "unknown") return "unknown";
if (
mode.includes("gamepad") ||
mode.includes("controller") ||
mode.includes("touch") ||
mode.includes("mobile") ||
mode.includes("pad")
) return "controller";
if (
mode.includes("keyboard") ||
mode.includes("mouse") ||
mode.includes("kbm") ||
mode.includes("key")
) return "keyboard";
return "unknown";
}
function getStunSlamModeFor(player) {
if (!player) return String(cfg.stun_slam_mode ?? "attribute").toLowerCase();
try {
const forced = player.getDynamicProperty("stun_slam_override");
if (forced === "attribute" || forced === "java_accurate") return forced;
} catch {}
let classified = "unknown";
try {
const info = player.inputInfo;
if (info && info.lastInputMode) {
classified = classifyInputMode(info.lastInputMode);
if (classified !== "unknown") {
inputModeCache.set(player.id, classified);
}
}
} catch {}
if (classified === "unknown") {
classified = inputModeCache.get(player.id) || "unknown";
}
if (classified === "controller") return "attribute";
return String(cfg.stun_slam_mode ?? "attribute").toLowerCase();
}
system.runInterval(() => {
for (const p of world.getPlayers()) {
try {
const info = p.inputInfo;
if (!info || !info.lastInputMode) continue;
const classified = classifyInputMode(info.lastInputMode);
if (classified !== "unknown") {
inputModeCache.set(p.id, classified);
}
} catch {}
}
}, 20);
function isShielding(entity) {
return entity && getShieldState(entity) === 'up';
}
function tryShieldBlock(attacker, target, angleDiff) {
return handlePlayerShieldBlock(attacker, target, angleDiff);
}
const lastAxeHit = new Map();
function handleShieldStunResponse(event, target, attacker) {
if (!hasStateTag(target, "shield_stun")) return false;
shieldStun(target, attacker);
event.damage *= 0.1;
const now = system.currentTick;
const prev = lastAxeHit.get(attacker.id) ?? 0;
const isRapid = (now - prev) <= 3;
lastAxeHit.set(attacker.id, now);
const baseStun = Math.max(1, Math.round(Number(cfg.custom_shield_stun_ticks ?? 5)));
const stunTicks = isRapid ? Math.max(1, Math.floor(baseStun * 0.6)) : baseStun;
system.run(() => {
setStateTag(target, "shield_stun", false);
setStateTag(target, "shield_stun_cooldown", true);
setStateTag(target, "recent_axe_stun", true);
system.runTimeout(() => {
setStateTag(target, "shield_stun_cooldown", false);
setStateTag(target, "recent_axe_stun", false);
setStateTag(target, "shield_delay_punish", true);
system.runTimeout(() => {
try { setStateTag(target, "shield_delay_punish", false); } catch {}
}, 3);
}, stunTicks);
setStateTag(attacker, "axe_punish_ready", true);
system.runTimeout(() => {
try { setStateTag(attacker, "axe_punish_ready", false); } catch {}
}, 4);
});
return true;
}
function handleShieldBlocks(event, attacker, target, targetShielding, projectile) {
if (projectile && targetShielding) {
if (isArrowHittingShield(projectile, target, attacker) === true) {
event.cancel = true;
return true;
}
return false;
}
const axeToMaceSwap = hasStateTag(attacker, "axe_to_mace_swap") && attacker.isFalling && !attacker.isOnGround;
const stunMode = getStunSlamModeFor(attacker);
const javaAccurateOk = hasStateTag(target, "shield_stun") || hasStateTag(target, "recent_axe_stun");
const allowStunSlam = stunMode === "java_accurate" ? (axeToMaceSwap && javaAccurateOk) : axeToMaceSwap;
if (targetShielding && allowStunSlam) {
system.run(() => breakShield(target, attacker));
return false;
}
if (targetShielding) {
if (hasStateTag(target, "shield_delay_punish")) {
if (Math.random() > 0.4) {
return false;
}
}
if (tryShieldBlock(attacker, target) === true) {
event.cancel = true;
return true;
}
}
return false;
}
function handleAntiSpam(event, attacker, selectedItem, cooldownPercent, antiSpam) {
try {
if (javaEngineEnabled()) {
if (selectedItem?.typeId === "minecraft:mace" && attacker.isFalling) return false;
if (selectedItem?.hasTag("bf:ignore_cooldown")) return false;
if (antiSpam && cooldownPercent < 30) {
const count = Math.min((spamCounter.get(attacker.id) ?? 0) + 1, 5);
spamCounter.set(attacker.id, count);
if (count >= 5) {
system.run(() => {
try {
attacker.addEffect("weakness", Math.max(1, Math.round(Number(cfg.anti_spam_weakness_ticks ?? 20))), { amplifier: 0, showParticles: false });
} catch {}
});
}
} else if (cooldownPercent >= 30) {
spamCounter.delete(attacker.id);
}
return false;
}
} catch {}
const requiredCooldown = Math.max(0, Math.min(100, Number(cfg.anti_spam_partial_threshold ?? 0)));
if (cooldownPercent >= requiredCooldown) return false;
if (selectedItem?.typeId === "minecraft:mace" && attacker.isFalling) return false;
if (selectedItem?.hasTag("bf:ignore_cooldown")) return false;
if (requiredCooldown <= 0) return false;
event.cancel = true;
handleHit(attacker, selectedItem);
if (!antiSpam) {
spamCounter.delete(attacker.id);
return true;
}
if (cooldownPercent >= 30) {
spamCounter.delete(attacker.id);
} else {
const count = Math.min((spamCounter.get(attacker.id) ?? 0) + 1, 5);
spamCounter.set(attacker.id, count);
system.run(() => {
if (count >= 5) {
attacker.addEffect("weakness", Math.max(1, Math.round(Number(cfg.anti_spam_weakness_ticks ?? 30))), { amplifier: 255, showParticles: false });
}
});
}
return true;
}
function handleAntiSpamShieldBlock(event, attacker, target, targetShielding, selectedItem) {
if (!targetShielding) return false;
const attackerRot = attacker.getRotation();
const targetRot = target.getRotation();
const yDiff = Math.abs(attackerRot.y - targetRot.y);
if (!tryShieldBlock(attacker, target, yDiff)) return false;
handleHit(attacker, selectedItem);
getPlayerState(target).combat.recentHit = { attacker, tick: system.currentTick };
event.cancel = true;
return true;
}
function handleAttackDamage(event, attacker, target, selectedItem, cooldownPercent) {
if (selectedItem?.hasTag("minecraft:is_spear")) {
handleHit(attacker, selectedItem);
const attackerState = getPlayerState(attacker);
attackerState.combat.justHit = { tick: system.currentTick };
attackerState.combat.nextHit = { tick: system.currentTick };
getPlayerState(target).combat.recentHit = { attacker, tick: system.currentTick };
return;
}
const id = target.id;
const baseDamage = event.damage;
let damage;
const isMaceSmash = selectedItem?.typeId === "minecraft:mace" && attacker.isFalling;
const axeToMaceSwap = hasStateTag(attacker, "axe_to_mace_swap");
if (isMaceSmash || selectedItem?.hasTag("bf:ignore_cooldown")) {
damage = handleDamage(attacker, target, baseDamage, selectedItem, 100);
if (isMaceSmash && !axeToMaceSwap) system.run(() => restoreLastVelocity(target));
} else {
damage = handleDamage(attacker, target, baseDamage, selectedItem, cooldownPercent);
}
event.cancel = true;
handleHit(attacker, selectedItem);
system.run(() => {
damageLock.add(id);
try {
target.applyDamage(damage, { cause: "entityAttack", damagingEntity: attacker });
} finally {
damageLock.delete(id);
}
});
const canKb = javaEngineEnabled()
? javaCanSpecialAttack(getJavaProgress(attacker, selectedItem))
: (cooldownPercent >= Math.max(0, Math.min(100, Number(cfg.sprint_knockback_min_cooldown ?? 85))));
if (canKb) {
system.run(() => {
applyParticles(attacker, target, selectedItem);
if (hasStateTag(target, "shield_stun")) return;
applyKnockback(attacker, target, selectedItem);
});
}
getPlayerState(target).combat.recentHit = { attacker, tick: system.currentTick };
const attackerState = getPlayerState(attacker);
attackerState.combat.justHit = { tick: system.currentTick };
attackerState.combat.nextHit = { tick: system.currentTick };
}
world.beforeEvents.entityHurt.subscribe((event) => {
try {
const cause = event.damageSource?.cause;
const attacker = event.damageSource?.damagingEntity;
const projectile = event.damageSource?.damagingProjectile;
const target = event.hurtEntity;
if (!target) return;
if (damageLock.has(target.id)) return;
if (!attacker) return;
if (hasStateTag(target, "shield_stun_cooldown")) {
event.cancel = true;
return;
};
if (handleShieldStunResponse(event, target, attacker)) {return;};
const targetShielding = isShielding(target);
if (handleShieldBlocks(event, attacker, target, targetShielding, projectile)) return;
if (attacker.typeId !== "minecraft:player") return;
if (cause !== "entityAttack") {
if (cause === "maceSmash") {
scaleMaceSmashDamage(event, attacker);
if (checkMace(attacker, event)) {
system.run(() => {
try {
attacker.applyImpulse({ x: 0, y: -2, z: 0 });
attacker.playSound("item.shield.block", { volume: 1, pitch: 0.5 });
attacker.playSound("note.bass", { volume: 1, pitch: 1 });
} catch {}
});
} else {
system.run(() => applyWindBurstLaunch(attacker));
}
}
return;
}
const inventory = attacker.getComponent("inventory")?.container;
const selectedItem = inventory?.getItem(attacker.selectedSlotIndex);
const cooldownPercent = getCooldownPercentage(attacker, selectedItem);
if (handleAntiSpam(event, attacker, selectedItem, cooldownPercent, cfg.anti_spam_enabled)) return;
if (handleAntiSpamShieldBlock(event, attacker, target, targetShielding, selectedItem)) return;
handleAttackDamage(event, attacker, target, selectedItem, cooldownPercent);
} catch (err) {
try { console.warn("[JPVP] entityHurt error:", err); } catch {}
}
});
function getItemEnchantLevel(item, names) {
if (!item) return 0;
try {
const enc = item.getComponent("minecraft:enchantable") || item.getComponent("enchantable");
if (!enc) return 0;
for (const name of names) {
try {
const e = enc.getEnchantment?.(name);
if (e?.level) return e.level;
} catch {}
try {
const list = enc.getEnchantments?.() || [];
const hit = list.find(x => String(x?.type?.id || "").endsWith(name));
if (hit?.level) return hit.level;
} catch {}
}
} catch {}
return 0;
}
function applyWindBurstLaunch(attacker) {
if (!attacker || cfg.wind_burst_enabled === false) return;
try {
const item = attacker.getComponent("minecraft:inventory")?.container?.getItem(attacker.selectedSlotIndex);
const level = getItemEnchantLevel(item, ["wind_burst", "minecraft:wind_burst"]);
if (level <= 0) return;
const mult = Math.max(0, Number(cfg.wind_burst_multiplier ?? 1));
const perLevel = Math.max(0, Number(cfg.wind_burst_blocks_per_level ?? 7));
const blocks = perLevel * level * mult;
const fallSpeed = Math.abs(attacker.getVelocity?.()?.y || 0);
const elytraBoost = fallSpeed > 0.5 ? 1.3 : 1;
const y = Math.min(5.5, 0.6 * Math.sqrt(Math.max(1, blocks)) * Math.max(0.5, mult) * elytraBoost);
try {
attacker.applyImpulse({ x: 0, y, z: 0 });
} catch {
try { attacker.applyKnockback({ x: 0, z: 0 }, y * 0.45); } catch {}
}
try {
attacker.dimension.spawnParticle("minecraft:wind_explosion_emitter", {
x: attacker.location.x, y: attacker.location.y, z: attacker.location.z
});
} catch {}
try { attacker.playSound("wind_charge.burst", { volume: 0.8, pitch: 1 }); } catch {}
} catch {}
}
function checkMace(player, event) {
const equippableComponent = player.getComponent("equippable");
if (!equippableComponent) return false;
if (equippableComponent.getEquipment("Chest")?.typeId === "minecraft:elytra") {
event.cancel = true;
return true;
}
return false;
}
function scaleMaceSmashDamage(event, attacker) {
if (cfg.mace_smash_fall_nerf_enabled !== true || !Number.isFinite(event.damage)) return;
try {
const item = attacker.getComponent("minecraft:inventory")?.container?.getItem(attacker.selectedSlotIndex);
const baseline = Math.max(0, Number(cfg.mace_one_block_damage ?? 5));
const configuredMultiplier = Number(cfg.mace_air_damage_multiplier ?? 0.65);
const fallMultiplier = Number.isFinite(configuredMultiplier) ? Math.max(0, configuredMultiplier) : 0.65;
let densityLevel = 0;
try {
densityLevel = item?.getComponent("minecraft:enchantable")?.getEnchantment("density")?.level
?? item?.getComponent("enchantable")?.getEnchantment("density")?.level ?? 0;
} catch { densityLevel = 0; }
const fallDistance = estimateMaceFallDistance(event.damage, densityLevel);
const scaledFallDamage = maceFallBonus(Math.max(0, fallDistance - 1));
let total = baseline + scaledFallDamage * fallMultiplier;
if (javaEngineEnabled()) {
const per = Math.max(0, Number(cfg.mace_density_per_block_per_level ?? 0.5));
total += Math.max(0, densityLevel) * per * fallDistance;
} else {
const densityPerLevel = Math.max(0, Number(cfg.mace_density_multiplier_per_level ?? 0.05));
total *= 1 + Math.max(0, densityLevel) * densityPerLevel;
}
event.damage = total;
} catch { }
}
function maceFallBonus(distance) {
const fall = Math.max(0, Number(distance) || 0);
return Math.min(fall, 3) * 4 + Math.min(Math.max(0, fall - 3), 5) * 2 + Math.max(0, fall - 8);
}
function estimateMaceFallDistance(rawDamage, densityLevel) {
const expectedDamage = distance => 6 + maceFallBonus(distance) + 0.5 * Math.max(0, densityLevel) * distance;
let low = 0;
let high = 512;
for (let index = 0; index < 32; index++) {
const middle = (low + high) / 2;
if (expectedDamage(middle) < rawDamage) low = middle;
else high = middle;
}
return (low + high) / 2;
}
function handleDamage(attacker, target, baseDamage, selectedItem, cooldownPercent) {
let isCritical = false;
let isKnockBack = false;
if (javaEngineEnabled()) {
const p = getJavaProgress(attacker, selectedItem);
const special = javaCanSpecialAttack(p);
isCritical = cfg.critical_hits_enabled !== false
&& special
&& canJavaCrit(attacker)
&& !attacker.isSprinting;
isKnockBack = special
&& !isCritical
&& !canJavaCrit(attacker)
&& (attacker.isSprinting || Boolean(selectedItem?.typeId?.includes("_axe")));
} else {
const criticalThreshold = Math.max(0, Math.min(100, Number(cfg.critical_hits_min_cooldown ?? 85)));
isCritical = cfg.critical_hits_enabled !== false && canJavaCrit(attacker) && cooldownPercent >= criticalThreshold;
isKnockBack = (attacker.isSprinting || selectedItem?.typeId?.includes("_axe")) && !canJavaCrit(attacker) && !isCritical;
}
let damage = calculateTotalDamage(attacker, baseDamage, selectedItem, cooldownPercent, isCritical, target);
const canSweep = javaEngineEnabled()
? (javaCanSpecialAttack(getJavaProgress(attacker, selectedItem)) && !isCritical && !isKnockBack)
: (!isCritical && !isKnockBack && cooldownPercent >= Math.max(0, Math.min(100, Number(cfg.sword_sweep_min_cooldown ?? 85))));
if (cfg.sword_sweep_enabled !== false && canSweep && selectedItem?.hasTag("minecraft:is_sword")) {
const sweepRange = Math.max(0, Math.min(6, Number(cfg.sword_sweep_range ?? 1.5)));
const sweepMultiplier = Math.max(0, Math.min(2, Number(cfg.sword_sweep_damage_multiplier ?? 0.5)));
const nearbyEntities = target.dimension.getEntities({
location: target.location,
maxDistance: sweepRange,
});
for (const entity of nearbyEntities) {
if (entity.id !== target.id && entity.id !== attacker.id) {
system.run(() => {
damageLock.add(entity.id);
try {
let sweepDmg = damage * sweepMultiplier;
if (javaEnchantsEnabled()) {
const se = getEnchantLevel(selectedItem, ["sweeping_edge", "minecraft:sweeping_edge"]);
sweepDmg = javaSweepDamage(damage, se);
}
entity.applyDamage(sweepDmg, { cause: "entityAttack", damagingEntity: attacker });
} catch (e) { }
finally { damageLock.delete(entity.id); }
});
}
}
}
const breachEnchant = selectedItem?.getComponent("enchantable")?.getEnchantments().find(e => e.type.id === "breach");
if ((hasStateTag(attacker, "axe_breach") || hasStateTag(attacker, "sword_breach")) && (breachEnchant?.level ?? 0) >= 1) {
const breachLevel = breachEnchant.level;
if (hasStateTag(attacker, "axe_breach")) {
damage = Number(cfg.breach_axe_flat_damage ?? 1.75) + (damage * Number(cfg.breach_axe_damage_per_level ?? 0.3)) * breachLevel;
} else {
damage = Number(cfg.breach_sword_flat_damage ?? 1.25) + (damage * Number(cfg.breach_sword_damage_per_level ?? 0.3)) * breachLevel;
}
system.run(() => {
target.dimension.playSound("mace.smash_air", target.location, { volume: 0.6 });
});
}
return damage;
}
world.afterEvents.playerSwingStart.subscribe((event) => {
const player = event.player;
if (event.swingSource != "Attack") return;
system.runTimeout(() => {
const lastHitTick = getPlayerState(player).combat.justHit;
if (lastHitTick && system.currentTick === lastHitTick.tick) return;
const cooldownPercent = getCooldownPercentage(player);
if (lastHitTick && system.currentTick - lastHitTick.tick <= 10) return;
if (cooldownPercent <= 30) {
const count = Math.min((spamCounter.get(player.id) ?? 0) + 1, 5);
spamCounter.set(player.id, count);
if (count >= 5) {
player.addEffect("weakness", Math.max(1, Math.round(Number(cfg.anti_spam_weakness_ticks ?? 30))), { amplifier: 255, showParticles: false });
}
} else {
spamCounter.delete(player.id);
}
const inventory = player.getComponent("inventory")?.container;
const selectedItem = inventory?.getItem(player.selectedSlotIndex);
if (selectedItem?.hasTag("minecraft:is_spear")) return;
handleHit(player, selectedItem);
}, 2);
});
function applyParticles(attacker, hitEntity, selectedItem) {
if (!attacker || !hitEntity || hitEntity.isDead) return;
const progress = getJavaProgress(attacker, selectedItem);
const javaFullCharge = javaEngineEnabled() && progress >= JAVA_SPECIAL_MIN_P;
const isCritical = (attacker.isFalling && !attacker.isOnGround) || javaFullCharge;
const isKnockBack = (attacker.isSprinting || selectedItem?.typeId.includes("_axe")) && !attacker.isFalling && !isCritical;
const dimension = hitEntity.dimension;
const sweepEnabled = cfg.hud_sweep_particle;
const critEnabled = cfg.hud_crit_particle;
const attackSound = cfg.hud_attack_sound;
const critSound = cfg.hud_crit_sound;
const particlesEnabled = !attacker.hasTag("fopt_low_effects");
if (isCritical) {
if (particlesEnabled && critEnabled) {
const particleLocation = {
x: hitEntity.location.x,
y: hitEntity.location.y + 1.5,
z: hitEntity.location.z
};
dimension.spawnParticle("bf:critical_hit_emitter", particleLocation);
}
if (critSound) {
dimension.playSound("critical_hit", hitEntity.location);
}
} else if (isKnockBack) {
if (attackSound) {
dimension.playSound("knockback", hitEntity.location);
}
} else if (selectedItem?.typeId.includes("_sword")) {
if (particlesEnabled && sweepEnabled) {
const rotationY = attacker.getRotation().y * (Math.PI / 180);
const particleLocation = {
x: attacker.location.x - Math.sin(rotationY) * 2,
y: attacker.location.y + 0.5,
z: attacker.location.z + Math.cos(rotationY) * 2
};
dimension.spawnParticle("bf:sweep", particleLocation);
}
if (attackSound) {
dimension.playSound("sweep", hitEntity.location);
}
}
}
world.afterEvents.entityHurt.subscribe((event) => {
const entity = event.hurtEntity;
if (!entity || entity.typeId !== "minecraft:player") return;
entity.dimension.playSound("hit", entity.location);
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
spamCounter.delete(playerId);
});
world.afterEvents.playerEmote.subscribe((event) => {
try {
const player = event.player;
if (!player) return;
const enabled = Boolean(world.getDynamicProperty("emote_hotbar_swap") ?? false);
if (!enabled) return;
try {
const info = player.inputInfo;
if (info && info.lastInputMode) {
const mode = String(info.lastInputMode).toLowerCase();
if (mode.includes("keyboard") || mode.includes("mouse")) return;
}
} catch {}
const slot = Math.max(0, Math.min(8, (Number(player.getDynamicProperty("emote_hotbar_slot") ?? 1) || 1) - 1));
player.selectedSlotIndex = slot;
} catch {}
});
const windChargeUsers = new Map();
world.afterEvents.itemUse.subscribe((event) => {
try {
const player = event.source;
const item = event.itemStack;
if (!player || !item) return;
if (item.typeId === "minecraft:wind_charge") {
windChargeUsers.set(player.id, system.currentTick);
}
} catch {}
});
function isWindChargeBoosted(player) {
if (!cfg.wind_charge_mace) return false;
const lastUse = windChargeUsers.get(player.id);
if (!lastUse) return false;
return system.currentTick - lastUse < 40;
}
function isSwordAttributeSwap(attacker) {
if (!cfg.sword_attribute_swap) return false;
const hasSwordTag = hasStateTag(attacker, "recent_sword");
const holdingMace = attacker.getComponent("minecraft:inventory")?.container?.getItem(attacker.selectedSlotIndex)?.typeId === "minecraft:mace";
return hasSwordTag && holdingMace;
}
const lungeSwappers = new Map();
function isLungeSwap(player) {
if (!cfg.lunge_swap) return false;
const lastLunge = lungeSwappers.get(player.id);
if (!lastLunge) return false;
return system.currentTick - lastLunge < 5;
}
function isSpearDoublePop(attacker) {
if (!cfg.spear_double_pop) return false;
const offhand = attacker.getComponent("minecraft:equippable")?.getEquipment("Offhand");
const isFalling = attacker.isFalling && !attacker.isOnGround;
return offhand?.typeId?.includes("spear") && isFalling;
}
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((event) => {
try {
const player = event.player;
const item = event.itemStack;
if (item?.hasTag?.("minecraft:is_sword")) {
setStateTag(player, "recent_sword", true);
system.runTimeout(() => {
try { setStateTag(player, "recent_sword", false); } catch {}
}, 10);
}
} catch {}
});
function getMaceTechniqueBonus(attacker) {
let bonus = 1;
if (isWindChargeBoosted(attacker)) bonus *= 1.2;
if (isSwordAttributeSwap(attacker)) bonus *= 1.15;
if (isLungeSwap(attacker)) bonus *= 1.1;
if (isSpearDoublePop(attacker)) bonus *= 1.25;
return bonus;
}