import { system, world } from "@minecraft/server";
const RIGHT_CLICK_SOURCES = new Set(["UseItem", "Interact", "Build"]);
const handlers = new Set();
const releaseHandlers = new Set();
const lastHandledTick = new Map();
function readEventField(event, key) {
try {
return event?.[key];
} catch {
return undefined;
}
}
function safelySubscribe(name, getSignal, callback) {
try {
const signal = getSignal();
if (typeof signal?.subscribe !== "function") {
console.warn(`[JPVP] Offhand interact input ${name} is unavailable.`);
return false;
}
signal.subscribe((event) => {
try {
callback(event);
} catch (error) {
console.warn(`[JPVP] Offhand interact input ${name} failed.`, error);
}
});
return true;
} catch (error) {
console.warn(`[JPVP] Could not subscribe to offhand interact input ${name}.`, error);
return false;
}
}
function isPlayer(entity) {
try {
return entity?.typeId === "minecraft:player" && typeof entity.id === "string";
} catch {
return false;
}
}
function dispatch(event) {
const playerId = event?.player?.id;
if (!playerId) return false;
const previous = lastHandledTick.get(playerId);
if (previous === event.inputTick) return true;
let handled = false;
for (const handler of handlers) {
try {
if (handler(event) === true) handled = true;
} catch (error) {
console.warn("[JPVP] An offhand interact handler failed.", error);
}
}
if (handled) lastHandledTick.set(playerId, event.inputTick);
return handled;
}
function dispatchRelease(event) {
const playerId = event?.player?.id;
if (!playerId) return false;
let handled = false;
for (const handler of releaseHandlers) {
try {
if (handler(event) === true) handled = true;
} catch (error) {
console.warn("[JPVP] An offhand Interact release handler failed.", error);
}
}
return handled;
}
function routeSwing(event) {
const player = readEventField(event, "player");
const swingSource = readEventField(event, "swingSource");
if (!isPlayer(player) || !RIGHT_CLICK_SOURCES.has(swingSource)) return;
dispatch({
kind: "use",
inputSource: "playerSwingStart",
inputTick: system.currentTick,
player,
swingSource,
heldItemStack: readEventField(event, "heldItemStack"),
});
}
function routeItemUse(event) {
const player = readEventField(event, "source");
if (!isPlayer(player)) return;
dispatch({
kind: "use",
inputSource: "itemUse",
inputTick: system.currentTick,
player,
swingSource: "UseItem",
heldItemStack: readEventField(event, "itemStack"),
});
}
function routeItemStartUse(event) {
const player = readEventField(event, "source");
if (!isPlayer(player)) return;
dispatch({
kind: "use",
inputSource: "itemStartUse",
inputTick: system.currentTick,
player,
swingSource: "UseItem",
heldItemStack: readEventField(event, "itemStack"),
});
}
function routeBlockInteract(event) {
const player = readEventField(event, "player");
if (!isPlayer(player) || readEventField(event, "isFirstEvent") === false) return;
const block = readEventField(event, "block");
dispatch({
kind: "block",
inputSource: "playerInteractWithBlock",
inputTick: system.currentTick,
player,
swingSource: "Interact",
heldItemStack: readEventField(event, "itemStack") ?? readEventField(event, "beforeItemStack"),
block,
face: readEventField(event, "blockFace") ?? readEventField(event, "face"),
faceLocation: readEventField(event, "faceLocation"),
dimension: readEventField(event, "dimension") ?? block?.dimension,
});
}
function routeEntityInteract(event) {
const player = readEventField(event, "player");
if (!isPlayer(player) || readEventField(event, "isFirstEvent") === false) return;
dispatch({
kind: "entity",
inputSource: "playerInteractWithEntity",
inputTick: system.currentTick,
player,
swingSource: "Interact",
heldItemStack: readEventField(event, "itemStack"),
target: readEventField(event, "target"),
});
}
export function isOffhandRightClickSource(swingSource) {
return RIGHT_CLICK_SOURCES.has(swingSource);
}
export function onOffhandRightClick(handler) {
if (typeof handler !== "function") return () => {};
handlers.add(handler);
return () => handlers.delete(handler);
}
export function onOffhandInteractRelease(handler) {
if (typeof handler !== "function") return () => {};
releaseHandlers.add(handler);
return () => releaseHandlers.delete(handler);
}
function routeRelease(event, releaseKind) {
const player = readEventField(event, "source");
if (!isPlayer(player)) return;
dispatchRelease({
player,
inputTick: system.currentTick,
itemStack: readEventField(event, "itemStack"),
inputSource: "itemUseRelease",
releaseKind,
});
}
export function queueOffhandRightClick(player, heldItemStack) {
if (!isPlayer(player)) return;
system.run(() => dispatch({
kind: "use",
inputSource: "itemUseBefore",
inputTick: system.currentTick,
player,
swingSource: "UseItem",
heldItemStack,
}));
}
safelySubscribe("playerSwingStart", () => world.afterEvents.playerSwingStart, routeSwing);
safelySubscribe("itemUse", () => world.afterEvents.itemUse, routeItemUse);
safelySubscribe("itemStartUse", () => world.afterEvents.itemStartUse, routeItemStartUse);
safelySubscribe("itemReleaseUse", () => world.afterEvents.itemReleaseUse, event => routeRelease(event, "release"));
safelySubscribe("itemStopUse", () => world.afterEvents.itemStopUse, event => routeRelease(event, "stop"));
safelySubscribe("itemStopUseOn", () => world.afterEvents.itemStopUseOn, event => routeRelease(event, "release"));
safelySubscribe("playerInteractWithBlock", () => world.afterEvents.playerInteractWithBlock, routeBlockInteract);
safelySubscribe("playerInteractWithEntity", () => world.afterEvents.playerInteractWithEntity, routeEntityInteract);
safelySubscribe("playerLeave", () => world.afterEvents.playerLeave, ({ playerId }) => lastHandledTick.delete(playerId));