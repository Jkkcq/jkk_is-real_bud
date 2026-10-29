import { world, system, EquipmentSlot, GameMode } from "@minecraft/server";
import { cfg } from "../../engine/config.js";
import { onOffhandRightClick, onOffhandInteractRelease } from "../../engine/offhandRightClick.js";
import { ALLOWED_MAINHAND_TAG, OFFHAND_INTERACT_HOLD_ITEMS, OFFHAND_THROWABLES, THROW_COOLDOWNS } from "./listed_items.js";
const cooldownUntil = new Map();
const lastHandledTick = new Map();
const heldThrowLock = new Set();
const heldThrowReleaseRuns = new Map();
function refreshHeldThrowLock(playerId) {
const previous = heldThrowReleaseRuns.get(playerId);
if (previous !== undefined) system.clearRun(previous);
const release = system.runTimeout(() => {
heldThrowLock.delete(playerId);
heldThrowReleaseRuns.delete(playerId);
}, 20);
heldThrowReleaseRuns.set(playerId, release);
}
function hasAllowedWeaponTag(item) {
try { return Boolean(item?.hasTag(ALLOWED_MAINHAND_TAG) || item?.hasTag("bf:custom_shield_usable") || item?.hasTag("jk:custom_shield_usable")); }
catch { return false; }
}
function removeOneOffhand(player, item) {
if (player.getGameMode() === GameMode.Creative) return;
const equippable = player.getComponent("minecraft:equippable");
if (!equippable) return;
const current = equippable.getEquipment(EquipmentSlot.Offhand);
if (!current || current.typeId !== item.typeId) return;
const amount = Math.max(0, current.amount - 1);
try {
if (amount > 0) {
const remainder = current.clone();
remainder.amount = amount;
const result = equippable.setEquipment(EquipmentSlot.Offhand, remainder);
if (result === false) throw new Error("Offhand stack was rejected.");
} else {
const result = equippable.setEquipment(EquipmentSlot.Offhand, undefined);
if (result === false) throw new Error("Offhand clear was rejected.");
}
} catch {
try {
player.runCommand(amount > 0
? `replaceitem entity @s slot.weapon.offhand 0 ${current.typeId} ${amount}`
: "replaceitem entity @s slot.weapon.offhand 0 air");
} catch { }
}
}
function throwFromOffhand(player, item) {
const projectileType = OFFHAND_THROWABLES[item.typeId];
if (!projectileType) return false;
const cooldownKey = `${player.id}:${item.typeId}`;
const until = cooldownUntil.get(cooldownKey) ?? -1;
if (system.currentTick < until) return true;
const direction = player.getViewDirection();
const head = player.getHeadLocation();
const spawn = {
x: head.x + direction.x * 0.5,
y: head.y + direction.y * 0.25,
z: head.z + direction.z * 0.5
};
let projectile;
try {
projectile = player.dimension.spawnEntity(projectileType, spawn);
const component = projectile.getComponent("minecraft:projectile");
if (component) {
component.owner = player;
component.shoot({ x: direction.x * 1.5, y: direction.y * 1.5, z: direction.z * 1.5 });
}
} catch {
try { projectile?.remove(); } catch {}
return false;
}
const cooldown = Number(THROW_COOLDOWNS[item.typeId] ?? 0);
if (cooldown > 0) cooldownUntil.set(cooldownKey, system.currentTick + cooldown);
try { player.playSound("random.bow", { volume: 0.5, pitch: 0.5 }); } catch {}
try { removeOneOffhand(player, item); } catch {}
return true;
}
onOffhandRightClick(({ player, inputTick }) => {
if (!player || cfg.offhand_enabled === false || cfg.offhand_projectiles_enabled === false) return false;
if (heldThrowLock.has(player.id)) {
refreshHeldThrowLock(player.id);
return true;
}
const tick = Number.isFinite(inputTick) ? inputTick : system.currentTick;
if (lastHandledTick.get(player.id) === tick) return true;
let item;
let mainhand;
try {
const equippable = player.getComponent("minecraft:equippable");
const inventory = player.getComponent("minecraft:inventory")?.container;
item = equippable?.getEquipment(EquipmentSlot.Offhand);
mainhand = inventory?.getItem(player.selectedSlotIndex);
} catch { return false; }
if (!item || !OFFHAND_INTERACT_HOLD_ITEMS.has(item.typeId) || !OFFHAND_THROWABLES[item.typeId] || !hasAllowedWeaponTag(mainhand)) return false;
heldThrowLock.add(player.id);
refreshHeldThrowLock(player.id);
lastHandledTick.set(player.id, tick);
const result = throwFromOffhand(player, item);
if (!result) {
lastHandledTick.delete(player.id);
heldThrowLock.delete(player.id);
const release = heldThrowReleaseRuns.get(player.id);
if (release !== undefined) system.clearRun(release);
heldThrowReleaseRuns.delete(player.id);
}
return result;
});
onOffhandInteractRelease(({ player }) => {
if (!player?.id) return false;
lastHandledTick.delete(player.id);
const release = heldThrowReleaseRuns.get(player.id);
if (release !== undefined) system.clearRun(release);
heldThrowReleaseRuns.delete(player.id);
return heldThrowLock.delete(player.id);
});
try {
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
lastHandledTick.delete(playerId);
heldThrowLock.delete(playerId);
const release = heldThrowReleaseRuns.get(playerId);
if (release !== undefined) system.clearRun(release);
heldThrowReleaseRuns.delete(playerId);
for (const key of cooldownUntil.keys()) if (key.startsWith(`${playerId}:`)) cooldownUntil.delete(key);
});
} catch { }