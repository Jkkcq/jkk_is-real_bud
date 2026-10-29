import { system, world } from '@minecraft/server';
import { getPlayerState } from './states.js';
import { javaEngineEnabled, getJavaProgressPercent, startJavaCooldown, getJavaCooldownTicks } from './javaCombatEngine.js';
const WEAPON_SWAP_COOLDOWN_GRACE_MS = 20;
function isSwapCooldownWeapon(item) {
if (!item) return false;
const typeId = item.typeId ?? '';
if (typeId === 'minecraft:mace' || typeId === 'minecraft:trident' || typeId === 'bf:trident' || /(?:^|:)\w+spear$/.test(typeId)) {
return true;
}
try {
return item.hasTag?.('minecraft:is_spear') === true || item.hasTag?.('minecraft:is_trident') === true;
} catch {
return false;
}
}
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((event) => {
const player = event.player;
if (!player) return;
let item = event.itemStack;
if (!item) {
try {
item = player.getComponent('inventory')?.container?.getItem(event.newSlotSelected);
} catch { }
}
if (!isSwapCooldownWeapon(item)) return;
getPlayerState(player).weaponSwapCooldownBypassUntilMs = Date.now() + WEAPON_SWAP_COOLDOWN_GRACE_MS;
});
export function startCooldown(player, duration, selectedItem) {
if (!player) return;
if (javaEngineEnabled()) {
try {
startJavaCooldown(player, selectedItem);
return;
} catch {}
}
const state = getPlayerState(player);
const currentTick = system.currentTick;
const d = Math.max(0, Math.min(100, Number(duration) || 12));
state.cooldown = { endTick: currentTick + d, duration: d };
}
export function getCooldownPercentage(player, selectedItem) {
if (!player) return 100;
const state = getPlayerState(player);
if (isSwapCooldownWeapon(selectedItem) && Date.now() < state.weaponSwapCooldownBypassUntilMs) return 100;
if (javaEngineEnabled()) {
return getJavaProgressPercent(player, selectedItem);
}
const playerData = state.cooldown;
if (!playerData) return 100;
const { endTick, duration } = playerData;
const currentTick = system.currentTick;
if (currentTick >= endTick) {
getPlayerState(player).cooldown = undefined;
return 100;
}
const ticksElapsed = currentTick - (endTick - duration);
const percentage = (ticksElapsed / duration) * 100;
return Math.max(0, Math.min(100, percentage));
}
export function clearPlayerCooldowns(player) {
getPlayerState(player).cooldown = undefined;
}