import { world, system } from "@minecraft/server";
import { cfg } from "../engine/config.js";
import { javaEngineEnabled, getJavaProgress, getJavaAttackSpeed, JAVA_SPECIAL_MIN_P } from "../engine/javaCombatEngine.js";
function qolOn() {
try {
return cfg.combat_qol_enabled !== false;
} catch {
return true;
}
}
function bar(p) {
const n = 10;
const filled = Math.round(Math.min(1, Math.max(0, p)) * n);
return "§a" + "▌".repeat(filled) + "§8" + "▌".repeat(n - filled);
}
function chargeLabel(p) {
if (p >= 0.999) return "§aFULL";
if (p >= JAVA_SPECIAL_MIN_P) return "§eREADY";
if (p >= 0.5) return "§6mid";
return "§cweak";
}
const lastTip = new Map();
function maybeTip(player, key, msg, everyTicks = 400) {
if (cfg.combat_tips_enabled === false) return;
const now = system.currentTick;
const k = player.id + ":" + key;
if ((lastTip.get(k) ?? -9999) + everyTicks > now) return;
lastTip.set(k, now);
try { player.sendMessage("§7[Combat]§r " + msg); } catch {}
}
system.runInterval(() => {
if (!qolOn() || cfg.combat_charge_hud === false) return;
if (!javaEngineEnabled()) return;
for (const player of world.getPlayers()) {
try {
if (player.hasTag("jpvp_hide_charge")) continue;
const item = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
const p = getJavaProgress(player, item);
const speed = getJavaAttackSpeed(item);
const name = item?.typeId?.replace("minecraft:", "") ?? "fist";
const text = `§7${name} §8${speed.toFixed(1)}/s ${bar(p)} §f${Math.round(p * 100)}% ${chargeLabel(p)}`;
player.onScreenDisplay.setActionBar(text);
if (p < 0.35) {
maybeTip(player, "weak", "§fEarly swings still hit, but deal §cless damage§f (Java charge curve). Wait for §aFULL§f for max DPS.");
} else if (p >= JAVA_SPECIAL_MIN_P && p < 0.99) {
maybeTip(player, "special", "§fAt §e≥85%§f you can §acrit§f (while falling, not sprinting), §bsprint-KB§f, or §dsweep§f.");
}
} catch {}
}
}, 8);
try {
world.afterEvents.playerSpawn.subscribe((ev) => {
if (!ev.initialSpawn || !qolOn()) return;
if (cfg.combat_tips_enabled === false) return;
system.runTimeout(() => {
try {
ev.player.sendMessage([
"§6=== Java-style combat (Bedrock pack) ===",
"§7• Swinging early still hits — damage follows §f0.2+0.8×charge²",
"§7• §eCrit / sprint knockback / sweep§7 need §f≥85%§7 charge",
"§7• Enchants: §fSharpness/Smite/Bane/Impaling§7 scale with charge; §fKnockback/Fire Aspect§7 on-hit",
"§7• Mace: §fDensity§7 (+0.5/block/level), §fBreach§7 (armor ignore), §fWind Burst§7 (smash launch)",
"§7• Action bar shows charge · hide: §f/tag @s add jpvp_hide_charge",
].join("\n"));
} catch {}
}, 40);
});
} catch {}
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
for (const k of [...lastTip.keys()]) {
if (k.startsWith(playerId)) lastTip.delete(k);
}
});