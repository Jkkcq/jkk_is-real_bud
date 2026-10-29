import { world, system } from '@minecraft/server';
const ENTITY_SYNCED_TAGS = new Set([
"heal",
"axe",
"sword",
"mace_cooldown",
"axe_cooldown",
"sword_cooldown",
]);
class PlayerState {
constructor() {
this.flags = new Set();
this.cooldown = undefined;
this.weaponSwapCooldownBypassUntilMs = 0;
this.shield = {
status: 'down',
raiseToken: 0,
lastItemDamageTick: 0,
shieldCd: undefined,
};
this.combat = {
recentHit: undefined,
justHit: undefined,
nextHit: undefined,
};
this.offhand = {
pressCount: 0,
firstPressTick: 0,
lastState: false,
pendingSwap: false,
lastSwapTick: 0,
};
}
}
const stateMap = new WeakMap();
export function getPlayerState(player) {
if (!player) return new PlayerState();
let state = stateMap.get(player);
if (!state) {
state = new PlayerState();
stateMap.set(player, state);
}
return state;
}
export function hasStateTag(player, tag) {
if (!player) return false;
if (ENTITY_SYNCED_TAGS.has(tag)) return player.hasTag(tag);
return getPlayerState(player).flags.has(tag);
}
export function setStateTag(player, tag, enabled = true) {
if (!player) return;
if (ENTITY_SYNCED_TAGS.has(tag)) {
if (enabled) { if (!player.hasTag(tag)) player.addTag(tag); }
else { if (player.hasTag(tag)) player.removeTag(tag); }
return;
}
const state = getPlayerState(player);
if (enabled) state.flags.add(tag);
else state.flags.delete(tag);
}
export function restoreLastVelocity(entity) {
if (!entity) return;
try {
if (entity.typeId === "minecraft:player") {
entity.clearVelocity();
system.runTimeout(() => {
entity.clearVelocity();
}, 2);
}
} catch (_) { }
}
export function getShieldState(player) {
if (!player) return 'down';
const state = getPlayerState(player);
return state.shield.status || 'down';
}
export function setShieldState(player, status) {
if (!player) return;
const next = status === 'up' || status === 'broken' ? status : 'down';
const state = getPlayerState(player);
state.shield.status = next;
}
export function clearState(player) {
stateMap.delete(player);
}
world.afterEvents.playerLeave.subscribe((event) => {
const player = event.player;
if (player) stateMap.delete(player);
});