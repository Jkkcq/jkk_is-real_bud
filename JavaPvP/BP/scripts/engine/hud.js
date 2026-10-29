
import { world, system, EquipmentSlot } from '@minecraft/server';
import { getCooldownPercentage } from './cooldown.js';
import { getPlayerState, hasStateTag, setStateTag, getShieldState, setShieldState } from './states.js';
import { ModalFormData } from '@minecraft/server-ui';
import { cfg } from './config.js';
import { OFFHAND_ICON_STEMS, OFFHAND_LONG_ICON_ALIASES, OFFHAND_FALLBACK_STEM } from './offhandIcons.js';
import {
saturationIcons,
armorGlyphs,
armorWarnings,
shieldGlyphs,
shieldGlyphsSlot,
cooldownGlyphMapHotbar,
cooldownGlyphMap,
cooldownGlyphMapHighContrast,
entityCooldownGlyphMap,
entityCooldownGlyphMapHighContrast,
HEART_DEFAULT,
HEART_HEAL,
ARMOR_WARNING,
TARGET_READY,
TARGET_READY_HIGH_CONTRAST,
TARGET_EMPTY,
COOLDOWN_CACHE,
ARMOR_CACHE,
SHIELD_CACHE,
SATURATION_CACHE,
TARGET_CROSSHAIR_DEFAULT,
TARGET_CROSSHAIR_2,
TARGET_CROSSHAIR_3,
TARGET_CROSSHAIR_4,
TARGET_CROSSHAIR_5,
TARGET_CROSSHAIR_6,
TARGET_CROSSHAIR_7,
TARGET_CROSSHAIR_8,
TARGET_CROSSHAIR_9,
TARGET_CROSSHAIR_10,
SHIELD_SLOT_CACHE,
TOTEM_SLOT_CACHE,
SLOT_CACHE,
offhandNumbers,
} from './icons.js';
const ARMOR_MATERIALS = [
"netherite", "diamond", "golden", "iron", "chainmail", "leather", "turtle", "copper",
];
const BUILTIN_ARMOR_HUD = false;
const ARMOR_TEXTURE_FIELD_WIDTH = 10;
const ARMOR_TEXTURE_FIELDS_EMPTY = "n~~~~~~~~~".repeat(4);
const OFFHAND_TEXTURE_WIDTH = 17;
const OFFHAND_TEXTURE_EMPTY = "n" + "~".repeat(OFFHAND_TEXTURE_WIDTH);
const EFFECT_SLOT_COUNT = 8;
const EFFECT_NAME_WIDTH = 12;
const ARMOR_BAR_LEVELS = "abcdefghijk";
const EFFECT_FIELD_PAD = "n" + "~".repeat(EFFECT_NAME_WIDTH) + " ";
const EFFECT_FIELDS_EMPTY = EFFECT_FIELD_PAD.repeat(EFFECT_SLOT_COUNT);
const EFFECT_TEXTURE_ALIASES = {
mining_fatigue: "mine_fatigue",
fire_resistance: "fire_resist",
water_breathing: "water_breath",
hero_of_the_village: "hero",
village_hero: "hero",
breath_of_the_nautilus: "nautilus",
dolphins_grace: "dolphins",
conduit_power: "conduit",
instant_damage: "instant_dmg",
instant_health: "instant_hp",
fatal_poison: "poison",
};
const OFFHAND_TEXTURE_ALIASES = {
wood_sword: "wooden_sword", wood_axe: "wooden_axe", wood_pickaxe: "wooden_pickaxe",
grass_block: "grass", dirt_path: "grass_path", short_grass: "grass",
wood_hoe: "wooden_hoe", wood_shovel: "wooden_shovel",
gold_sword: "golden_sword", gold_axe: "golden_axe", gold_pickaxe: "golden_pickaxe",
gold_hoe: "golden_hoe", gold_shovel: "golden_shovel",
beef_raw: "beef", beef_cooked: "cooked_beef", chicken_raw: "chicken",
chicken_cooked: "cooked_chicken", mutton_raw: "mutton", mutton_cooked: "cooked_mutton",
porkchop_raw: "porkchop", porkchop_cooked: "cooked_porkchop", rabbit_raw: "rabbit",
rabbit_cooked: "cooked_rabbit", fish_raw: "cod", fish_cooked: "cooked_cod",
fish_salmon_raw: "salmon", fish_salmon_cooked: "cooked_salmon",
fish_pufferfish_raw: "pufferfish", fish_clownfish_raw: "tropical_fish",
potato_baked: "baked_potato", apple_golden: "golden_apple",
carrot_golden: "golden_carrot", enchanted_golden_apple: "enchanted_apple",
crossbow: "crossbow_standby",
shield: "custom_shield", shield_black: "black_shield", shield_blue: "blue_shield",
shield_brown: "brown_shield", shield_cyan: "cyan_shield", shield_gray: "gray_shield",
shield_green: "green_shield", shield_light_blue: "light_blue_shield",
shield_light_gray: "light_gray_shield", shield_lime: "lime_shield",
shield_magenta: "magenta_shield", shield_orange: "orange_shield",
shield_pilager: "ominous_shield", shield_pink: "pink_shield",
shield_purple: "purple_shield", shield_red: "red_shield",
shield_white: "white_shield", shield_yellow: "yellow_shield",
};
const OFFHAND_CUSTOM_TEXTURES = {
};
function padRight(value, width, pad = "~") {
let out = String(value ?? "").slice(0, width);
while (out.length < width) out += pad;
return out;
}
function armorTextureStem(item) {
if (!item?.typeId) return "";
const id = item.typeId;
if (id === "minecraft:elytra") return "elytra";
for (const material of ARMOR_MATERIALS) {
if (id.includes(`${material}_`)) return material;
}
return "";
}
function armorTextureFields(player) {
const eq = player.getComponent("minecraft:equippable");
if (!eq) return ARMOR_TEXTURE_FIELDS_EMPTY;
return ARMOR_SLOTS.map((slot) => {
const stem = armorTextureStem(eq.getEquipment(slot));
return stem ? `y${padRight(stem, ARMOR_TEXTURE_FIELD_WIDTH - 1)}` : "n~~~~~~~~~";
}).join("");
}
function offhandTextureStem(item) {
if (!item?.typeId) return "";
let stem = item.typeId.slice(item.typeId.indexOf(":") + 1);
if (stem.endsWith("_offhand")) stem = stem.slice(0, -8);
stem = OFFHAND_TEXTURE_ALIASES[stem] ?? stem;
stem = OFFHAND_LONG_ICON_ALIASES[stem] ?? stem;
if (stem && /^[a-z0-9_]{1,32}$/.test(stem)) return stem;
return OFFHAND_FALLBACK_STEM;
}
function effectTextureStem(effect) {
const id = String(effect?.typeId ?? "");
const raw = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
const stem = EFFECT_TEXTURE_ALIASES[raw] ?? raw;
return /^[a-z0-9_]{1,12}$/.test(stem) ? stem : "";
}
function effectTimer(effect) {
const duration = Number(effect?.duration);
if (!Number.isFinite(duration) || duration <= 0) return "INF ";
const seconds = Math.max(0, Math.floor(duration / 20));
const minutes = Math.floor(seconds / 60);
if (minutes > 99) return ">99m ";
return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function updateEffectFields(player, cache) {
const serverEnabled = cfg.potion_hud_server ?? true;
const playerEnabled = player.getDynamicProperty("potion_hud") ?? true;
if (!serverEnabled || !playerEnabled) {
cache.effectFields = EFFECT_FIELDS_EMPTY;
return;
}
let effects = [];
try {
effects = player.getEffects().map((effect) => ({
stem: effectTextureStem(effect),
duration: Number(effect.duration),
effect,
})).filter((entry) => entry.stem);
} catch {
cache.effectFields = EFFECT_FIELDS_EMPTY;
return;
}
effects.sort((a, b) => {
const at = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number.POSITIVE_INFINITY;
const bt = Number.isFinite(b.duration) && b.duration > 0 ? b.duration : Number.POSITIVE_INFINITY;
return at - bt;
});
const fields = effects.slice(0, EFFECT_SLOT_COUNT).map(({ stem, effect }) =>
`y${padRight(stem, EFFECT_NAME_WIDTH)}${effectTimer(effect)}`);
while (fields.length < EFFECT_SLOT_COUNT) fields.push(EFFECT_FIELD_PAD);
cache.effectFields = fields.join("");
}
const ARMOR_SLOTS = [
EquipmentSlot.Head,
EquipmentSlot.Chest,
EquipmentSlot.Legs,
EquipmentSlot.Feet,
];
const CROSSHAIR_GLYPHS = [
TARGET_CROSSHAIR_DEFAULT,
TARGET_CROSSHAIR_2,
TARGET_CROSSHAIR_3,
TARGET_CROSSHAIR_4,
TARGET_CROSSHAIR_5,
TARGET_CROSSHAIR_6,
TARGET_CROSSHAIR_7,
TARGET_CROSSHAIR_8,
TARGET_CROSSHAIR_9,
TARGET_CROSSHAIR_10,
TARGET_EMPTY,
];
function getHudCache(player) {
const state = getPlayerState(player);
if (!state.hud) {
state.hud = {
shieldSide: "l",
platformType: "d",
cooldownBarType: "d",
crosshair: TARGET_EMPTY,
crosshairEnabled: true,
crosshairStyle: 0,
shieldPlayerEnabled: true,
offhandMode: "slot",
cooldownBarStyle: 1,
sat: SATURATION_CACHE,
satLevelCode: "z",
shield: SHIELD_CACHE,
shieldSlot: SHIELD_CACHE,
shieldNum: SHIELD_CACHE + SHIELD_CACHE,
offhandTexture: OFFHAND_TEXTURE_EMPTY,
armorTextureFields: ARMOR_TEXTURE_FIELDS_EMPTY,
armorHudFlag: "y",
armorHudStyle: "h",
armorBarLevels: "aaaa",
effectFields: EFFECT_FIELDS_EMPTY,
armorWarning: ARMOR_CACHE,
armor: ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE,
heart: "",
cooldown: COOLDOWN_CACHE,
lastSubtitle: "",
lastTitle: "",
lastCooldownPercent: 0,
lastEntityInView: false,
entityInView: false,
shieldCd: undefined,
promptedUI: false,
};
}
return state.hud;
}
function getHealthComponent(entity) {
return entity.getComponent('minecraft:health');
}
function gethealth(entity) {
const healthEffect = entity.getEffect("minecraft:health_boost");
if (!healthEffect) return 0;
return 4 * (healthEffect.amplifier + 1);
}
function getArmorGlyph(item) {
if (!item || !item.typeId || !item.getComponent) return '';
const durabilityComp = item.getComponent('minecraft:durability');
if (!durabilityComp) return '';
const percent = 1 - (durabilityComp.damage / durabilityComp.maxDurability);
const idx = Math.max(0, Math.min(armorGlyphs.length - 1, Math.floor(percent * 10)));
return armorGlyphs[idx];
}
function getArmorBarLevel(item) {
const durabilityComp = item?.getComponent?.("minecraft:durability");
if (!durabilityComp || !durabilityComp.maxDurability) return ARMOR_BAR_LEVELS[0];
const percent = Math.max(0, Math.min(1, 1 - (durabilityComp.damage / durabilityComp.maxDurability)));
const level = Math.max(0, Math.min(10, Math.round(percent * 10)));
return ARMOR_BAR_LEVELS[level];
}
function getEntityInView(player, maxDistance = 3) {
const hits = player.getEntitiesFromViewDirection({ maxDistance });
return hits.some(hit => {
const entity = hit?.entity;
return entity && entity.id !== player.id;
});
}
function updateSatLayer(player, cache) {
const serverEnabled = cfg.sat_hud_server ?? true;
const playerEnabled = player.getDynamicProperty("sat_hud") ?? true;
const satValue = player.getComponent("player.saturation")?.currentValue;
if (
!serverEnabled ||
playerEnabled === false ||
player.matches({ gameMode: 'Creative' }) ||
player.matches({ gameMode: 'Spectator' }) ||
typeof satValue !== "number"
) {
cache.sat = SATURATION_CACHE;
cache.satLevelCode = "z";
return;
}
const level = Math.max(0, Math.min(20, Math.floor(satValue)));
cache.satLevelCode = String.fromCharCode(97 + level);
const glyphIndex = Math.min(level, saturationIcons.length - 1);
cache.sat = (typeof saturationIcons[glyphIndex] === "string") ? saturationIcons[glyphIndex] : SATURATION_CACHE;
}
function updateHeart(player, cache) {
if (player?.hasTag("heal")) {
const maxHealth = getHealthComponent(player).effectiveMax;
if (maxHealth === 20 && gethealth(player) === 0) {
cache.heart = HEART_HEAL;
return;
}
}
cache.heart = HEART_DEFAULT;
}
function updateShieldLayer(player, cache) {
const serverEnabled = cfg.shield_hud_server ?? true;
const playerEnabled = cache.shieldPlayerEnabled;
const offhandMode = cache.offhandMode;
if (cache.shieldReady && system.currentTick % 2 === 1 && getShieldState(player) !== 'broken') return;
cache.shieldReady = true;
cache.shield = SHIELD_CACHE;
cache.shieldSlot = SHIELD_CACHE;
cache.shieldNum = SHIELD_CACHE + SHIELD_CACHE;
cache.offhandTexture = OFFHAND_TEXTURE_EMPTY;
const eq = player.getComponent && player.getComponent('minecraft:equippable');
let offhandItem = undefined;
if (eq && eq.getEquipment) {
offhandItem = eq.getEquipment(EquipmentSlot.Offhand);
}
if (offhandItem && offhandItem.typeId) {
const isShield = offhandItem.typeId.includes("shield");
const brokenShield = isShield && getShieldState(player) === "broken";
if (offhandMode === "slot" && (!brokenShield || !isShield)) {
const texture = offhandTextureStem(offhandItem);
cache.offhandTexture = `y${padRight(texture, OFFHAND_TEXTURE_WIDTH)}`;
cache.shieldSlot = SHIELD_CACHE;
cache.shield = SHIELD_CACHE;
if (isShield) {
cache.shieldNum = SHIELD_CACHE + (getArmorGlyph(offhandItem) || SHIELD_CACHE);
} else {
const amount = Math.max(1, Number(offhandItem.amount) || 1);
if (amount >= 10) {
cache.shieldNum = (offhandNumbers[Math.floor(amount / 10)] ?? SHIELD_CACHE)
+ (offhandNumbers[amount % 10] ?? SHIELD_CACHE);
} else if (amount > 1) {
cache.shieldNum = SHIELD_CACHE + (offhandNumbers[amount] ?? SHIELD_CACHE);
} else {
cache.shieldNum = SHIELD_CACHE + SHIELD_CACHE;
}
}
cache.shieldCd = undefined;
return;
}
}
if (getShieldState(player) !== 'broken') {
cache.shield = SHIELD_CACHE;
cache.shieldSlot = "";
cache.shieldNum = "";
return;
}
const cooldownSec = Number(cfg.custom_shield_cooldown ?? 5);
const cooldownTicks = Math.max(1, Math.round(cooldownSec * 20));
let cd = cache.shieldCd ?? cooldownTicks;
cd--;
cache.shieldCd = cd;
let idx;
if (offhandMode === "slot") {
idx = 15 - Math.max(0, Math.min(15, Math.floor((cd / cooldownTicks) * 16)));
if (serverEnabled && playerEnabled) {
cache.shield = shieldGlyphsSlot[idx];
}
} else {
idx = 9 - Math.max(0, Math.min(9, Math.floor((cd / cooldownTicks) * 10)));
if (serverEnabled && playerEnabled) {
cache.shield = shieldGlyphs[idx];
}
}
if (cd <= 0) {
setShieldState(player, 'down');
cache.shieldCd = undefined;
}
}
function updateArmorLayer(player, cache) {
const serverEnabled = cfg.armor_hud_server ?? true;
const playerEnabled = player.getDynamicProperty("armor_hud") ?? true;
const requestedStyle = player.getDynamicProperty("armor_hud_style") ?? "h";
cache.armorHudStyle = requestedStyle === "v" || requestedStyle === "b" ? requestedStyle : "h";
const enabled = BUILTIN_ARMOR_HUD && serverEnabled && playerEnabled;
cache.armorHudFlag = enabled ? "y" : "n";
if (!enabled) {
cache.armor = ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE;
cache.armorWarning = ARMOR_CACHE;
cache.armorTextureFields = ARMOR_TEXTURE_FIELDS_EMPTY;
cache.armorBarLevels = "aaaa";
return;
}
const eq = player.getComponent('minecraft:equippable');
if (!eq) {
cache.armorTextureFields = ARMOR_TEXTURE_FIELDS_EMPTY;
cache.armorBarLevels = "aaaa";
cache.armor = ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE;
cache.armorWarning = ARMOR_CACHE;
return;
}
cache.armorTextureFields = armorTextureFields(player);
cache.armorBarLevels = ARMOR_SLOTS.map((slot) => getArmorBarLevel(eq.getEquipment(slot))).join("");
let warningCount = 0;
for (const slot of ARMOR_SLOTS) {
const item = eq.getEquipment(slot);
const durabilityComp = item?.getComponent?.('minecraft:durability');
if (!durabilityComp) continue;
const percent = 1 - (durabilityComp.damage / durabilityComp.maxDurability);
if (percent <= 0.2) warningCount++;
}
cache.armorWarning = warningCount > 0 ? armorWarnings[warningCount - 1] : ARMOR_CACHE;
const helmet = eq.getEquipment(EquipmentSlot.Head);
const chest = eq.getEquipment(EquipmentSlot.Chest);
const legs = eq.getEquipment(EquipmentSlot.Legs);
const boots = eq.getEquipment(EquipmentSlot.Feet);
cache.armor = (getArmorGlyph(helmet) || ARMOR_CACHE)
+ (getArmorGlyph(chest) || ARMOR_CACHE)
+ (getArmorGlyph(legs) || ARMOR_CACHE)
+ (getArmorGlyph(boots) || ARMOR_CACHE);
}
function updateCooldownHud(player, cache) {
const serverEnabled = cfg.cooldown_hud ?? true;
if (!serverEnabled) {
cache.cooldown = COOLDOWN_CACHE;
return;
}
let barStyle = cache.cooldownBarStyle;
if (barStyle === 0) {
cache.cooldown = COOLDOWN_CACHE;
return;
}
const cooldownPercent = getCooldownPercentage(player);
const needsView = cache.crosshairEnabled || cache.cooldownBarType !== "h";
const entityInView = needsView && system.currentTick % 2 === 0 ? getEntityInView(player) : (needsView ? cache.entityInView : false);
cache.entityInView = entityInView;
let glyphIndex;
let title = TARGET_EMPTY;
const type = cache.cooldownBarType;
if (type === "h") {
glyphIndex = Math.max(0, Math.min(15, Math.round((cooldownPercent / 100) * 15)));
title = cooldownGlyphMapHotbar[glyphIndex];
if (cooldownPercent >= 100) {
title = TARGET_EMPTY;
}
} else if (type === "c") {
glyphIndex = Math.max(0, Math.min(32, Math.round((cooldownPercent / 100) * 32)));
title = cooldownGlyphMapHighContrast[glyphIndex];
if (cooldownPercent >= 100) {
title = entityInView ? TARGET_READY_HIGH_CONTRAST : COOLDOWN_CACHE;
} else if (entityInView) {
title = entityCooldownGlyphMapHighContrast[glyphIndex];
}
} else {
glyphIndex = Math.max(0, Math.min(32, Math.round((cooldownPercent / 100) * 32)));
title = cooldownGlyphMap[glyphIndex];
if (cooldownPercent >= 100) {
title = entityInView ? TARGET_READY : COOLDOWN_CACHE;
} else if (entityInView) {
title = entityCooldownGlyphMap[glyphIndex];
}
}
const crosshairEnabled = cache.crosshairEnabled;
const chosenCrosshair = CROSSHAIR_GLYPHS[cache.crosshairStyle] || TARGET_CROSSHAIR_DEFAULT;
if (crosshairEnabled) {
if (entityInView) {
cache.crosshair = chosenCrosshair;
} else {
cache.crosshair = TARGET_EMPTY;
}
} else {
cache.crosshair = TARGET_EMPTY;
}
if (!entityInView) {
cache.crosshair = TARGET_EMPTY;
}
if (typeof cache.crosshair !== "string" || cache.crosshair.length !== 1) {
cache.crosshair = TARGET_EMPTY;
}
if (!title) title = TARGET_EMPTY;
cache.cooldown = title;
cache.lastCooldownPercent = cooldownPercent;
cache.lastEntityInView = entityInView;
}
function field3(g) {
const ch = (typeof g === "string" && g.length > 0) ? g.charAt(0) : TARGET_EMPTY;
const pad = TARGET_EMPTY;
return ch + pad + pad;
}
function buildText(cache) {
const snRaw = (typeof cache.shieldNum === "string" && cache.shieldNum.length >= 2)
? cache.shieldNum
: (SATURATION_CACHE + SATURATION_CACHE);
const sn = (snRaw.charAt(0) + snRaw.charAt(1) + TARGET_EMPTY);
const ar = (typeof cache.armor === "string" && cache.armor.length >= 4) ? cache.armor : (ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE + ARMOR_CACHE);
const armor4 =
ar.charAt(0) + TARGET_EMPTY + TARGET_EMPTY
+ ar.charAt(1) + TARGET_EMPTY + TARGET_EMPTY
+ ar.charAt(2) + TARGET_EMPTY + TARGET_EMPTY
+ ar.charAt(3) + TARGET_EMPTY + TARGET_EMPTY;
let base =
"java_pvp."
+ (cache.shieldSide || "l")
+ (cache.platformType || "d")
+ (cache.cooldownBarType || "d")
+ field3(cache.cooldown ?? TARGET_EMPTY)
+ field3(cache.shieldSlot ?? SLOT_CACHE)
+ field3(cache.shield ?? SHIELD_CACHE)
+ field3(cache.heart ?? HEART_DEFAULT)
+ field3(cache.sat ?? SATURATION_CACHE)
+ field3(cache.crosshair ?? TARGET_EMPTY)
+ sn
+ field3(cache.armorWarning ?? ARMOR_CACHE)
+ armor4;
if (base.length < 51) base = base + TARGET_EMPTY.repeat(51 - base.length);
if (base.length > 51) base = base.slice(0, 51);
return base
+ (cache.armorTextureFields ?? ARMOR_TEXTURE_FIELDS_EMPTY)
+ (cache.offhandTexture ?? OFFHAND_TEXTURE_EMPTY)
+ (cache.effectFields ?? EFFECT_FIELDS_EMPTY)
+ (cache.armorHudFlag ?? "n")
+ (cache.satLevelCode ?? "z")
+ (cache.armorHudStyle ?? "h")
+ (cache.armorBarLevels ?? "aaaa");
}
export function updatePlayerHud(player, tickFlags = {}) {
if (player.isValid && player?.hasTag("ui_off")) return;
const { isEvery10Ticks = true, isEvery20Ticks = true } = tickFlags;
const cache = getHudCache(player);
if (isEvery20Ticks) {
const uiProfile = player.getDynamicProperty("ui_profile");
if (uiProfile === "d" || uiProfile === "p") {
cache.platformType = uiProfile;
} else {
let inputMode = player.inputInfo?.lastInputModeUsed;
if (inputMode === "KeyboardAndMouse") {
cache.platformType = "d";
} else if (inputMode === "Touch") {
const mobileOffset = player.getDynamicProperty("offset");
cache.platformType = (mobileOffset === false) ? "d" : "m";
}
}
let shieldSide = player.getDynamicProperty("shield_side");
if (shieldSide === "right" || shieldSide === "r") {
cache.shieldSide = "r";
} else if (shieldSide === "left" || shieldSide === "l") {
cache.shieldSide = "l";
}
let cooldownBarType = player.getDynamicProperty("cooldown_bar_type");
if (cooldownBarType === "h" || cooldownBarType === "d") {
cache.cooldownBarType = cooldownBarType;
} else {
cache.cooldownBarType = "d";
}
cache.crosshairEnabled = Boolean(player.getDynamicProperty("crosshair_hit_indicator") ?? true);
const cs = player.getDynamicProperty("crosshair_indicator_style");
cache.crosshairStyle = (typeof cs === "number" && cs >= 0 && cs <= 10) ? cs : 0;
cache.shieldPlayerEnabled = player.getDynamicProperty("shield_hud") ?? true;
cache.offhandMode = player.getDynamicProperty("offhand_mode") ?? "slot";
const cbs = player.getDynamicProperty("cooldown_bar");
cache.cooldownBarStyle = (typeof cbs === "number") ? cbs : 1;
}
if (isEvery10Ticks) {
updateSatLayer(player, cache);
updateEffectFields(player, cache);
}
if (isEvery20Ticks) updateArmorLayer(player, cache);
updateShieldLayer(player, cache);
updateHeart(player, cache);
updateCooldownHud(player, cache);
const hudText = buildText(cache);
const hudNow = system.currentTick;
if (hudText === cache.lastHudText && hudNow - (cache.lastHudTick ?? -9) < 2) return;
cache.lastHudText = hudText;
cache.lastHudTick = hudNow;
player.onScreenDisplay.setTitle(" ", {
stayDuration: 0,
fadeInDuration: 0,
fadeOutDuration: 0,
});
player.onScreenDisplay.updateSubtitle(hudText);
}

// Saturation shower HUD
function getSaturationIcon(sat) {
  if (sat >= 16) return "textures/ui/saturation/sat_full";
  if (sat >= 11) return "textures/ui/saturation/sat_high";
  if (sat >= 6) return "textures/ui/saturation/sat_mid";
  return "textures/ui/saturation/sat_low";
}

function showSaturationHUD(player) {
  if (!cfg.saturation_hud_enabled) return;
  try {
    const sat = player.getComponent("player.saturation")?.currentValue ?? 0;
    const icon = getSaturationIcon(sat);
    // Display actionbar with saturation
    const bars = Math.ceil(sat / 2);
    const display = "§e" + "▣".repeat(Math.min(10, bars)) + "§7" + "▣".repeat(Math.max(0, 10 - bars));
    player.onScreenDisplay.setActionBar(display + " §f" + Math.floor(sat));
  } catch {}
}

// Hook into existing HUD update
system.runInterval(() => {
  if (!cfg.saturation_hud_enabled) return;
  try {
    for (const player of world.getPlayers()) {
      showSaturationHUD(player);
    }
  } catch {}
}, 10);
