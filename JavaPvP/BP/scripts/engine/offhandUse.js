import { world, system, EquipmentSlot } from "@minecraft/server";
import { cfg } from "./config.js";
import { onOffhandRightClick, onOffhandInteractRelease, queueOffhandRightClick } from "./offhandRightClick.js";
import { OFFHAND_THROWABLES } from "../extra/offhand/listed_items.js";
import {
activateFromRightClick,
releaseFromRightClick,
onPlayerLeave as onTridentPlayerLeave,
onProjectileHitBlock,
onProjectileHitEntity,
onScriptEventReceive
} from "../extra/offhand/trident/handler.js";
const lastTridentClick = new Map();
const ALLOWED_WEAPON_TAGS = ["jk:custom_shield_usable", "bf:custom_shield_usable"];
function hasTag(item, tag) {
try { return Boolean(item?.hasTag(tag)); } catch { return false; }
}
function isTrident(item) {
return item?.typeId === "minecraft:trident" || item?.typeId === "bf:trident";
}
function getHands(player) {
try {
const inventory = player.getComponent("minecraft:inventory")?.container;
const equippable = player.getComponent("minecraft:equippable");
if (!inventory || !equippable) return undefined;
return {
mainhand: inventory.getItem(player.selectedSlotIndex),
offhand: equippable.getEquipment(EquipmentSlot.Offhand)
};
} catch { return undefined; }
}
onOffhandRightClick(({ player, inputTick }) => {
if (!player || cfg.offhand_enabled === false || cfg.offhand_tridents_enabled === false) return false;
const hands = getHands(player);
if (!hands) return false;
const isMainhandTrident = isTrident(hands.mainhand);
const isOffhandTridentCombo = hands.offhand?.typeId === "bf:trident" &&
ALLOWED_WEAPON_TAGS.some((tag) => hasTag(hands.mainhand, tag));
if (!isMainhandTrident && !isOffhandTridentCombo) return false;
const tick = Number.isFinite(inputTick) ? inputTick : system.currentTick;
if (lastTridentClick.get(player.id) === tick) return true;
lastTridentClick.set(player.id, tick);
return activateFromRightClick(player, hands.mainhand);
});
onOffhandInteractRelease(({ player }) => releaseFromRightClick(player));
try {
world.beforeEvents.itemUse.subscribe((event) => {
if (isTrident(event?.itemStack)) {
if (event.itemStack.typeId === "minecraft:trident") {
event.cancel = true;
queueOffhandRightClick(event.source, event.itemStack);
}
return;
}
const typeId = event?.itemStack?.typeId;
if (!typeId || !OFFHAND_THROWABLES[typeId]) return;
const hands = getHands(event.source);
if (hands?.offhand?.typeId === typeId && hands.mainhand?.typeId !== typeId) {
event.cancel = true;
queueOffhandRightClick(event.source, event.itemStack);
}
});
} catch { }
try {
world.afterEvents.playerLeave.subscribe(({ playerId }) => lastTridentClick.delete(playerId));
} catch { }
function safeSubscribe(signalGetter, handler) {
try {
const signal = signalGetter();
if (typeof signal?.subscribe !== "function") return;
signal.subscribe((event) => { try { handler(event); } catch (error) { console.warn("[JPVP] Trident event handler failed.", error); } });
} catch { }
}
safeSubscribe(() => world.afterEvents.playerLeave, onTridentPlayerLeave);
safeSubscribe(() => world.afterEvents.projectileHitBlock, onProjectileHitBlock);
safeSubscribe(() => world.afterEvents.projectileHitEntity, onProjectileHitEntity);
safeSubscribe(() => world.afterEvents.scriptEventReceive, onScriptEventReceive);