import { world, system, CommandPermissionLevel, CustomCommandStatus, CustomCommandParamType } from '@minecraft/server';
import { ModalFormData, ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { updateRules } from './itemSystem.js';
import { syncInvisibleDeathRule } from './deathMessages.js';
export function showMainConfigMenu(player) {
reloadConfig();
const useServerCollectionIcons = Boolean(world.getDynamicProperty("server_collection_icons_enabled") ?? false);
const form = new ActionFormData()
.title("§l§dAddon Configuration")
.header(`§l§dAddon Configuration`)
.divider()
.body("Choose a category to configure:")
.button("Combat", useServerCollectionIcons ? "textures/codegeek_icons/gold_sword" : "textures/ui/sword")
.button("Extra Features", useServerCollectionIcons ? "textures/codegeek_icons/quick_play" : "textures/ui/debug_glyph_color")
.button("HUD", useServerCollectionIcons ? "textures/codegeek_icons/armor" : "textures/ui/hunger_effect")
.button("Additional Content")
.button("Presets", useServerCollectionIcons ? "textures/codegeek_icons/leaderboards" : "textures/ui/achievements_pause_menu_icon")
.button("Reset Config", useServerCollectionIcons ? "textures/codegeek_icons/cross" : "textures/ui/wysiwyg_reset")
.button("Pack Compatibility");
form.show(player).then(response => {
if (response.canceled) return;
if (response.selection === 0) showCombatConfigMenu(player);
if (response.selection === 1) showExtraConfigMenu(player);
if (response.selection === 2) showHudConfigMenu(player);
if (response.selection === 3) showAdditionalContentMenu(player);
if (response.selection === 4) showPresetMenu(player);
if (response.selection === 5) showResetConfigConfirm(player);
if (response.selection === 6) showPackCompatibilityConfig(player);
});
function showPresetMenu(player) {
const form = new ActionFormData()
.title("§l§bPresets")
.body("Choose a preset to apply. All previous config changes will be lost!")
.button("Optimized Mode")
.button("Casual / Easy Mode")
.button("Random Goofy");
form.show(player).then(response => {
if (response.canceled) {
showMainConfigMenu(player);
return;
}
if (response.selection === 0) showPresetConfirm(player, 'optimized');
if (response.selection === 1) showPresetConfirm(player, 'casual');
if (response.selection === 2) showPresetConfirm(player, 'goofy');
});
}
function showPresetConfirm(player, preset) {
const form = new MessageFormData()
.title("§cApply Preset?")
.body("Are you sure you want to apply this preset? All changes made to the config before will be lost!")
.button1("§cYes, Apply")
.button2("Cancel");
form.show(player).then(response => {
if (response.selection === 0) {
applyPreset(player, preset);
} else {
showPresetMenu(player);
}
});
}
function applyPreset(player, preset) {
resetAllAdminConfig(player);
if (preset === 'optimized') {
world.setDynamicProperty("java_saturation_enabled", true);
world.setDynamicProperty("java_saturation_speed", 1.0);
world.setDynamicProperty("anti_spam_enabled", true);
world.setDynamicProperty("custom_shield_enabled", true);
world.setDynamicProperty("custom_shield_cooldown", 5);
world.setDynamicProperty("custom_shield_stunning", false);
world.setDynamicProperty("knockback_profile", 0);
world.setDynamicProperty("kb_horizontal", 1.0);
world.setDynamicProperty("kb_vertical", 1.0);
world.setDynamicProperty("damage_multiplier", 1.0);
world.setDynamicProperty("cooldown_damage_scaling", true);
world.setDynamicProperty("hud_sweep_particle", true);
world.setDynamicProperty("hud_crit_particle", true);
world.setDynamicProperty("hud_attack_sound", true);
world.setDynamicProperty("hud_crit_sound", true);
world.setDynamicProperty("bow_ding_enabled", false);
world.setDynamicProperty("auto_crystal_enabled", false);
world.setDynamicProperty("wind_boost_multiplier", 1.0);
world.setDynamicProperty("portal_waterlog_enabled", false);
world.setDynamicProperty("tnt_minecarts_enabled", false);
world.setDynamicProperty("tnt_minecarts_stackable", false);
world.setDynamicProperty("cobweb_preset", 1);
world.setDynamicProperty("cobweb_enabled", true);
world.setDynamicProperty("xp_fast", false);
world.setDynamicProperty("xp_auto_pull", false);
world.setDynamicProperty("offhand_enabled", false);
world.setDynamicProperty("offhand_foods_enabled", false);
world.setDynamicProperty("offhand_swap_enabled", true);
world.setDynamicProperty("underwater_doors_enabled", false);
world.setDynamicProperty("breach_swap_enabled", false);
world.setDynamicProperty("breach_swap_ticks", 1);
world.setDynamicProperty("xp_speed", 3);
} else if (preset === 'casual') {
world.setDynamicProperty("java_saturation_enabled", true);
world.setDynamicProperty("java_saturation_speed", 1.15);
world.setDynamicProperty("anti_spam_enabled", true);
world.setDynamicProperty("anti_spam_partial_threshold", 50);
world.setDynamicProperty("custom_shield_enabled", true);
world.setDynamicProperty("custom_shield_cooldown", 4);
world.setDynamicProperty("custom_shield_stunning", false);
world.setDynamicProperty("knockback_profile", 0);
world.setDynamicProperty("kb_horizontal", 1.05);
world.setDynamicProperty("kb_vertical", 1.0);
world.setDynamicProperty("damage_multiplier", 1.0);
world.setDynamicProperty("cooldown_damage_scaling", true);
world.setDynamicProperty("hud_sweep_particle", true);
world.setDynamicProperty("hud_crit_particle", true);
world.setDynamicProperty("hud_attack_sound", true);
world.setDynamicProperty("hud_crit_sound", true);
world.setDynamicProperty("crosshair_hit_indicator", true);
world.setDynamicProperty("sat_hud_server", false);
world.setDynamicProperty("armor_hud_server", true);
world.setDynamicProperty("cooldown_bar_type", "d");
world.setDynamicProperty("bow_ding_enabled", true);
world.setDynamicProperty("auto_crystal_enabled", false);
world.setDynamicProperty("offhand_enabled", true);
world.setDynamicProperty("offhand_foods_enabled", true);
world.setDynamicProperty("offhand_swap_enabled", true);
world.setDynamicProperty("xp_fast", true);
world.setDynamicProperty("xp_auto_pull", true);
world.setDynamicProperty("xp_speed", 4);
} else if (preset === 'goofy') {
function rand() { return Math.floor(Math.random() * 5) + 1; }
function randBool() { return Math.random() < 0.5; }
world.setDynamicProperty("java_saturation_enabled", randBool());
world.setDynamicProperty("java_saturation_speed", rand());
world.setDynamicProperty("anti_spam_enabled", randBool());
world.setDynamicProperty("custom_shield_enabled", randBool());
world.setDynamicProperty("custom_shield_cooldown", rand());
world.setDynamicProperty("custom_shield_stunning", randBool());
world.setDynamicProperty("knockback_profile", rand());
world.setDynamicProperty("kb_horizontal", rand());
world.setDynamicProperty("kb_vertical", rand());
world.setDynamicProperty("damage_multiplier", rand());
world.setDynamicProperty("cooldown_damage_scaling", randBool());
world.setDynamicProperty("hud_sweep_particle", randBool());
world.setDynamicProperty("hud_crit_particle", randBool());
world.setDynamicProperty("hud_attack_sound", randBool());
world.setDynamicProperty("hud_crit_sound", randBool());
world.setDynamicProperty("bow_ding_enabled", randBool());
world.setDynamicProperty("auto_crystal_enabled", randBool());
world.setDynamicProperty("wind_boost_multiplier", rand());
world.setDynamicProperty("portal_waterlog_enabled", randBool());
world.setDynamicProperty("tnt_minecarts_enabled", randBool());
world.setDynamicProperty("tnt_minecarts_stackable", randBool());
world.setDynamicProperty("cobweb_preset", rand());
world.setDynamicProperty("cobweb_enabled", randBool());
world.setDynamicProperty("xp_fast", randBool());
world.setDynamicProperty("xp_auto_pull", randBool());
world.setDynamicProperty("offhand_enabled", randBool());
world.setDynamicProperty("offhand_foods_enabled", randBool());
world.setDynamicProperty("offhand_swap_enabled", randBool());
world.setDynamicProperty("underwater_doors_enabled", randBool());
world.setDynamicProperty("breach_swap_enabled", randBool());
world.setDynamicProperty("breach_swap_ticks", rand());
world.setDynamicProperty("xp_speed", rand());
}
reloadConfig();
player.sendMessage("§aPreset applied!");
showMainConfigMenu(player);
}
function showResetConfigConfirm(player) {
const form = new MessageFormData()
.title("§cReset All Config")
.body("Are you sure you want to reset all admin config settings to default? This cannot be undone.")
.button1("§cYes, Reset")
.button2("Cancel");
form.show(player).then(response => {
if (response.selection === 0) {
resetAllAdminConfig(player);
} else {
showMainConfigMenu(player);
}
});
}
function resetAllAdminConfig(player) {
world.setDynamicProperty("java_saturation_enabled", true);
world.setDynamicProperty("java_saturation_speed", 1.0);
world.setDynamicProperty("anti_spam_enabled", true);
world.setDynamicProperty("custom_shield_enabled", true);
world.setDynamicProperty("custom_shield_cooldown", 5);
world.setDynamicProperty("custom_shield_stunning", true);
world.setDynamicProperty("knockback_profile", 0);
world.setDynamicProperty("kb_horizontal", 1.0);
world.setDynamicProperty("kb_vertical", 1.0);
world.setDynamicProperty("damage_multiplier", 1.0);
world.setDynamicProperty("cooldown_damage_scaling", true);
world.setDynamicProperty("hud_sweep_particle", true);
world.setDynamicProperty("hud_crit_particle", true);
world.setDynamicProperty("hud_attack_sound", true);
world.setDynamicProperty("hud_crit_sound", true);
world.setDynamicProperty("bow_ding_enabled", true);
world.setDynamicProperty("auto_crystal_enabled", true);
world.setDynamicProperty("wind_boost_multiplier", 1.0);
world.setDynamicProperty("portal_waterlog_enabled", true);
world.setDynamicProperty("tnt_minecarts_enabled", true);
world.setDynamicProperty("tnt_minecarts_stackable", true);
world.setDynamicProperty("cobweb_preset", 1);
world.setDynamicProperty("cobweb_enabled", true);
world.setDynamicProperty("xp_fast", true);
world.setDynamicProperty("xp_auto_pull", true);
world.setDynamicProperty("offhand_enabled", true);
world.setDynamicProperty("offhand_foods_enabled", true);
world.setDynamicProperty("offhand_swap_enabled", true);
world.setDynamicProperty("underwater_doors_enabled", true);
world.setDynamicProperty("breach_swap_enabled", true);
world.setDynamicProperty("breach_swap_ticks", 1);
world.setDynamicProperty("xp_speed", 3);
for (const property of dynamicProperties) {
world.setDynamicProperty(property.id, property.value);
}
reloadConfig();
syncInvisibleDeathRule();
updateRules();
showMainConfigMenu(player);
}
}
function showCombatConfigMenu(player) {
reloadConfig();
const form = new ActionFormData()
.title("§l§cCombat Settings")
.header(`§l§cCombat Settings`)
.divider()
.body("Choose a combat subcategory:")
.button("Java Saturation")
.button("Core")
.button("Custom Shield")
.button("Knockback")
.button("Damage")
.button("Weapon Cooldowns")
.button("Advanced Damage")
.button("Anti-Spam")
.button("Sweeps & Breach")
.button("Mace Wind Burst")
.button("Combat QoL (Bedrock)")
.button("Breach Swap")
.button("Balanced PvP")
.button("Java Parity");
form.show(player).then(response => {
if (response.canceled) {
showMainConfigMenu(player);
return;
};
if (response.selection === 0) showJavaSaturationConfig(player);
if (response.selection === 1) showCoreCombatConfig(player);
if (response.selection === 2) showCustomShieldConfig(player);
if (response.selection === 3) showKnockbackConfig(player);
if (response.selection === 4) showDamageConfig(player);
if (response.selection === 5) showWeaponCooldownConfig(player);
if (response.selection === 6) showAdvancedDamageConfig(player);
if (response.selection === 7) showAntiSpamConfig(player);
if (response.selection === 8) showSweepBreachConfig(player);
if (response.selection === 9) showMaceWindBurstConfig(player);
if (response.selection === 10) showCombatQolConfig(player);
if (response.selection === 11) showBreachSwapConfig(player);
if (response.selection === 12) showBalancedPvPConfig(player);
if (response.selection === 13) showJavaParityConfig(player);
});
}
function showBalancedPvPConfig(player) {
reloadConfig();
const form = new ModalFormData().title("§l§cBalanced PvP");
form.label("PvP only: TNT carts 70/74; mace 52 + Density 2/level + Strength 3/level.");
form.label("Spear caps: wood 20, stone/gold 24, copper 28, iron 32, diamond 40, netherite 48. Crystals/anchors 5; 30-second combat logging; stasis-pearl cleanup. Breach stays normal.");
form.toggle("Enable Balanced PvP", { defaultValue: Boolean(world.getDynamicProperty("balanced_pvp_enabled") ?? false) });
form.show(player).then(response => saveConfigForm(player, response, 1, showCombatConfigMenu, values => {
world.setDynamicProperty("balanced_pvp_enabled", Boolean(values[0]));
}, "Could not save Balanced PvP settings."));
}
function showBreachSwapConfig(player) {
const form = new ModalFormData().title("§l§dAttribute / Breach / Stun Slam");
form.header(`§l§dAttribute / Breach / Stun Slam`);
form.divider();
form.label("Stun Slam: axe disables shield, then mace smash lands.\nAttribute mode (default) uses the swap window.\nJava accurate requires a real axe stun first.");
const enabled = Boolean(world.getDynamicProperty("breach_swap_enabled") ?? true);
const ticks = Number(world.getDynamicProperty("breach_swap_ticks") ?? 1);
const grace = Number(world.getDynamicProperty("attribute_swap_grace_ticks") ?? 6);
const mode = String(world.getDynamicProperty("stun_slam_mode") ?? "attribute");
form.toggle("Enable Breach Swap (axe/sword → mace)", { defaultValue: enabled });
form.slider("Breach Swap window (ticks)", 1, 15, { defaultValue: Math.max(1, Math.min(15, ticks)) });
form.slider("Weapon attribute grace (ticks)", 1, 20, { defaultValue: Math.max(1, Math.min(20, grace)) });
form.dropdown("Stun Slam Mode", ["attribute (default)", "java_accurate"], { defaultValueIndex: mode === "java_accurate" ? 1 : 0 });
const maceIgnore = Boolean(world.getDynamicProperty("mace_swap_ignore_cooldown") ?? false);
form.toggle("Mace swap ignore cooldown (tiny window)", { defaultValue: maceIgnore });
form.show(player).then(response => {
if (response.canceled) {
showCombatConfigMenu(player);
return;
};
const vals = response.formValues || [];
const toggle = vals.length >= 4 ? vals[vals.length - 4] : vals[0];
const bTicks = vals.length >= 4 ? vals[vals.length - 3] : vals[1];
const gTicks = vals.length >= 4 ? vals[vals.length - 2] : vals[2];
const modeIdx = vals.length >= 4 ? vals[vals.length - 1] : 0;
world.setDynamicProperty("breach_swap_enabled", Boolean(toggle));
world.setDynamicProperty("breach_swap_ticks", Math.max(1, Math.min(15, Number(bTicks) || 1)));
world.setDynamicProperty("attribute_swap_grace_ticks", Math.max(1, Math.min(20, Number(gTicks) || 6)));
world.setDynamicProperty("stun_slam_mode", Number(modeIdx) === 1 ? "java_accurate" : "attribute");
const maceIgnoreVal = vals.length >= 5 ? vals[vals.length - 1] : false;
world.setDynamicProperty("mace_swap_ignore_cooldown", Boolean(maceIgnoreVal));
player.sendMessage("§aAttribute / Breach Swap settings saved.");
showCombatConfigMenu(player);
});
}
function showJavaSaturationConfig(player) {
const form = new ModalFormData().title("§l§eJava Saturation");
const enabled = Boolean(world.getDynamicProperty("java_saturation_enabled") ?? true);
form.toggle("Enable Java Saturation", { defaultValue: enabled });
addNumericField(form, "Saturation speed", 0.1, 5, configSliderDefault("java_saturation_speed", 1, 0.1, 5));
addNumericField(form, "Healing per saturation tick", 0, 10, configSliderDefault("java_saturation_heal_amount", 2, 0, 10));
addNumericField(form, "Hunger / saturation cost per heal", 0, 10, configSliderDefault("java_saturation_drain_amount", 2, 0, 10));
addNumericField(form, "Hunger threshold for healing", 10, 20, configSliderDefault("java_saturation_hunger_threshold", 18, 10, 20));
form.show(player).then(response => saveConfigForm(player, response, 5, showCombatConfigMenu, values => {
world.setDynamicProperty("java_saturation_enabled", Boolean(values[0]));
world.setDynamicProperty("java_saturation_speed", clampNumber(Number(values[1]), 0.1, 5, 1));
world.setDynamicProperty("java_saturation_heal_amount", clampNumber(Number(values[2]), 0, 10, 2));
world.setDynamicProperty("java_saturation_drain_amount", clampNumber(Number(values[3]), 0, 10, 2));
world.setDynamicProperty("java_saturation_hunger_threshold", clampNumber(Number(values[4]), 10, 20, 18));
}, "Could not save saturation settings."));
}
function showCoreCombatConfig(player) {
const form = new ModalFormData().title("§l§cCombat Core");
form.label("Hits can deal scaled damage while the weapon recharges. Set the minimum cooldown strength required for a hit.");
addNumericField(form, "Cooldown required to land a hit (%)", 0, 100, configSliderDefault("anti_spam_partial_threshold", 0, 0, 100));
form.show(player).then(response => saveConfigForm(player, response, 1, showCombatConfigMenu, values => {
world.setDynamicProperty("anti_spam_partial_threshold", clampNumber(Number(values[0]), 0, 100, 65));
}, "Could not save combat core settings."));
}
function showCustomShieldConfig(player) {
const form = new ModalFormData().title("§l§6Custom Shield");
const enabled = Boolean(world.getDynamicProperty("custom_shield_enabled") ?? true);
const stunning = Boolean(world.getDynamicProperty("custom_shield_stunning") ?? true);
form.toggle("Enable Custom Shield", { defaultValue: enabled });
addNumericField(form, "Shield break cooldown (seconds)", 1, 30, configSliderDefault("custom_shield_cooldown", 5, 1, 30));
form.toggle("Enable Shield Stunning", { defaultValue: stunning });
addNumericField(form, "Shield stun duration (ticks)", 1, 40, configSliderDefault("custom_shield_stun_ticks", 4, 1, 40));
form.toggle("Axe attacks break blocking shields", { defaultValue: Boolean(world.getDynamicProperty("custom_shield_axe_break_enabled") ?? true) });
addNumericField(form, "Axe shield disable chance (%)", 0, 100, configSliderDefault("custom_shield_axe_disable_chance", 100, 0, 100));
addNumericField(form, "Shield facing angle (degrees)", 30, 180, configSliderDefault("shield_facing_threshold_degrees", 90, 30, 180));
addNumericField(form, "Durability per normal hit", 0, 20, configSliderDefault("custom_shield_hit_durability", 1, 0, 20));
addNumericField(form, "Durability per mace hit", 0, 50, configSliderDefault("custom_shield_mace_durability", 10, 0, 50));
form.toggle("Enable shield raise delay", { defaultValue: Boolean(world.getDynamicProperty("custom_shield_raise_delay_enabled") ?? true) });
addNumericField(form, "Shield raise delay (ticks)", 0, 20, configSliderDefault("custom_shield_raise_delay_ticks", 5, 0, 20));
form.show(player).then(response => saveConfigForm(player, response, 11, showCombatConfigMenu, values => {
const value = Boolean(values[0]);
world.setDynamicProperty("custom_shield_enabled", value);
world.setDynamicProperty("shield", value);
world.setDynamicProperty("custom_shield_cooldown", clampNumber(Number(values[1]), 1, 30, 5));
world.setDynamicProperty("custom_shield_stunning", Boolean(values[2]));
world.setDynamicProperty("custom_shield_stun_ticks", Math.round(clampNumber(Number(values[3]), 1, 40, 4)));
world.setDynamicProperty("custom_shield_axe_break_enabled", Boolean(values[4]));
world.setDynamicProperty("custom_shield_axe_disable_chance", clampNumber(Number(values[5]), 0, 100, 100));
world.setDynamicProperty("shield_facing_threshold_degrees", clampNumber(Number(values[6]), 30, 180, 90));
world.setDynamicProperty("custom_shield_hit_durability", Math.round(clampNumber(Number(values[7]), 0, 20, 1)));
world.setDynamicProperty("custom_shield_mace_durability", Math.round(clampNumber(Number(values[8]), 0, 50, 10)));
world.setDynamicProperty("custom_shield_raise_delay_enabled", Boolean(values[9]));
world.setDynamicProperty("custom_shield_raise_delay_ticks", Math.round(clampNumber(Number(values[10]), 0, 20, 5)));
updateRules();
}, "Could not save shield settings."));
}
function showKnockbackConfig(player) {
const form = new ModalFormData().title("§l§bKnockback");
form.label("Adjust the existing Beta 4 knockback profiles and multipliers.");
const kbProfile = clampNumber(Math.trunc(Number(world.getDynamicProperty("knockback_profile") ?? 0)), 0, 2);
form.dropdown("Knockback Profile", ["Legacy", "Modern", "Experimental"], { defaultValueIndex: kbProfile });
addNumericField(form, "Horizontal knockback multiplier", 0, 5, configSliderDefault("kb_horizontal", 1, 0, 5));
addNumericField(form, "Vertical knockback multiplier", 0, 5, configSliderDefault("kb_vertical", 1, 0, 5));
addNumericField(form, "Sprint knockback multiplier", 0, 3, configSliderDefault("sprint_knockback_multiplier", 1, 0, 3));
addNumericField(form, "Axe knockback multiplier", 0, 3, configSliderDefault("axe_knockback_multiplier", 1, 0, 3));
addNumericField(form, "Minimum cooldown for sprint knockback (%)", 0, 100, configSliderDefault("sprint_knockback_min_cooldown", 85, 0, 100));
form.show(player).then(response => saveConfigForm(player, response, 6, showCombatConfigMenu, values => {
world.setDynamicProperty("knockback_profile", clampNumber(Math.trunc(Number(values[0])), 0, 2));
world.setDynamicProperty("kb_horizontal", clampNumber(Number(values[1]), 0, 5, 1));
world.setDynamicProperty("kb_vertical", clampNumber(Number(values[2]), 0, 5, 1));
world.setDynamicProperty("sprint_knockback_multiplier", clampNumber(Number(values[3]), 0, 3, 1));
world.setDynamicProperty("axe_knockback_multiplier", clampNumber(Number(values[4]), 0, 3, 1));
world.setDynamicProperty("sprint_knockback_min_cooldown", clampNumber(Number(values[5]), 0, 100, 65));
}, "Could not save knockback settings."));
}
function showDamageConfig(player) {
const form = new ModalFormData().title("§l§dDamage & Mace Smash");
form.label("Tune the Beta 4 damage scale and the older JPVP mace smash nerf.");
addNumericField(form, "Damage Multiplier", 0, 5, configSliderDefault("damage_multiplier", 1, 0, 5));
form.toggle("Enable Cooldown Damage Scaling", { defaultValue: Boolean(world.getDynamicProperty("cooldown_damage_scaling") ?? true) });
form.toggle("Scale added mace fall damage", { defaultValue: Boolean(world.getDynamicProperty("mace_smash_fall_nerf_enabled") ?? true) });
addNumericField(form, "Mace damage at one block", 0, 100, configSliderDefault("mace_one_block_damage", 5, 0, 100));
addNumericField(form, "Added fall damage multiplier", 0, 2, configSliderDefault("mace_air_damage_multiplier", 0.65, 0, 2));
addNumericField(form, "Density bonus per level", 0, 1, configSliderDefault("mace_density_multiplier_per_level", 0.05, 0, 1));
form.show(player).then(response => saveConfigForm(player, response, 6, showCombatConfigMenu, values => {
world.setDynamicProperty("damage_multiplier", clampNumber(Number(values[0]), 0, 5, 1));
world.setDynamicProperty("cooldown_damage_scaling", Boolean(values[1]));
world.setDynamicProperty("mace_smash_fall_nerf_enabled", Boolean(values[2]));
world.setDynamicProperty("mace_one_block_damage", clampNumber(Number(values[3]), 0, 100, 5));
world.setDynamicProperty("mace_air_damage_multiplier", clampNumber(Number(values[4]), 0, 2, 0.65));
world.setDynamicProperty("mace_density_multiplier_per_level", clampNumber(Number(values[5]), 0, 1, 0.05));
}, "Could not save damage settings."));
}
function getFormValues(response) {
if (!Array.isArray(response?.formValues)) return [];
return response.formValues.filter(value => value !== undefined && value !== null);
}
function configSliderDefault(id, fallback, min, max) {
const value = Number(world.getDynamicProperty(id) ?? fallback);
return Number.isFinite(value) ? clampNumber(value, min, max) : fallback;
}
function addNumericField(form, label, min, max, value) {
const number = Number(value);
const defaultValue = Number.isFinite(number) ? clampNumber(number, min, max) : min;
form.textField(`${label} (${min}–${max})`, "Enter a number", { defaultValue: String(defaultValue) });
}
function saveConfigForm(player, response, expectedLength, menu, writeValues, label) {
if (response.canceled) { menu(player); return; }
const values = getFormValues(response);
if (values.length !== expectedLength) {
player.sendMessage("Settings were not changed because the form returned incomplete values.");
menu(player);
return;
}
try {
writeValues(values);
reloadConfig();
menu(player);
} catch (error) {
console.warn(`[JPVP] ${label}`, error);
player.sendMessage("Settings could not be saved. Close other menus and try again.");
menu(player);
}
}
function showWeaponCooldownConfig(player) {
const form = new ModalFormData().title("§l§cWeapon Cooldowns");
form.label("Set the attack recovery time for each weapon group. Defaults match this Beta 4 build.");
const rows = [
["cooldown_default", "Default / fist", 12, 0, 60],
["cooldown_mace", "Mace", 33, 0, 80],
["cooldown_sword", "Swords", 13, 0, 60],
["cooldown_axe_light", "Wood / copper / stone axes", 25, 0, 60],
["cooldown_axe_iron", "Iron axes", 22, 0, 60],
["cooldown_axe_heavy", "Gold / diamond / netherite axes", 20, 0, 60],
["cooldown_trident", "Tridents", 18, 0, 60],
["cooldown_shovel", "Shovels", 20, 0, 60],
["cooldown_pickaxe", "Pickaxes", 20, 0, 60],
["cooldown_hoe", "Hoes", 7, 0, 60],
["cooldown_spear", "Spear fallback", 20, 0, 60],
];
for (const [id, label, fallback, min, max] of rows) addNumericField(form, label, min, max, configSliderDefault(id, fallback, min, max));
form.show(player).then(response => saveConfigForm(player, response, rows.length, showCombatConfigMenu, values => {
rows.forEach(([id, , fallback, min, max], index) => world.setDynamicProperty(id, clampNumber(Number(values[index]), min, max, fallback)));
}, "Could not save weapon cooldown settings."));
}
function showAdvancedDamageConfig(player) {
const form = new ModalFormData().title("§l§dAdvanced Damage");
form.label("Optional controls adjust the current Beta 4 damage formula. Defaults preserve its current values.");
const rows = [
["critical_hits_enabled", "Enable critical damage multiplier", true],
["critical_damage_multiplier", "Critical damage multiplier", 1.5, 0, 3],
["critical_hits_min_cooldown", "Minimum cooldown for critical hits (%)", 0, 0, 100],
["sharpness_damage_base", "Sharpness base bonus", 0.5, 0, 3],
["sharpness_damage_per_level", "Sharpness bonus per level", 0.5, 0, 3],
["strength_damage_per_level", "Strength damage per level", 3, 0, 10],
["weakness_damage_per_level", "Weakness reduction per level", 4, 0, 10],
["java_mob_enchantments_enabled", "Add Java Smite / Bane mob damage", false],
["mob_enchant_damage_per_level", "Smite / Bane bonus per level", 2.5, 0, 8],
["player_damage_multiplier", "Damage against players", 1, 0, 5],
["mob_damage_multiplier", "Damage against mobs", 1, 0, 5],
];
for (const [id, label, fallback, min, max] of rows) {
if (typeof fallback === "boolean") form.toggle(label, { defaultValue: Boolean(world.getDynamicProperty(id) ?? fallback) });
else addNumericField(form, label, min, max, configSliderDefault(id, fallback, min, max));
}
form.show(player).then(response => saveConfigForm(player, response, rows.length, showCombatConfigMenu, values => {
rows.forEach(([id, , fallback, min, max], index) => {
const value = typeof fallback === "boolean" ? Boolean(values[index]) : clampNumber(Number(values[index]), min, max, fallback);
world.setDynamicProperty(id, value);
});
}, "Could not save advanced damage settings."));
}
function showAntiSpamConfig(player) {
const form = new ModalFormData().title("§l§6Anti-Spam");
form.label("The cooldown gate always applies. This toggle controls only the extra spam penalties.");
form.toggle("Apply Anti-Spam penalties", { defaultValue: Boolean(world.getDynamicProperty("anti_spam_enabled") ?? true) });
addNumericField(form, "Cooldown required to land a hit (%)", 0, 100, configSliderDefault("anti_spam_partial_threshold", 0, 0, 100));
addNumericField(form, "Weakness duration (ticks)", 1, 200, configSliderDefault("anti_spam_weakness_ticks", 30, 1, 200));
form.show(player).then(response => saveConfigForm(player, response, 3, showCombatConfigMenu, values => {
world.setDynamicProperty("anti_spam_enabled", Boolean(values[0]));
world.setDynamicProperty("anti_spam_partial_threshold", clampNumber(Number(values[1]), 0, 100, 65));
world.setDynamicProperty("anti_spam_weakness_ticks", Math.round(clampNumber(Number(values[2]), 1, 200, 30)));
}, "Could not save anti-spam settings."));
}
function showSweepBreachConfig(player) {
const form = new ModalFormData().title("§l§bSweeps & Breach");
form.label("Tune sword sweep damage and the existing axe/sword Breach swaps.");
form.toggle("Enable Sword Sweeps", { defaultValue: Boolean(world.getDynamicProperty("sword_sweep_enabled") ?? true) });
addNumericField(form, "Sweep range (blocks)", 0, 6, configSliderDefault("sword_sweep_range", 1.5, 0, 6));
addNumericField(form, "Sweep damage multiplier", 0, 2, configSliderDefault("sword_sweep_damage_multiplier", 0.5, 0, 2));
addNumericField(form, "Sweep minimum cooldown (%)", 0, 100, configSliderDefault("sword_sweep_min_cooldown", 85, 0, 100));
addNumericField(form, "Axe Breach flat damage", 0, 20, configSliderDefault("breach_axe_flat_damage", 1.75, 0, 20));
addNumericField(form, "Axe Breach damage per level", 0, 10, configSliderDefault("breach_axe_damage_per_level", 0.3, 0, 10));
addNumericField(form, "Sword Breach flat damage", 0, 20, configSliderDefault("breach_sword_flat_damage", 1.25, 0, 20));
addNumericField(form, "Sword Breach damage per level", 0, 10, configSliderDefault("breach_sword_damage_per_level", 0.3, 0, 10));
form.show(player).then(response => saveConfigForm(player, response, 8, showCombatConfigMenu, values => {
world.setDynamicProperty("sword_sweep_enabled", Boolean(values[0]));
world.setDynamicProperty("sword_sweep_range", clampNumber(Number(values[1]), 0, 6, 1.5));
world.setDynamicProperty("sword_sweep_damage_multiplier", clampNumber(Number(values[2]), 0, 2, 0.5));
world.setDynamicProperty("sword_sweep_min_cooldown", clampNumber(Number(values[3]), 0, 100, 65));
world.setDynamicProperty("breach_axe_flat_damage", clampNumber(Number(values[4]), 0, 20, 1.75));
world.setDynamicProperty("breach_axe_damage_per_level", clampNumber(Number(values[5]), 0, 10, 0.3));
world.setDynamicProperty("breach_sword_flat_damage", clampNumber(Number(values[6]), 0, 20, 1.25));
world.setDynamicProperty("breach_sword_damage_per_level", clampNumber(Number(values[7]), 0, 10, 0.3));
}, "Could not save sweep and Breach settings."));
}

function showJavaParityConfig(player) {
const form = new ModalFormData().title("§l§2Java Parity");
form.label("Core Java-feel systems that were missing or only half wired.");
form.toggle("Ender pearl cooldown", { defaultValue: Boolean(world.getDynamicProperty("java_pearl_cooldown_enabled") ?? true) });
addNumericField(form, "Pearl cooldown (ticks)", 5, 40, configSliderDefault("java_pearl_cooldown_ticks", 20, 5, 40));
form.toggle("Hit interrupts eating / charging", { defaultValue: Boolean(world.getDynamicProperty("java_hit_interrupt_use") ?? true) });
form.toggle("Crit coyote air window", { defaultValue: Boolean(world.getDynamicProperty("java_crit_coyote_enabled") ?? true) });
addNumericField(form, "Crit coyote ticks", 1, 8, configSliderDefault("java_crit_coyote_ticks", 3, 1, 8));
form.toggle("Egg / snowball throw spacing", { defaultValue: Boolean(world.getDynamicProperty("java_throwable_cooldown_enabled") ?? true) });
addNumericField(form, "Throwable spacing (ticks)", 1, 20, configSliderDefault("java_throwable_cooldown_ticks", 4, 1, 20));
form.show(player).then(response => saveConfigForm(player, response, 7, showCombatConfigMenu, values => {
world.setDynamicProperty("java_pearl_cooldown_enabled", Boolean(values[0]));
world.setDynamicProperty("java_pearl_cooldown_ticks", Math.round(clampNumber(Number(values[1]), 5, 40, 20)));
world.setDynamicProperty("java_hit_interrupt_use", Boolean(values[2]));
world.setDynamicProperty("java_crit_coyote_enabled", Boolean(values[3]));
world.setDynamicProperty("java_crit_coyote_ticks", Math.round(clampNumber(Number(values[4]), 1, 8, 3)));
world.setDynamicProperty("java_throwable_cooldown_enabled", Boolean(values[5]));
world.setDynamicProperty("java_throwable_cooldown_ticks", Math.round(clampNumber(Number(values[6]), 1, 20, 4)));
}, "Could not save Java parity settings."));
}
function showCombatQolConfig(player) {
const form = new ModalFormData().title("§l§aCombat QoL (Bedrock)");
form.label("Helps Bedrock players understand Java-style charge combat and enchants (Sharpness, Smite, Breach, Density, Wind Burst, Knockback, Fire Aspect, Sweeping Edge).");
form.toggle("Enable combat QoL", { defaultValue: Boolean(world.getDynamicProperty("combat_qol_enabled") ?? true) });
form.toggle("Show charge on action bar", { defaultValue: Boolean(world.getDynamicProperty("combat_charge_hud") ?? true) });
form.toggle("Beginner combat tips in chat", { defaultValue: Boolean(world.getDynamicProperty("combat_tips_enabled") ?? true) });
form.label("Hide bar: /tag @s add jpvp_hide_charge");
form.show(player).then(response => saveConfigForm(player, response, 3, showCombatConfigMenu, values => {
world.setDynamicProperty("combat_qol_enabled", Boolean(values[0]));
world.setDynamicProperty("combat_charge_hud", Boolean(values[1]));
world.setDynamicProperty("combat_tips_enabled", Boolean(values[2]));
}, "Could not save combat QoL."));
}
function showMaceWindBurstConfig(player) {
const form = new ModalFormData().title("§l§bMace Wind Burst");
form.label("Java-like: after a successful mace smash, Wind Burst launches YOU upward (~7 blocks per level). Only on smash, not ground hits.");
form.toggle("Enable Wind Burst launch", { defaultValue: Boolean(world.getDynamicProperty("wind_burst_enabled") ?? true) });
addNumericField(form, "Wind Burst strength multiplier", 0, 5, configSliderDefault("wind_burst_multiplier", 1, 0, 5));
addNumericField(form, "Blocks per Wind Burst level", 1, 12, configSliderDefault("wind_burst_blocks_per_level", 7, 1, 12));
addNumericField(form, "Density damage per block per level", 0, 2, configSliderDefault("mace_density_per_block_per_level", 0.5, 0, 2));
form.show(player).then(response => saveConfigForm(player, response, 4, showCombatConfigMenu, values => {
world.setDynamicProperty("wind_burst_enabled", Boolean(values[0]));
world.setDynamicProperty("wind_burst_multiplier", clampNumber(Number(values[1]), 0, 5, 1));
world.setDynamicProperty("wind_burst_blocks_per_level", clampNumber(Number(values[2]), 1, 12, 7));
world.setDynamicProperty("mace_density_per_block_per_level", clampNumber(Number(values[3]), 0, 2, 0.5));
}, "Could not save Wind Burst settings."));
}
function showHudConfigMenu(player) {
reloadConfig();
const form = new ActionFormData()
.title("§l§eHUD Settings")
.body("Choose a HUD subcategory:")
.button("HUD")
.button("Particles")
.button("Sounds");
form.show(player).then(response => {
if (response.canceled) {
showMainConfigMenu(player);
return;
};
if (response.selection === 0) showItemAdminForm(player);
if (response.selection === 1) showParticlesConfig(player);
if (response.selection === 2) showSoundsConfig(player);
});
}
function showParticlesConfig(player) {
const form = new ModalFormData().title("§l§bHUD Particles");
form.header(`§l§bHUD Particles`);
form.divider();
form.label("Toggle sweep/crit particles.");
const sweep = Boolean(world.getDynamicProperty("hud_sweep_particle") ?? true);
const crit = Boolean(world.getDynamicProperty("hud_crit_particle") ?? true);
form.toggle("Enable Sweep Particle", { defaultValue: sweep });
form.toggle("Enable Crit Particle", { defaultValue: crit });
form.show(player).then(response => {
if (response.canceled) {
showHudConfigMenu(player);
return;
}
const values = getFormValues(response);
if (values.length < 2) {
player.sendMessage("§cParticle settings incomplete.");
showHudConfigMenu(player);
return;
}
world.setDynamicProperty("hud_sweep_particle", Boolean(values[0]));
world.setDynamicProperty("hud_crit_particle", Boolean(values[1]));
reloadConfig();
showHudConfigMenu(player);
});
}
function showSoundsConfig(player) {
const form = new ModalFormData().title("§l§dHUD Sounds");
form.header(`§l§dHUD Sounds`);
form.divider();
form.label("Toggle attack/crit sounds.");
const attack = Boolean(world.getDynamicProperty("hud_attack_sound") ?? true);
const crit = Boolean(world.getDynamicProperty("hud_crit_sound") ?? true);
form.toggle("Enable Attack Sound", { defaultValue: attack });
form.toggle("Enable Crit Sound", { defaultValue: crit });
form.show(player).then(response => {
if (response.canceled) {
showHudConfigMenu(player);
return;
}
const values = getFormValues(response);
if (values.length < 2) {
player.sendMessage("§cSound settings incomplete.");
showHudConfigMenu(player);
return;
}
world.setDynamicProperty("hud_attack_sound", Boolean(values[0]));
world.setDynamicProperty("hud_crit_sound", Boolean(values[1]));
reloadConfig();
showHudConfigMenu(player);
});
}
function showExtraConfigMenu(player) {
reloadConfig();
const form = new ActionFormData()
.title("§l§bExtra Features")
.body("Choose an extra feature:")
.button("Bow Ding")
.button("Auto Crystal")
.button("CPvP Mechanics")
.button("Advanced Sword")
.button("Netherite Wind Changes")
.button("Portal Waterlog")
.button("TNT Minecarts")
.button("Cobweb Mechanics")
.button("XP Mechanics")
.button("Offhand")
.button("Offhand Timing")
.button("Underwater Doors")
.button("Spear Aptitude Swap")
.button("Invisible Death Messages")
.button("Fishing Item Retrieval")
.button("True Armor Durability")
.button("Java Mobs");
form.show(player).then(response => {
if (response.canceled) {
showMainConfigMenu(player);
return;
}
if (response.selection === 0) showBowDingConfig(player);
if (response.selection === 1) showAutoCrystalConfig(player);
if (response.selection === 2) showCpvpConfig(player);
if (response.selection === 3) showSwordAdvancedConfig(player);
if (response.selection === 4) showNetheriteWindConfig(player);
if (response.selection === 5) showPortalWaterlogConfig(player);
if (response.selection === 6) showTntMinecartConfig(player);
if (response.selection === 7) showCobwebConfig(player);
if (response.selection === 8) showXpConfig(player);
if (response.selection === 9) showOffhandConfig(player);
if (response.selection === 10) showOffhandTimingConfig(player);
if (response.selection === 11) showUnderwaterDoorsConfig(player);
if (response.selection === 12) showSpearAptitudeConfig(player);
if (response.selection === 13) showInvisibleDeathConfig(player, true);
if (response.selection === 14) showFishingItemsConfig(player);
if (response.selection === 15) showTrueArmorDurabilityConfig(player);
if (response.selection === 16) showJavaMobsConfig(player);
});
}
function showJavaMobsConfig(player) {
const form = new ModalFormData().title("§l§2Java Mobs");
form.label("Reach, swing timing, and movement pace per mob. Shorter melee than Bedrock, zombies feel heavy, babies/spiders/brutes feel quicker.");
form.label("Bosses: ender dragon charges launch you. The wither uses Java HP, a spawn charge, black/blue skulls, then a half-health ram phase.");
form.label("Special: iron golem fling, creeper fuse fizzle, skeleton kite, daylight spiders, gold-pacified piglins, enderman teleports, ghast punch, blaze snowballs, and the other big Java differences.");
form.toggle("Enable Java mob behavior", { defaultValue: Boolean(world.getDynamicProperty("java_mobs_enabled") ?? true) });
form.toggle("Java melee reach", { defaultValue: Boolean(world.getDynamicProperty("java_mob_reach") ?? true) });
addNumericField(form, "Reach scale", 0.8, 1.8, configSliderDefault("java_mob_reach_scale", 1.25, 0.8, 1.8));
form.toggle("Attack cooldown", { defaultValue: Boolean(world.getDynamicProperty("java_mob_cooldown") ?? true) });
form.toggle("Line of sight (no wall hits)", { defaultValue: Boolean(world.getDynamicProperty("java_mob_los") ?? true) });
form.toggle("Movement pace", { defaultValue: Boolean(world.getDynamicProperty("java_mob_movement") ?? true) });
form.toggle("Pause on swing", { defaultValue: Boolean(world.getDynamicProperty("java_mob_attack_pause") ?? true) });
form.toggle("Ender dragon launch", { defaultValue: Boolean(world.getDynamicProperty("java_dragon_launch") ?? true) });
form.toggle("Java wither phases (HP, skulls, dash)", { defaultValue: Boolean(world.getDynamicProperty("java_wither_farm") ?? true) });
form.toggle("Special Java mob behaviors", { defaultValue: Boolean(world.getDynamicProperty("java_mob_special") ?? true) });
form.show(player).then(response => saveConfigForm(player, response, 10, showExtraConfigMenu, values => {
world.setDynamicProperty("java_mobs_enabled", Boolean(values[0]));
world.setDynamicProperty("java_mob_reach", Boolean(values[1]));
world.setDynamicProperty("java_mob_reach_scale", clampNumber(Number(values[2]), 0.8, 1.8, 1.25));
world.setDynamicProperty("java_mob_cooldown", Boolean(values[3]));
world.setDynamicProperty("java_mob_los", Boolean(values[4]));
world.setDynamicProperty("java_mob_movement", Boolean(values[5]));
world.setDynamicProperty("java_mob_attack_pause", Boolean(values[6]));
world.setDynamicProperty("java_dragon_launch", Boolean(values[7]));
world.setDynamicProperty("java_wither_farm", Boolean(values[8]));
world.setDynamicProperty("java_mob_special", Boolean(values[9]));
}, "Could not save Java mob settings."));
}
function showSpearAptitudeConfig(player) {
const form = new ModalFormData().title("§l§6Spear Aptitude Swap");
form.toggle("Enable Spear Aptitude Swap", { defaultValue: Boolean(world.getDynamicProperty("spear_aptitude_enabled") ?? true) });
addNumericField(form, "Swap window (ticks)", 1, 10, configSliderDefault("spear_aptitude_swap_window", 2, 1, 10));
form.toggle("Restore Hunger/Saturation on Lunge", { defaultValue: Boolean(world.getDynamicProperty("spear_aptitude_hunger_reset") ?? true) });
form.show(player).then(response => saveConfigForm(player, response, 3, showExtraConfigMenu, values => {
world.setDynamicProperty("spear_aptitude_enabled", Boolean(values[0]));
world.setDynamicProperty("spear_aptitude_swap_window", Math.round(clampNumber(Number(values[1]), 1, 10, 2)));
world.setDynamicProperty("spear_aptitude_hunger_reset", Boolean(values[2]));
}, "Could not save spear settings."));
}
function showUnderwaterDoorsConfig(player) {
const form = new ModalFormData().title("§l§3Underwater Doors");
const enabled = Boolean(world.getDynamicProperty("underwater_doors_enabled") ?? true);
form.toggle("Enable Underwater Door Unwaterlogging", { defaultValue: enabled });
form.show(player).then(response => saveConfigForm(player, response, 1, showExtraConfigMenu,
values => world.setDynamicProperty("underwater_doors_enabled", Boolean(values[0])),
"Could not save underwater-door settings."));
}
function showBowDingConfig(player) {
const form = new ModalFormData().title("§l§eBow Ding");
const enabled = Boolean(world.getDynamicProperty("bow_ding_enabled") ?? true);
form.toggle("Enable Bow Ding", { defaultValue: enabled });
form.show(player).then(response => saveConfigForm(player, response, 1, showExtraConfigMenu,
values => world.setDynamicProperty("bow_ding_enabled", Boolean(values[0])),
"Could not save bow-ding settings."));
}
function showAutoCrystalConfig(player) {
const form = new ModalFormData().title("§l§aAuto Crystal");
const enabled = Boolean(world.getDynamicProperty("auto_crystal_enabled") ?? true);
form.toggle("Enable Auto Crystal", { defaultValue: enabled });
addNumericField(form, "Explosion delay (ticks)", 0, 20, configSliderDefault("auto_crystal_delay_ticks", 0, 0, 20));
form.show(player).then(response => saveConfigForm(player, response, 2, showExtraConfigMenu, values => {
world.setDynamicProperty("auto_crystal_enabled", Boolean(values[0]));
world.setDynamicProperty("auto_crystal_delay_ticks", clampNumber(Number(values[1]), 0, 20, 0));
}, "Could not save auto-crystal settings."));
}
function showCpvpConfig(player) {
const form = new ModalFormData().title("§l§5CPvP Mechanics");
form.label("From DRAC0Q CPvP guide — best-effort Bedrock port. Skill still required.");
form.toggle("Enable CPvP mechanics", { defaultValue: Boolean(world.getDynamicProperty("cpvp_enabled") ?? true) });
form.toggle("Java lastHurt residual (D-Tap / single-tick)", { defaultValue: Boolean(world.getDynamicProperty("cpvp_last_hurt") ?? true) });
form.toggle("Pearl flash (damage-tick on pearl land)", { defaultValue: Boolean(world.getDynamicProperty("cpvp_pearl_flash") ?? true) });
form.toggle("Hit-crystal (punch explodes)", { defaultValue: Boolean(world.getDynamicProperty("cpvp_hit_crystal") ?? true) });
form.toggle("Anchor explode (overworld CPvP cheese)", { defaultValue: Boolean(world.getDynamicProperty("cpvp_anchors") ?? true) });
form.toggle("Anchor airplace", { defaultValue: Boolean(world.getDynamicProperty("cpvp_airplace") ?? true) });
addNumericField(form, "Invuln window (ticks)", 4, 20, configSliderDefault("cpvp_invuln_ticks", 10, 4, 20));
form.show(player).then(response => saveConfigForm(player, response, 7, showExtraConfigMenu, values => {
world.setDynamicProperty("cpvp_enabled", Boolean(values[0]));
world.setDynamicProperty("cpvp_last_hurt", Boolean(values[1]));
world.setDynamicProperty("cpvp_pearl_flash", Boolean(values[2]));
world.setDynamicProperty("cpvp_hit_crystal", Boolean(values[3]));
world.setDynamicProperty("cpvp_anchors", Boolean(values[4]));
world.setDynamicProperty("cpvp_airplace", Boolean(values[5]));
world.setDynamicProperty("cpvp_invuln_ticks", Math.round(clampNumber(Number(values[6]), 4, 20, 10)));
}, "Could not save CPvP settings."));
}
function showSwordAdvancedConfig(player) {
const form = new ModalFormData().title("§l§5Advanced Sword");
form.label("From Advanced Sword Guide (1.21+) — engine assists; skill still required.");
form.toggle("Enable advanced sword assists", { defaultValue: Boolean(world.getDynamicProperty("sword_advanced_enabled") ?? true) });
form.toggle("No-KB crits (low vertical launch)", { defaultValue: Boolean(world.getDynamicProperty("sword_nokb_crit") ?? true) });
form.toggle("Sprint-hit KB boost", { defaultValue: Boolean(world.getDynamicProperty("sword_sprint_hit_boost") ?? true) });
form.toggle("Combo velocity dampen", { defaultValue: Boolean(world.getDynamicProperty("sword_combo_dampen") ?? true) });
form.toggle("Jump-reset assist", { defaultValue: Boolean(world.getDynamicProperty("sword_jump_reset_assist") ?? true) });
form.toggle("Jump-reset micro boost (optional)", { defaultValue: Boolean(world.getDynamicProperty("sword_jump_reset_boost") ?? false) });
addNumericField(form, "Combo dampen mult", 0.2, 1.0, configSliderDefault("sword_combo_dampen_mult", 0.6, 0.2, 1.0));
form.show(player).then(response => saveConfigForm(player, response, 7, showExtraConfigMenu, values => {
world.setDynamicProperty("sword_advanced_enabled", Boolean(values[0]));
world.setDynamicProperty("sword_nokb_crit", Boolean(values[1]));
world.setDynamicProperty("sword_sprint_hit_boost", Boolean(values[2]));
world.setDynamicProperty("sword_combo_dampen", Boolean(values[3]));
world.setDynamicProperty("sword_jump_reset_assist", Boolean(values[4]));
world.setDynamicProperty("sword_jump_reset_boost", Boolean(values[5]));
world.setDynamicProperty("sword_combo_dampen_mult", clampNumber(Number(values[6]), 0.2, 1.0, 0.6));
}, "Could not save sword settings."));
}
function showNetheriteWindConfig(player) {
const form = new ModalFormData().title("Netherite Wind Changes");
form.label("Tune Netherite launch resistance and wind-charge knockback.");
form.toggle("Enable Wind Changes", { defaultValue: Boolean(world.getDynamicProperty("wind_changes_enabled") ?? true) });
form.toggle("Use Bedrock Netherite Resistance", { defaultValue: Boolean(world.getDynamicProperty("bedrock_wind_charge_enabled") ?? true) });
addNumericField(form, "Wind boost multiplier", 0, 5, configSliderDefault("wind_boost_multiplier", 1, 0, 5));
addNumericField(form, "Wind Burst multiplier", 0, 5, configSliderDefault("wind_burst_multiplier", 1, 0, 5));
form.show(player).then(response => saveConfigForm(player, response, 4, showExtraConfigMenu, values => {
world.setDynamicProperty("wind_changes_enabled", Boolean(values[0]));
world.setDynamicProperty("bedrock_wind_charge_enabled", Boolean(values[1]));
world.setDynamicProperty("wind_boost_multiplier", clampNumber(Number(values[2]), 0, 5, 1));
world.setDynamicProperty("wind_burst_multiplier", clampNumber(Number(values[3]), 0, 5, 1));
}, "Could not save wind settings."));
}
function showPortalWaterlogConfig(player) {
const form = new ModalFormData().title("§l§9Portal Waterlog");
const enabled = Boolean(world.getDynamicProperty("portal_waterlog_enabled") ?? true);
form.toggle("Enable Portal Waterlog", { defaultValue: enabled });
form.show(player).then(response => saveConfigForm(player, response, 1, showExtraConfigMenu,
values => world.setDynamicProperty("portal_waterlog_enabled", Boolean(values[0])),
"Could not save portal-waterlog settings."));
}
function showTntMinecartConfig(player) {
const form = new ModalFormData().title("§l§cTNT Minecarts");
const enabled = Boolean(world.getDynamicProperty("tnt_minecarts_enabled") ?? true);
const stackable = Boolean(world.getDynamicProperty("tnt_minecarts_stackable") ?? true);
const projectileHits = Boolean(world.getDynamicProperty("tnt_minecarts_projectiles") ?? true);
const chainLaunch = Boolean(world.getDynamicProperty("tnt_minecarts_chain_launch") ?? true);
const offhandPlacement = Boolean(world.getDynamicProperty("tnt_minecarts_offhand") ?? true);
form.label("Configure the Xbow minecart projectile, chain-launch, stacking, and offhand features.");
form.toggle("Enable TNT Minecart Features", { defaultValue: enabled });
form.toggle("Enable Stackable TNT Minecarts", { defaultValue: stackable });
form.toggle("Projectile Interaction", { defaultValue: projectileHits });
form.toggle("Chain Launch Nearby Carts", { defaultValue: chainLaunch });
form.toggle("Place from Offhand on Rails", { defaultValue: offhandPlacement });
form.show(player).then(response => saveConfigForm(player, response, 5, showExtraConfigMenu, values => {
world.setDynamicProperty("tnt_minecarts_enabled", Boolean(values[0]));
world.setDynamicProperty("tnt_minecarts_stackable", Boolean(values[1]));
world.setDynamicProperty("tnt_minecarts_projectiles", Boolean(values[2]));
world.setDynamicProperty("tnt_minecarts_chain_launch", Boolean(values[3]));
world.setDynamicProperty("tnt_minecarts_offhand", Boolean(values[4]));
}, "Could not save TNT minecart settings."));
}
function showCobwebConfig(player) {
const form = new ModalFormData().title("§l§fCobweb Mechanics");
const preset = clampNumber(Math.trunc(Number(world.getDynamicProperty("cobweb_preset") ?? 1)), 0, 1);
const enabled = Boolean(world.getDynamicProperty("cobweb_enabled") ?? true);
form.dropdown("Cobweb Preset", ["Legacy", "Java Style"], { defaultValueIndex: preset });
form.toggle("Enable Cobweb Mechanics", { defaultValue: enabled });
form.show(player).then(response => saveConfigForm(player, response, 2, showExtraConfigMenu, values => {
world.setDynamicProperty("cobweb_preset", clampNumber(Number(values[0]), 0, 1, 1));
world.setDynamicProperty("cobweb_enabled", Boolean(values[1]));
}, "Could not save cobweb settings."));
}
function showXpConfig(player) {
const form = new ModalFormData().title("§l§2XP Mechanics");
const fast = Boolean(world.getDynamicProperty("xp_fast") ?? true);
const auto = Boolean(world.getDynamicProperty("xp_auto_pull") ?? true);
const speed = Number(world.getDynamicProperty("xp_speed") ?? 3);
form.toggle("Enable Fast XP", { defaultValue: fast });
form.toggle("Enable Auto XP Pulling", { defaultValue: auto });
addNumericField(form, "XP bottles per use", 1, 12, speed);
form.show(player).then(response => saveConfigForm(player, response, 3, showExtraConfigMenu, values => {
world.setDynamicProperty("xp_fast", Boolean(values[0]));
world.setDynamicProperty("xp_auto_pull", Boolean(values[1]));
world.setDynamicProperty("xp_speed", Math.round(clampNumber(Number(values[2]), 1, 12, 3)));
}, "Could not save XP settings."));
}
function showOffhandConfig(player) {
const form = new ModalFormData().title("§l§5Offhand");
form.label("Hold Minecraft Interact/Use for shields and trident charge. One-shot items like wind charges and XP bottles need a fresh press after release.");
const enabled = Boolean(world.getDynamicProperty("offhand_enabled") ?? true);
const foods = Boolean(world.getDynamicProperty("offhand_foods_enabled") ?? true);
const swapEnabled = Boolean(world.getDynamicProperty("offhand_swap_enabled") ?? true);
form.toggle("Enable Interact/Use Offhand Actions", { defaultValue: enabled });
form.toggle("Enable Offhand Foods", { defaultValue: foods });
form.toggle("Enable Offhand Swap System", { defaultValue: swapEnabled });
form.toggle("Enable Offhand Projectiles and Throwables", { defaultValue: Boolean(world.getDynamicProperty("offhand_projectiles_enabled") ?? true) });
form.toggle("Enable Offhand Tridents", { defaultValue: Boolean(world.getDynamicProperty("offhand_tridents_enabled") ?? true) });
form.toggle("Enable Offhand Block Placement", { defaultValue: Boolean(world.getDynamicProperty("offhand_blocks_enabled") ?? true) });
form.toggle("Use Java-Style Block Targeting", { defaultValue: Boolean(world.getDynamicProperty("offhand_block_java_targeting") ?? true) });
form.toggle("Java-Style Block Placement (main + offhand: face aim, sneak on chests)", { defaultValue: Boolean(world.getDynamicProperty("java_block_placement") ?? true) });
form.toggle("Place into Replaceable Blocks", { defaultValue: Boolean(world.getDynamicProperty("offhand_block_direct_replace") ?? true) });
form.toggle("Replace Plants and Snow Layers", { defaultValue: Boolean(world.getDynamicProperty("offhand_block_replace_plants") ?? true) });
form.toggle("Use Block Orientation", { defaultValue: Boolean(world.getDynamicProperty("offhand_block_orientation_enabled") ?? true) });
form.toggle("Prevent Placing Inside Yourself", { defaultValue: Boolean(world.getDynamicProperty("offhand_block_prevent_self_placement") ?? true) });
form.toggle("Any item can be swapped to offhand", { defaultValue: Boolean(world.getDynamicProperty("offhand_any_item") ?? true) });
addNumericField(form, "Offhand block reach (blocks)", 1, 12, configSliderDefault("offhand_block_reach", 6, 1, 12));
addNumericField(form, "Placement cooldown (ticks)", 0, 20, configSliderDefault("offhand_block_cooldown_ticks", 1, 0, 20));
addNumericField(form, "Trident charge time (ticks)", 1, 40, configSliderDefault("offhand_trident_charge_ticks", 10, 1, 40));
form.show(player).then(response => saveConfigForm(player, response, 16, showExtraConfigMenu, values => {
world.setDynamicProperty("offhand_enabled", Boolean(values[0]));
world.setDynamicProperty("offhand_foods_enabled", Boolean(values[1]));
world.setDynamicProperty("offhand_swap_enabled", Boolean(values[2]));
world.setDynamicProperty("offhand_projectiles_enabled", Boolean(values[3]));
world.setDynamicProperty("offhand_tridents_enabled", Boolean(values[4]));
world.setDynamicProperty("offhand_blocks_enabled", Boolean(values[5]));
world.setDynamicProperty("offhand_block_java_targeting", Boolean(values[6]));
world.setDynamicProperty("java_block_placement", Boolean(values[7]));
world.setDynamicProperty("offhand_block_direct_replace", Boolean(values[8]));
world.setDynamicProperty("offhand_block_replace_plants", Boolean(values[9]));
world.setDynamicProperty("offhand_block_orientation_enabled", Boolean(values[10]));
world.setDynamicProperty("offhand_block_prevent_self_placement", Boolean(values[11]));
world.setDynamicProperty("offhand_any_item", Boolean(values[12]));
world.setDynamicProperty("offhand_block_reach", clampNumber(Number(values[13]), 1, 12, 6));
world.setDynamicProperty("offhand_block_cooldown_ticks", Math.round(clampNumber(Number(values[14]), 0, 20, 1)));
world.setDynamicProperty("offhand_trident_charge_ticks", Math.round(clampNumber(Number(values[15]), 1, 40, 10)));
}, "Could not save offhand settings."));
}
function showOffhandTimingConfig(player) {
const form = new ModalFormData().title("§l§5Offhand Timing");
form.label("Configure double-crouch swapping and Interact/Use offhand food timing.");
const rows = [
["offhand_swap_window_ticks", "Crouch detection window (ticks)", 15, 5, 100],
["offhand_swap_double_tap_presses", "Crouches required in double-tap mode", 2, 2, 6],
["offhand_swap_multi_presses", "Crouches required in multi-tap mode", 5, 3, 10],
["offhand_swap_cooldown_ticks", "Swap cooldown (ticks)", 20, 0, 100],
["offhand_eat_start_delay_ticks", "Food action start delay (ticks)", 5, 0, 40],
["offhand_eat_repeat_delay_ticks", "Food repeat delay (ticks)", 5, 0, 40],
];
for (const [id, label, fallback, min, max] of rows) addNumericField(form, label, min, max, configSliderDefault(id, fallback, min, max));
form.show(player).then(response => saveConfigForm(player, response, rows.length, showExtraConfigMenu, values => {
rows.forEach(([id, , fallback, min, max], index) => world.setDynamicProperty(id, Math.round(clampNumber(Number(values[index]), min, max, fallback))));
}, "Could not save offhand timing settings."));
}
function showInvisibleDeathConfig(player, returnToExtra = false) {
const form = new ModalFormData().title("§l§8Invisible Death Messages");
form.label("Configure custom Java-style messages and privacy for invisible killers and victims.");
const rows = [
["idm_enabled", "Enable custom death messages", true],
["idm_java_wording", "Use Java Edition wording", true],
["idm_hide_invisible_names", "Hide invisible entity names", true],
["idm_hide_invisible_killer", "Hide invisible killer names", true],
["idm_hide_invisible_victim", "Hide invisible victim names", true],
["idm_hide_invisible_weapon", "Hide custom weapon names for invisible killers", true],
["idm_hide_invisible_mobs", "Apply hiding to invisible mobs", true],
["idm_escape_messages", "Use Java-style escape messages", true],
["idm_named_weapon_messages", "Show renamed weapons in death messages", true],
];
for (const [id, label, fallback] of rows) form.toggle(label, { defaultValue: Boolean(world.getDynamicProperty(id) ?? fallback) });
form.dropdown("Hidden name style", ["Obfuscated", "Custom label"], { defaultValueIndex: Number(world.getDynamicProperty("idm_hidden_name_style") ?? 0) === 1 ? 1 : 0 });
form.textField("Custom hidden-name label", "Someone", { defaultValue: String(world.getDynamicProperty("idm_hidden_name_label") ?? "Someone") });
form.show(player).then(response => {
const menu = returnToExtra ? showExtraConfigMenu : showAdditionalContentMenu;
if (response.canceled) { menu(player); return; }
const values = getFormValues(response);
if (values.length !== 11) { menu(player); return; }
rows.forEach(([id], index) => world.setDynamicProperty(id, Boolean(values[index])));
world.setDynamicProperty("idm_hidden_name_style", Number(values[9]) === 1 ? 1 : 0);
world.setDynamicProperty("idm_hidden_name_label", String(values[10] ?? "Someone").trim().slice(0, 24) || "Someone");
reloadConfig();
syncInvisibleDeathRule();
menu(player);
}).catch(() => player.sendMessage("Death-message settings could not open. Close other menus and try again."));
}
function showFishingItemsConfig(player) {
const form = new ModalFormData().title("§l§bFishing Item Retrieval");
form.label("Reeling a fishing hook pulls nearby dropped items toward you.");
form.toggle("Enable fishing item retrieval", { defaultValue: Boolean(world.getDynamicProperty("fishing_items_enabled") ?? false) });
addNumericField(form, "Catch radius (blocks)", 1, 8, configSliderDefault("fishing_items_radius", 3, 1, 8));
addNumericField(form, "Pull distance per reel (blocks)", 1, 12, configSliderDefault("fishing_items_pull_step", 4, 1, 12));
addNumericField(form, "Vertical pull boost (blocks)", 0, 4, configSliderDefault("fishing_items_vertical_boost", 1, 0, 4));
form.show(player).then(response => saveConfigForm(player, response, 4, showExtraConfigMenu, values => {
world.setDynamicProperty("fishing_items_enabled", Boolean(values[0]));
world.setDynamicProperty("fishing_items_radius", Math.round(clampNumber(Number(values[1]), 1, 8, 3)));
world.setDynamicProperty("fishing_items_pull_step", clampNumber(Number(values[2]), 1, 12, 4));
world.setDynamicProperty("fishing_items_vertical_boost", clampNumber(Number(values[3]), 0, 4, 1));
}, "Could not save fishing settings."));
}
function showTrueArmorDurabilityConfig(player) {
const form = new ModalFormData().title("§l§7True Armor Durability");
form.label("Optional extra armor wear after damage. Vanilla armor durability still applies.");
form.toggle("Enable True Armor Durability", { defaultValue: Boolean(world.getDynamicProperty("true_armor_durability_enabled") ?? false) });
addNumericField(form, "Damage divisor (damage ÷ value = wear)", 1, 40, configSliderDefault("true_armor_damage_divisor", 4, 1, 40));
addNumericField(form, "Extra Thorns armor wear", 0, 20, configSliderDefault("true_armor_thorns_extra_damage", 2, 0, 20));
form.toggle("Apply to players", { defaultValue: Boolean(world.getDynamicProperty("true_armor_players") ?? true) });
form.toggle("Apply to mobs", { defaultValue: Boolean(world.getDynamicProperty("true_armor_mobs") ?? true) });
form.toggle("Ignore elytra", { defaultValue: Boolean(world.getDynamicProperty("true_armor_ignore_elytra") ?? true) });
form.toggle("Play armor break sound", { defaultValue: Boolean(world.getDynamicProperty("true_armor_break_sound") ?? true) });
form.show(player).then(response => saveConfigForm(player, response, 7, showExtraConfigMenu, values => {
world.setDynamicProperty("true_armor_durability_enabled", Boolean(values[0]));
world.setDynamicProperty("true_armor_damage_divisor", Math.round(clampNumber(Number(values[1]), 1, 40, 4)));
world.setDynamicProperty("true_armor_thorns_extra_damage", Math.round(clampNumber(Number(values[2]), 0, 20, 2)));
world.setDynamicProperty("true_armor_players", Boolean(values[3]));
world.setDynamicProperty("true_armor_mobs", Boolean(values[4]));
world.setDynamicProperty("true_armor_ignore_elytra", Boolean(values[5]));
world.setDynamicProperty("true_armor_break_sound", Boolean(values[6]));
}, "Could not save armor durability settings."));
}
function showAdditionalContentMenu(player) {
const form = new ActionFormData().title("§l§dAdditional Content")
.body("Configure optional add-on content.")
.button("Invisible Death Messages")
.button("Fishing Item Retrieval")
.button("True Armor Durability")
.button("Back");
form.show(player).then(response => {
if (response.canceled || response.selection === 3) { showMainConfigMenu(player); return; }
if (response.selection === 0) showInvisibleDeathConfig(player, false);
if (response.selection === 1) showFishingItemsConfig(player);
if (response.selection === 2) showTrueArmorDurabilityConfig(player);
});
}
function showPackCompatibilityConfig(player) {
const form = new ModalFormData().title("§l§dPack Compatibility");
form.label("Server Collection UI icons require that pack to be active in the world.");
form.toggle("Use Server Collection icons in jk:config", { defaultValue: Boolean(world.getDynamicProperty("server_collection_icons_enabled") ?? false) });
form.show(player).then(response => saveConfigForm(player, response, 1, showMainConfigMenu,
values => world.setDynamicProperty("server_collection_icons_enabled", Boolean(values[0])),
"Could not save pack compatibility settings."));
}
function clampNumber(value, min, max, fallback = min) {
const number = Number(value);
return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
let dynamicProperties = [
{ id: "sat", name: "Java Saturation", value: true, category: "combat" },
{ id: "shield", name: "Custom Shield", value: true, category: "combat" },
{ id: "knockback_profile", name: "Knockback Profile", value: 0, category: "combat" },
{ id: "kb_horizontal", name: "KB Horizontal", value: 1.0, category: "combat" },
{ id: "kb_vertical", name: "KB Vertical", value: 1.0, category: "combat" },
{ id: "damage_multiplier", name: "Damage Multiplier", value: 1.0, category: "combat" },
{ id: "balanced_pvp_enabled", name: "Balanced PvP", value: false, category: "combat" },
{ id: "cooldown_damage_scaling", name: "Cooldown Damage Scaling", value: true, category: "combat" },
{ id: "java_combat_engine", name: "Java Combat Engine (wiki formulas)", value: true, category: "combat" },
{ id: "java_enchants_enabled", name: "Java Enchant Formulas", value: true, category: "combat" },
{ id: "custom_shield_cooldown", name: "Shield Break Cooldown", value: 5, category: "combat" },
{ id: "custom_shield_stunning", name: "Shield Stunning", value: true, category: "combat" },
{ id: "hud_display_mode", name: "HUD Display Mode", value: 0, category: "display" },
{ id: "sat_hud_server", name: "Saturation HUD", value: true, category: "hud" },
{ id: "armor_hud_server", name: "Armor HUD", value: true, category: "hud" },
{ id: "shield_hud_server", name: "Shield HUD", value: true, category: "hud" },
{ id: "cooldown_hud", name: "Cooldown Bar", value: true, category: "hud" },
{ id: "hud_sweep_particle", name: "HUD Sweep Particle", value: true, category: "hud" },
{ id: "hud_crit_particle", name: "HUD Crit Particle", value: true, category: "hud" },
{ id: "hud_attack_sound", name: "HUD Attack Sound", value: true, category: "hud" },
{ id: "hud_crit_sound", name: "HUD Crit Sound", value: true, category: "hud" },
{ id: "breach_swap_enabled", name: "Breach Swap Enabled", value: true, category: "combat" },
{ id: "breach_swap_ticks", name: "Breach Swap Ticks", value: 1, category: "combat" },
{ id: "stun_slam_mode", name: "Stun Slam Mode (attribute|java_accurate)", value: "attribute", category: "combat" },
{ id: "attribute_swap_grace_ticks", name: "Attribute Swap Grace Ticks", value: 6, category: "combat" },
{ id: "xp_speed", name: "XP Bottles per Use", value: 3, category: "extra" },
{ id: "bow_ding_enabled", name: "Bow Ding Enabled", value: true, category: "extra" },
{ id: "auto_crystal_enabled", name: "Auto Crystal Enabled", value: true, category: "extra" },
{ id: "cpvp_enabled", name: "CPvP Mechanics Enabled", value: true, category: "extra" },
{ id: "sword_advanced_enabled", name: "Advanced Sword PvP Enabled", value: true, category: "extra" },
{ id: "sword_nokb_crit", name: "Sword No-KB Crits", value: true, category: "extra" },
{ id: "sword_nokb_crit_vertical_mult", name: "No-KB Crit Vertical Mult", value: 0.25, category: "extra" },
{ id: "sword_nokb_crit_horizontal_mult", name: "No-KB Crit Horizontal Mult", value: 0.85, category: "extra" },
{ id: "sword_sprint_hit_boost", name: "Sword Sprint-Hit KB Boost", value: true, category: "extra" },
{ id: "sword_sprint_hit_horizontal_mult", name: "Sprint-Hit Horizontal Mult", value: 1.15, category: "extra" },
{ id: "sword_combo_dampen", name: "Sword Combo Velocity Dampen", value: true, category: "extra" },
{ id: "sword_combo_dampen_mult", name: "Combo Dampen Mult", value: 0.6, category: "extra" },
{ id: "sword_jump_reset_assist", name: "Sword Jump-Reset Assist", value: true, category: "extra" },
{ id: "sword_jump_reset_boost", name: "Jump-Reset Micro Boost", value: false, category: "extra" },
{ id: "cpvp_last_hurt", name: "CPvP Java lastHurt / D-Tap residual", value: true, category: "extra" },
{ id: "cpvp_pearl_flash", name: "CPvP Pearl Flash", value: true, category: "extra" },
{ id: "cpvp_hit_crystal", name: "CPvP Hit-Crystal Explode", value: true, category: "extra" },
{ id: "cpvp_anchors", name: "CPvP Anchor Explode (Overworld)", value: true, category: "extra" },
{ id: "cpvp_airplace", name: "CPvP Anchor Airplace", value: true, category: "extra" },
{ id: "cpvp_invuln_ticks", name: "CPvP Invuln Window Ticks", value: 10, category: "extra" },
{ id: "wind_boost_multiplier", name: "Wind Boost Multiplier", value: 1.0, category: "extra" },
{ id: "portal_waterlog_enabled", name: "Portal Waterlog Enabled", value: true, category: "extra" },
{ id: "tnt_minecarts_enabled", name: "TNT Minecarts Enabled", value: true, category: "extra" },
{ id: "tnt_minecarts_stackable", name: "TNT Minecarts Stackable", value: true, category: "extra" },
{ id: "tnt_minecarts_projectiles", name: "TNT Minecart Projectile Interaction", value: true, category: "extra" },
{ id: "tnt_minecarts_chain_launch", name: "TNT Minecart Chain Launch", value: true, category: "extra" },
{ id: "tnt_minecarts_offhand", name: "TNT Minecart Offhand Placement", value: true, category: "extra" },
{ id: "cobweb_preset", name: "Cobweb Preset", value: 1, category: "extra" },
{ id: "cobweb_enabled", name: "Cobweb Enabled", value: true, category: "extra" },
{ id: "xp_fast", name: "XP Fast", value: true, category: "extra" },
{ id: "xp_auto_pull", name: "XP Auto Pull", value: true, category: "extra" },
{ id: "offhand_enabled", name: "Offhand Enabled", value: true, category: "extra" },
{ id: "offhand_foods_enabled", name: "Offhand Foods Enabled", value: true, category: "extra" },
{ id: "offhand_swap_enabled", name: "Offhand Swap Enabled", value: true, category: "extra" },
{ id: "offhand_any_item", name: "Any Item Offhand Swap", value: true, category: "extra" },
{ id: "underwater_doors_enabled", name: "Underwater Doors Enabled", value: true, category: "extra" },
{ id: "server_collection_icons_enabled", name: "Server Collection Config Icons", value: false, category: "compatibility" },
{ id: "java_saturation_enabled", name: "Java Saturation Enabled", value: true, category: "combat" },
{ id: "java_saturation_speed", name: "Java Saturation Speed", value: 1, category: "combat" },
{ id: "java_saturation_heal_amount", name: "Saturation Heal Amount", value: 2, category: "combat" },
{ id: "java_saturation_drain_amount", name: "Saturation Drain Amount", value: 2, category: "combat" },
{ id: "java_saturation_hunger_threshold", name: "Saturation Hunger Threshold", value: 18, category: "combat" },
{ id: "custom_shield_enabled", name: "Custom Shield Enabled", value: true, category: "combat" },
{ id: "custom_shield_stun_ticks", name: "Shield Stun Duration", value: 4, category: "combat" },
{ id: "custom_shield_axe_break_enabled", name: "Axe Shield Break Enabled", value: true, category: "combat" },
{ id: "custom_shield_axe_disable_chance", name: "Axe Shield Disable Chance", value: 100, category: "combat" },
{ id: "shield_facing_threshold_degrees", name: "Shield Facing Angle", value: 90, category: "combat" },
{ id: "custom_shield_hit_durability", name: "Shield Hit Durability Cost", value: 1, category: "combat" },
{ id: "custom_shield_mace_durability", name: "Shield Mace Durability Cost", value: 10, category: "combat" },
{ id: "custom_shield_raise_delay_enabled", name: "Shield Raise Delay Enabled", value: true, category: "combat" },
{ id: "custom_shield_raise_delay_ticks", name: "Shield Raise Delay Ticks", value: 5, category: "combat" },
{ id: "sprint_knockback_multiplier", name: "Sprint Knockback Multiplier", value: 1, category: "combat" },
{ id: "sprint_knockback_min_cooldown", name: "Sprint Knockback Minimum Cooldown", value: 85, category: "combat" },
{ id: "axe_knockback_multiplier", name: "Axe Knockback Multiplier", value: 1, category: "combat" },
{ id: "cooldown_default", name: "Default Attack Cooldown", value: 12, category: "combat" },
{ id: "cooldown_mace", name: "Mace Attack Cooldown", value: 33, category: "combat" },
{ id: "cooldown_sword", name: "Sword Attack Cooldown", value: 13, category: "combat" },
{ id: "cooldown_axe_light", name: "Light Axe Attack Cooldown", value: 25, category: "combat" },
{ id: "cooldown_axe_iron", name: "Iron Axe Attack Cooldown", value: 22, category: "combat" },
{ id: "cooldown_axe_heavy", name: "Heavy Axe Attack Cooldown", value: 20, category: "combat" },
{ id: "cooldown_trident", name: "Trident Attack Cooldown", value: 18, category: "combat" },
{ id: "cooldown_shovel", name: "Shovel Attack Cooldown", value: 20, category: "combat" },
{ id: "cooldown_pickaxe", name: "Pickaxe Attack Cooldown", value: 20, category: "combat" },
{ id: "cooldown_hoe", name: "Hoe Attack Cooldown", value: 7, category: "combat" },
{ id: "cooldown_spear", name: "Spear Attack Cooldown", value: 20, category: "combat" },
{ id: "critical_hits_enabled", name: "Critical Hits Enabled", value: true, category: "combat" },
{ id: "critical_damage_multiplier", name: "Critical Damage Multiplier", value: 1.5, category: "combat" },
{ id: "critical_hits_min_cooldown", name: "Critical Hit Minimum Cooldown", value: 85, category: "combat" },
{ id: "sharpness_damage_base", name: "Sharpness Base Damage", value: 0.5, category: "combat" },
{ id: "sharpness_damage_per_level", name: "Sharpness Damage Per Level", value: 0.5, category: "combat" },
{ id: "strength_damage_per_level", name: "Strength Damage Per Level", value: 3, category: "combat" },
{ id: "weakness_damage_per_level", name: "Weakness Damage Per Level", value: 4, category: "combat" },
{ id: "java_mob_enchantments_enabled", name: "Java Mob Enchantments", value: false, category: "combat" },
{ id: "mob_enchant_damage_per_level", name: "Mob Enchantment Damage Per Level", value: 2.5, category: "combat" },
{ id: "player_damage_multiplier", name: "Player Damage Multiplier", value: 1, category: "combat" },
{ id: "mob_damage_multiplier", name: "Mob Damage Multiplier", value: 1, category: "combat" },
{ id: "sword_sweep_enabled", name: "Sword Sweep Enabled", value: true, category: "combat" },
{ id: "sword_sweep_range", name: "Sword Sweep Range", value: 1.5, category: "combat" },
{ id: "sword_sweep_damage_multiplier", name: "Sword Sweep Damage", value: 0.5, category: "combat" },
{ id: "sword_sweep_min_cooldown", name: "Sword Sweep Minimum Cooldown", value: 85, category: "combat" },
{ id: "breach_axe_flat_damage", name: "Axe Breach Flat Damage", value: 1.75, category: "combat" },
{ id: "breach_axe_damage_per_level", name: "Axe Breach Damage Per Level", value: 0.3, category: "combat" },
{ id: "breach_sword_flat_damage", name: "Sword Breach Flat Damage", value: 1.25, category: "combat" },
{ id: "breach_sword_damage_per_level", name: "Sword Breach Damage Per Level", value: 0.3, category: "combat" },
{ id: "anti_spam_partial_threshold", name: "Anti-Spam Hit Threshold", value: 65, category: "combat" },
{ id: "anti_spam_weakness_ticks", name: "Anti-Spam Weakness Duration", value: 30, category: "combat" },
{ id: "mace_smash_fall_nerf_enabled", name: "Mace Fall Damage Scaling", value: true, category: "combat" },
{ id: "mace_one_block_damage", name: "Mace One Block Damage", value: 5, category: "combat" },
{ id: "mace_air_damage_multiplier", name: "Mace Added Fall Damage Multiplier", value: 0.65, category: "combat" },
{ id: "mace_density_multiplier_per_level", name: "Mace Density Bonus", value: 0.05, category: "combat" },
{ id: "wind_burst_multiplier", name: "Wind Burst Multiplier", value: 1, category: "combat" },
{ id: "wind_burst_enabled", name: "Wind Burst Launch Enabled", value: true, category: "combat" },
{ id: "wind_burst_blocks_per_level", name: "Wind Burst Blocks Per Level", value: 7, category: "combat" },
{ id: "mace_density_per_block_per_level", name: "Density Damage Per Block Per Level", value: 0.5, category: "combat" },
{ id: "combat_qol_enabled", name: "Combat QoL (charge HUD/tips)", value: true, category: "combat" },
{ id: "combat_charge_hud", name: "Combat Charge Action Bar", value: true, category: "combat" },
{ id: "combat_tips_enabled", name: "Combat Beginner Tips", value: true, category: "combat" },
{ id: "anti_spam_partial_threshold", name: "Legacy Min Charge To Hit % (0=Java allow all)", value: 0, category: "combat" },
{ id: "wind_changes_enabled", name: "Wind Changes Enabled", value: true, category: "extra" },
{ id: "bedrock_wind_charge_enabled", name: "Bedrock Wind Charge Mode", value: true, category: "extra" },
{ id: "auto_crystal_delay_ticks", name: "Auto Crystal Delay", value: 0, category: "extra" },
{ id: "offhand_projectiles_enabled", name: "Offhand Projectiles Enabled", value: true, category: "extra" },
{ id: "offhand_tridents_enabled", name: "Offhand Tridents Enabled", value: true, category: "extra" },
{ id: "offhand_blocks_enabled", name: "Offhand Blocks Enabled", value: true, category: "extra" },
{ id: "offhand_trident_charge_ticks", name: "Offhand Trident Charge Time", value: 10, category: "extra" },
{ id: "offhand_block_java_targeting", name: "Offhand Java Block Targeting", value: true, category: "extra" },
{ id: "java_block_placement", name: "Java-Style Block Placement (Main + Offhand)", value: true, category: "extra" },
{ id: "offhand_block_reach", name: "Offhand Block Reach", value: 6, category: "extra" },
{ id: "offhand_block_cooldown_ticks", name: "Offhand Block Cooldown", value: 1, category: "extra" },
{ id: "offhand_block_direct_replace", name: "Offhand Block Direct Replace", value: true, category: "extra" },
{ id: "offhand_block_replace_plants", name: "Offhand Block Replace Plants", value: true, category: "extra" },
{ id: "offhand_block_orientation_enabled", name: "Offhand Block Orientation", value: true, category: "extra" },
{ id: "offhand_block_prevent_self_placement", name: "Offhand Prevent Self-Placement", value: true, category: "extra" },
{ id: "offhand_swap_window_ticks", name: "Offhand Swap Window", value: 15, category: "extra" },
{ id: "offhand_swap_double_tap_presses", name: "Offhand Double Tap Presses", value: 2, category: "extra" },
{ id: "offhand_swap_multi_presses", name: "Offhand Multi-Press Count", value: 5, category: "extra" },
{ id: "offhand_swap_cooldown_ticks", name: "Offhand Swap Cooldown", value: 20, category: "extra" },
{ id: "offhand_eat_start_delay_ticks", name: "Offhand Eating Start Delay", value: 5, category: "extra" },
{ id: "offhand_eat_repeat_delay_ticks", name: "Offhand Eating Repeat Delay", value: 5, category: "extra" },
{ id: "fishing_items_enabled", name: "Fishing Item Retrieval Enabled", value: false, category: "extra" },
{ id: "fishing_items_radius", name: "Fishing Item Retrieval Radius", value: 3, category: "extra" },
{ id: "fishing_items_pull_step", name: "Fishing Item Pull Step", value: 4, category: "extra" },
{ id: "fishing_items_vertical_boost", name: "Fishing Item Vertical Boost", value: 1, category: "extra" },
{ id: "true_armor_durability_enabled", name: "True Armor Durability Enabled", value: false, category: "extra" },
{ id: "true_armor_damage_divisor", name: "True Armor Durability Divisor", value: 4, category: "extra" },
{ id: "true_armor_thorns_extra_damage", name: "Thorns Extra Armor Wear", value: 2, category: "extra" },
{ id: "true_armor_players", name: "True Armor Durability on Players", value: true, category: "extra" },
{ id: "true_armor_mobs", name: "True Armor Durability on Mobs", value: true, category: "extra" },
{ id: "true_armor_ignore_elytra", name: "True Armor Durability Ignores Elytra", value: true, category: "extra" },
{ id: "true_armor_break_sound", name: "True Armor Break Sound", value: true, category: "extra" },
{ id: "idm_enabled", name: "Invisible Death Messages Enabled", value: true, category: "additional" },
{ id: "idm_java_wording", name: "Java Death Message Wording", value: true, category: "additional" },
{ id: "idm_hide_invisible_names", name: "Hide Invisible Names", value: true, category: "additional" },
{ id: "idm_hide_invisible_killer", name: "Hide Invisible Killer", value: true, category: "additional" },
{ id: "idm_hide_invisible_victim", name: "Hide Invisible Victim", value: true, category: "additional" },
{ id: "idm_hide_invisible_weapon", name: "Hide Invisible Custom Weapon", value: true, category: "additional" },
{ id: "idm_hide_invisible_mobs", name: "Hide Invisible Mobs", value: true, category: "additional" },
{ id: "idm_hidden_name_style", name: "Invisible Name Style", value: 0, category: "additional" },
{ id: "idm_hidden_name_label", name: "Invisible Name Label", value: "Someone", category: "additional" },
{ id: "idm_escape_messages", name: "Java Escape Messages", value: true, category: "additional" },
{ id: "idm_named_weapon_messages", name: "Named Weapon Death Messages", value: true, category: "additional" },
{ id: "spear_aptitude_enabled", name: "Spear Aptitude Enabled", value: true, category: "extra" },
{ id: "spear_aptitude_swap_window", name: "Spear Aptitude Swap Window", value: 2, category: "extra" },
{ id: "spear_aptitude_hunger_reset", name: "Spear Aptitude Hunger Reset", value: true, category: "extra" },
{ id: "java_mobs_enabled", name: "Java Mob Behavior", value: true, category: "combat" },
{ id: "java_mob_reach", name: "Java Mob Reach", value: true, category: "combat" },
{ id: "java_mob_reach_scale", name: "Java Mob Reach Scale", value: 1.25, category: "combat" },
{ id: "java_mob_cooldown", name: "Java Mob Attack Cooldown", value: true, category: "combat" },
{ id: "java_mob_los", name: "Java Mob Line Of Sight", value: true, category: "combat" },
{ id: "java_mob_movement", name: "Java Mob Movement Pace", value: true, category: "combat" },
{ id: "java_mob_attack_pause", name: "Java Mob Swing Pause", value: true, category: "combat" },
{ id: "java_dragon_launch", name: "Java Ender Dragon Launch", value: true, category: "combat" },
{ id: "java_wither_farm", name: "Java Wither Phases", value: true, category: "combat" },
{ id: "java_mob_special", name: "Java Special Mob Behaviors", value: true, category: "combat" },
];
let dynamicPropertiesPlayer = [
{ id: "sat_hud", name: "Saturation HUD", value: true, category: "hud" },
{ id: "armor_hud", name: "Armor HUD", value: true, category: "hud" },
{ id: "armor_hud_style", name: "Armor HUD Style", value: "h", category: "hud" },
{ id: "potion_hud", name: "Potion Effect HUD", value: true, category: "hud" },
{ id: "shield_hud", name: "Shield HUD", value: true, category: "hud" },
{ id: "cooldown_bar", name: "Cooldown Bar Style", value: 1, category: "hud" },
{ id: "cooldown_bar_type", name: "Cooldown Bar Type", value: "d", category: "hud" },
{ id: "offhand_mode", name: "Offhand HUD Mode", value: "slot", category: "hud" },
{ id: "crosshair_hit_indicator", name: "Crosshair Hit Indicator", value: true, category: "hud" },
{ id: "crosshair_indicator_style", name: "Crosshair Indicator Style", value: 0, category: "hud" },
{ id: "shield_side", name: "Shield Side", value: "l", category: "hud" },
{ id: "ui_profile", name: "UI Profile", value: "d", category: "hud" },
{ id: "shield_side_pose", name: "Side Shield Pose", value: true, category: "controls" },
{ id: "offhand_swap", name: "Offhand Swap Mode", value: 0, category: "controls" },
{ id: "offhand_swap_sneak_presses", name: "Offhand Swap Sneak Presses", value: 2, category: "controls" },
{ id: "emote_hotbar_slot", name: "Emote Hotbar Slot", value: 1, category: "controls" },
{ id: "offset", name: "Mobile Sat Offset", value: true, category: "gameplay" }
];
export const cfg = {};
export function reloadConfig() {
for (const prop of dynamicProperties) {
const v = world.getDynamicProperty(prop.id);
const def = prop.value;
cfg[prop.id] = v !== undefined
? (typeof def === 'boolean' ? Boolean(v) : typeof def === 'number' ? Number(v) : v)
: def;
}
// Prefer modern keys; fall back to legacy sat/shield aliases from older forms.
const satLegacy = world.getDynamicProperty("sat");
const shieldLegacy = world.getDynamicProperty("shield");
if (world.getDynamicProperty("java_saturation_enabled") === undefined && satLegacy !== undefined) {
world.setDynamicProperty("java_saturation_enabled", Boolean(satLegacy));
}
if (world.getDynamicProperty("custom_shield_enabled") === undefined && shieldLegacy !== undefined) {
world.setDynamicProperty("custom_shield_enabled", Boolean(shieldLegacy));
}
cfg.java_saturation_enabled = Boolean(world.getDynamicProperty("java_saturation_enabled") ?? satLegacy ?? true);
cfg.java_saturation_speed = Number(world.getDynamicProperty("java_saturation_speed") ?? 1.0);
cfg.anti_spam_enabled = Boolean(world.getDynamicProperty("anti_spam_enabled") ?? true);
cfg.custom_shield_enabled = Boolean(world.getDynamicProperty("custom_shield_enabled") ?? shieldLegacy ?? true);
cfg.sat = cfg.java_saturation_enabled;
cfg.shield = cfg.custom_shield_enabled;
cfg.spear_aptitude_enabled = Boolean(world.getDynamicProperty("spear_aptitude_enabled") ?? true);
cfg.spear_aptitude_swap_window = Number(world.getDynamicProperty("spear_aptitude_swap_window") ?? 2);
cfg.spear_aptitude_hunger_reset = Boolean(world.getDynamicProperty("spear_aptitude_hunger_reset") ?? true);
}
system.run(reloadConfig);
function dp(player, { id }) {
if (id === "ui_profile" || id === "shield_side") {
const playerValue = player.getDynamicProperty(id);
if (playerValue !== undefined) return playerValue;
const localValue = dynamicPropertiesPlayer.find(property => property.id === id);
return localValue ? localValue.value : false;
}
const worldValue = world.getDynamicProperty(id);
if (worldValue === undefined) {
const localValue = dynamicProperties.find(property => property.id === id);
return localValue ? localValue.value : false;
}
return worldValue;
}
function initializeWorldProperties() {
dynamicProperties.forEach(property => {
const currentValue = world.getDynamicProperty(property.id);
if (currentValue === undefined) {
world.setDynamicProperty(property.id, property.value);
}
});
const maceNerfMigration = Number(world.getDynamicProperty("mace_smash_nerf_migration") ?? 0);
if (maceNerfMigration < 1) {
world.setDynamicProperty("mace_smash_fall_nerf_enabled", true);
const currentMultiplier = world.getDynamicProperty("mace_air_damage_multiplier");
if (currentMultiplier === undefined || Number(currentMultiplier) === 1 || Number(currentMultiplier) === 0.8) {
world.setDynamicProperty("mace_air_damage_multiplier", 0.65);
}
if (world.getDynamicProperty("mace_one_block_damage") === undefined) {
world.setDynamicProperty("mace_one_block_damage", 5);
}
if (world.getDynamicProperty("mace_density_multiplier_per_level") === undefined) {
world.setDynamicProperty("mace_density_multiplier_per_level", 0.05);
}
world.setDynamicProperty("mace_smash_nerf_migration", 1);
}
reloadConfig();
}
function initializePlayerProperties(player) {
dynamicPropertiesPlayer.forEach(property => {
const currentValue = player.getDynamicProperty(property.id);
if (currentValue === undefined) {
player.setDynamicProperty(property.id, property.value);
}
});
}
function showItemAdminForm(player) {
const form = new ModalFormData().title("HUD Settings");
form.header(`HUD Settings`);
form.divider();
form.toggle("Saturation HUD", {
defaultValue: Boolean(world.getDynamicProperty("sat_hud_server") ?? true)
});
form.label(`§7Enables the saturation HUD for all players.§r.`);
form.toggle("Armor HUD", {
defaultValue: Boolean(world.getDynamicProperty("armor_hud_server") ?? true)
});
form.label(`§7Enables the armor durability HUD for all players.§r`);
form.toggle("Shield HUD", {
defaultValue: Boolean(world.getDynamicProperty("shield_hud_server") ?? true)
});
form.label(`§7Enables the shield cooldown HUD for all players.§r`);
form.toggle("Cooldown Bar", {
defaultValue: Boolean(world.getDynamicProperty("cooldown_hud") ?? true)
});
form.label(`§7Enables the attack cooldown bar for all players.§r`);
const cooldownBarType = world.getDynamicProperty("cooldown_bar_type") ?? "d";
form.dropdown("Cooldown Bar Type", [
"High Contrast",
"Hotbar",
"Default"
], { defaultValueIndex: cooldownBarType === "h" ? 1 : cooldownBarType === "c" ? 0 : 2 });
form.label(`§7Choose the style for the cooldown bar.§r`);
const offhandMode = world.getDynamicProperty("offhand_mode") ?? "shield";
form.dropdown("Offhand Mode", [
"Slot Mode",
"Shield Mode"
], { defaultValueIndex: offhandMode === "slot" ? 1 : 0 });
form.label(`§7Choose the offhand system for all players.§r`);
const crosshairHit = Boolean(world.getDynamicProperty("crosshair_hit_indicator") ?? true);
form.toggle("Crosshair Hit Indicator", { defaultValue: crosshairHit });
form.label(`§7Show a hit indicator on the crosshair.§r`);
form.show(player).then((response) => {
if (response.canceled) {
player.sendMessage("§7Configuration canceled.");
showHudConfigMenu(player);
return;
}
const values = getFormValues(response);
if (values.length < 7) {
player.sendMessage("§cHUD settings were incomplete. Close other menus and try again.");
showHudConfigMenu(player);
return;
}
world.setDynamicProperty("sat_hud_server", Boolean(values[0]));
world.setDynamicProperty("armor_hud_server", Boolean(values[1]));
world.setDynamicProperty("shield_hud_server", Boolean(values[2]));
world.setDynamicProperty("cooldown_hud", Boolean(values[3]));
world.setDynamicProperty("cooldown_bar_type", ["c", "h", "d"][Number(values[4])] ?? "d");
world.setDynamicProperty("offhand_mode", Number(values[5]) === 1 ? "slot" : "shield");
world.setDynamicProperty("crosshair_hit_indicator", Boolean(values[6]));
reloadConfig();
showHudConfigMenu(player);
}).catch(() => {
player.sendMessage("§cFailed to show config form.");
});
}
function showItemForm(player) {
const form = new ModalFormData().title("§lServer Configuration");
form.header(`§l§6Mechanics§r`);
form.divider();
form.toggle("Java Saturation", {
defaultValue: Boolean(world.getDynamicProperty("java_saturation_enabled") ?? dp(player, { id: "sat" }))
});
form.label(`§7Replaces Bedrock saturation with Java Edition's.§r\n\n§fwill turn off if you have §lnatural regeneration §rdisabled.`);
form.toggle("Custom Shield", {
defaultValue: Boolean(world.getDynamicProperty("custom_shield_enabled") ?? dp(player, { id: "shield" }))
});
form.label(`§7Enables the custom right click shield, hold interact with \n\n     or §r`);
let savedKnockbackProfile = world.getDynamicProperty("knockback_profile");
if (typeof savedKnockbackProfile !== "number") savedKnockbackProfile = 0;
form.dropdown("Knockback Profile", [
"Legacy Knockback",
"Modern Knockback",
"Experimental Knockback"
], { defaultValueIndex: savedKnockbackProfile });
form.label(`§7Choose the knockback tuning preset for this world.§r`);
form.header(`§l§bHUD Settings§r`);
form.divider();
form.toggle("Saturation HUD", {
defaultValue: Boolean(world.getDynamicProperty("sat_hud_server") ?? true)
});
form.label(`§7Enables the saturation HUD for all players.§r.`);
form.toggle("Armor HUD", {
defaultValue: Boolean(world.getDynamicProperty("armor_hud_server") ?? true)
});
form.label(`§7Enables the armor durability HUD for all players.§r`);
form.toggle("Shield HUD", {
defaultValue: Boolean(world.getDynamicProperty("shield_hud_server") ?? true)
});
form.label(`§7Enables the shield cooldown HUD for all players.§r`);
form.toggle("Cooldown Bar", {
defaultValue: Boolean(world.getDynamicProperty("cooldown_hud") ?? true)
});
form.label(`§7Enables the attack cooldown bar for all players.§r`);
form.show(player).then((response) => {
if (response.canceled) {
player.sendMessage("Configuration canceled.");
return;
}
const values = getFormValues(response);
if (values.length < 7) {
player.sendMessage("§cConfiguration incomplete. Close other menus and try again.");
return;
}
world.setDynamicProperty("sat", Boolean(values[0]));
world.setDynamicProperty("java_saturation_enabled", Boolean(values[0]));
world.setDynamicProperty("shield", Boolean(values[1]));
world.setDynamicProperty("custom_shield_enabled", Boolean(values[1]));
world.setDynamicProperty("knockback_profile", Number(values[2]) || 0);
world.setDynamicProperty("sat_hud_server", Boolean(values[3]));
world.setDynamicProperty("armor_hud_server", Boolean(values[4]));
world.setDynamicProperty("shield_hud_server", Boolean(values[5]));
world.setDynamicProperty("cooldown_hud", Boolean(values[6]));
reloadConfig();
updateRules();
player.sendMessage("Configuration saved.");
}).catch(() => {
player.sendMessage("§cFailed to show config form.");
});
}
function showControlsSettingsForm(player) {
const form = new ModalFormData().title("§l§aControl Settings");
form.header("§l§aControl Settings");
form.divider();
const sideShieldPose = Boolean(player.getDynamicProperty("shield_side_pose") ?? true);
form.toggle("Side Shield Pose", { defaultValue: sideShieldPose });
form.label("§7Show shield pose on the side when blocking.§r");
const offhandSwap = Math.max(0, Math.min(3, Number(player.getDynamicProperty("offhand_swap") ?? 0)));
form.dropdown("Offhand Swap Mode", [
"2x Sneak",
"5x Sneak",
"Emote",
"None"
], { defaultValueIndex: offhandSwap });
form.label("§7How you swap items to your offhand.§r");
form.slider("Emote hotbar slot", 1, 9, { defaultValue: Number(player.getDynamicProperty("emote_hotbar_slot") ?? 1) });
form.label("§7Controller/mobile: emote swaps to this slot.§r");
form.header("§l§eHUD Settings");
form.divider();
form.toggle("Personal Armor HUD", {
defaultValue: Boolean(player.getDynamicProperty("armor_hud") ?? true)
});
form.label("§7Show the armor durability HUD for yourself.§r");
form.toggle("Mobile saturation offset", {
defaultValue: Boolean(player.getDynamicProperty("offset") ?? true)
});
form.label("§7Shifts the saturation HUD slightly on touch / mobile layouts.§r");
const savedArmorHudStyle = player.getDynamicProperty("armor_hud_style") ?? "h";
const armorHudStyleIndex = savedArmorHudStyle === "v" ? 1 : savedArmorHudStyle === "b" ? 2 : 0;
form.dropdown("Armor HUD Style", [
"Horizontal Armor Slots",
"Vertical Armor Slots",
"4 Green Durability Bars"
], { defaultValueIndex: armorHudStyleIndex });
form.label("§7Choose the proven armor HUD layout. The bars option shows four green durability bars.§r");
form.show(player).then((response) => {
if (response.canceled) {
player.sendMessage("§7Configuration canceled.");
return;
}
const values = getFormValues(response);
if (values.length < 6) {
player.sendMessage("§cControl settings were incomplete. Close other menus and try again.");
return;
}
player.setDynamicProperty("shield_side_pose", Boolean(values[0]));
player.setDynamicProperty("offhand_swap", Math.max(0, Math.min(3, Number(values[1]) || 0)));
player.setDynamicProperty("emote_hotbar_slot", Math.max(1, Math.min(9, Number(values[2]) || 1)));
player.setDynamicProperty("armor_hud", Boolean(values[3]));
player.setDynamicProperty("offset", Boolean(values[4]));
player.setDynamicProperty("armor_hud_style", ["h", "v", "b"][Number(values[5])] ?? "h");
player.sendMessage("§a§lControl settings saved.");
}).catch(() => {
player.sendMessage("§cFailed to show control settings form.");
});
}
function showItemFormPlayer(player) {
showControlsSettingsForm(player);
}
world.afterEvents.playerSpawn.subscribe(({ player }) => {
if (player) initializePlayerProperties(player);
});
system.beforeEvents.startup.subscribe((init) => {
const configEnum = ["world", "personal"];
init.customCommandRegistry.registerEnum("jk:config", configEnum);
const configCmd = {
name: "jk:config",
description: "Opens the config for Another Java Addon (world/personal)",
permissionLevel: CommandPermissionLevel.Any,
cheatsRequired: false,
optionalParameters: [
{
type: CustomCommandParamType.Enum,
name: "jk:config"
}
]
};
init.customCommandRegistry.registerCommand(configCmd, configHandler);
});
function configHandler(origin, type) {
const player = origin.sourceEntity;
if (!player) {
return { status: CustomCommandStatus.Failure, message: "This command can only be run by a player." };
}
const configType = (typeof type === "string" ? type : (Array.isArray(type) && type.length > 0 ? type[0] : "personal"));
if (configType === "world") {
if ((player.commandPermissionLevel ?? 0) < 1) {
return { status: CustomCommandStatus.Failure, message: "You do not have permission to open the world config." };
}
system.run(() => {
try { showMainConfigMenu(player); }
catch (error) {
console.warn("[JPVP] Failed to open world config:", error);
player.sendMessage("§cFailed to open world config. Check the content log.");
}
});
return { status: CustomCommandStatus.Success, message: "Opening World Config" };
}
system.run(() => {
try { showItemFormPlayer(player); }
catch (error) {
console.warn("[JPVP] Failed to open personal config:", error);
player.sendMessage("§cFailed to open personal config. Check the content log.");
}
});
return { status: CustomCommandStatus.Success, message: "Opening Personal Config" };
}
function configPlayerHandler(origin) {
const player = origin.sourceEntity;
if (!player) {
return { status: CustomCommandStatus.Failure, message: "This command can only be run by a player." };
}
system.run(() => {
try { showItemFormPlayer(player); }
catch (error) {
console.warn("[JPVP] Failed to open personal config:", error);
player.sendMessage("§cFailed to open personal config. Check the content log.");
}
});
return { status: CustomCommandStatus.Success, message: "Opening Config" };
}
world.afterEvents.worldLoad.subscribe(() => {
initializeWorldProperties();
});
export {
dynamicProperties,
dynamicPropertiesPlayer,
dp,
clampNumber,
configHandler,
configPlayerHandler,
showItemForm,
showItemFormPlayer,
initializeWorldProperties,
initializePlayerProperties
};