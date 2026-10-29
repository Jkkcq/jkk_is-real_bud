import { world, system, GameRule, EquipmentSlot } from "@minecraft/server";
const ORIGINAL_RULE_PROPERTY = "idm_original_show_death_messages";
const SUPPRESSED_RULE_PROPERTY = "idm_native_rule_suppressed";
const RECENT_ATTACK_TICKS = 100;
const RECENT_DAMAGE_TICKS = 2;
const recentAttackByPlayer = new Map();
const recentFallDamageByPlayer = new Map();
let internalRuleWrites = 0;
let warnedRuleWriteFailure = false;
function setting(name, fallback) {
const value = world.getDynamicProperty(name);
return value === undefined ? fallback : Boolean(value);
}
function featureEnabled() {
return setting("idm_enabled", true);
}
function writeNativeDeathRule(value) {
try {
if (world.gameRules.showDeathMessages === value) return true;
internalRuleWrites++;
world.gameRules.showDeathMessages = value;
system.run(() => { internalRuleWrites = Math.max(0, internalRuleWrites - 1); });
return true;
} catch (error) {
internalRuleWrites = Math.max(0, internalRuleWrites - 1);
if (!warnedRuleWriteFailure) {
warnedRuleWriteFailure = true;
console.warn("[Jk's JPVP] Could not update showDeathMessages; custom death messages may overlap the native gamerule.", error);
}
return false;
}
}
export function syncInvisibleDeathRule() {
try {
const enabled = featureEnabled();
const isSuppressed = world.getDynamicProperty(SUPPRESSED_RULE_PROPERTY) === true;
if (enabled) {
if (!isSuppressed) {
world.setDynamicProperty(ORIGINAL_RULE_PROPERTY, Boolean(world.gameRules.showDeathMessages));
if (!writeNativeDeathRule(false)) return;
world.setDynamicProperty(SUPPRESSED_RULE_PROPERTY, true);
} else {
writeNativeDeathRule(false);
}
return;
}
if (isSuppressed) {
const previousValue = world.getDynamicProperty(ORIGINAL_RULE_PROPERTY);
if (!writeNativeDeathRule(typeof previousValue === "boolean" ? previousValue : true)) return;
world.setDynamicProperty(SUPPRESSED_RULE_PROPERTY, false);
}
} catch (error) {
console.warn("[Jk's JPVP] Death-message gamerule synchronization failed.", error);
}
}
function hasInvisibility(entity) {
try {
return Boolean(entity?.getEffect("invisibility"));
} catch {
return false;
}
}
function basicEntityName(entity) {
try {
const customName = entity.nameTag;
if (typeof customName === "string" && customName.trim()) return customName;
if (entity.typeId === "minecraft:player") return entity.name || "Unknown Player";
const rawType = String(entity.typeId ?? "Unknown").split(":").pop();
return rawType.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
} catch {
return "Unknown";
}
}
function hiddenName() {
if (Number(world.getDynamicProperty("idm_hidden_name_style") ?? 0) === 1) {
const label = world.getDynamicProperty("idm_hidden_name_label");
if (typeof label === "string" && label.trim()) return label.trim().slice(0, 24);
}
return "§kSomeone§r";
}
function displayName(entity, savedName, role) {
if (!entity) return savedName || "Unknown";
const shouldHide = role === "victim"
? setting("idm_hide_invisible_victim", true)
: setting("idm_hide_invisible_killer", true);
const canHideEntity = entity.typeId === "minecraft:player" || setting("idm_hide_invisible_mobs", true);
if (setting("idm_hide_invisible_names", true) && shouldHide && canHideEntity && hasInvisibility(entity)) return hiddenName();
return basicEntityName(entity) || savedName || "Unknown";
}
function getCustomWeaponName(attacker) {
if (!setting("idm_named_weapon_messages", true) || !attacker) return undefined;
try {
const item = attacker.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
const customName = item?.nameTag;
if (typeof customName !== "string" || !customName.trim()) return undefined;
if (setting("idm_enabled", true) && setting("idm_hide_invisible_names", true)
&& setting("idm_hide_invisible_weapon", true)
&& (attacker.typeId === "minecraft:player" || setting("idm_hide_invisible_mobs", true))
&& hasInvisibility(attacker)) return hiddenName();
return customName;
} catch {
return undefined;
}
}
function attackerFrom(source) {
return source?.damagingEntity ?? source?.damagingProjectile;
}
function rememberAttack(event) {
const victim = event?.hurtEntity;
if (victim?.typeId !== "minecraft:player") return;
const cause = String(event?.damageSource?.cause ?? "");
if (cause === "fall") {
const damage = Number(event?.damage);
if (Number.isFinite(damage)) {
recentFallDamageByPlayer.set(victim.id, { damage, tick: system.currentTick });
}
}
const attacker = attackerFrom(event?.damageSource);
if (!attacker || attacker.id === victim.id) return;
recentAttackByPlayer.set(victim.id, {
attacker,
name: basicEntityName(attacker),
weaponName: getCustomWeaponName(attacker),
tick: system.currentTick,
});
}
function recentAttacker(player) {
const record = recentAttackByPlayer.get(player.id);
return record && system.currentTick - record.tick <= RECENT_ATTACK_TICKS ? record : undefined;
}
function weaponUsedBy(attacker, record) {
const age = record ? system.currentTick - record.tick : Number.POSITIVE_INFINITY;
if (attacker && record?.attacker?.id === attacker.id && age <= RECENT_DAMAGE_TICKS) {
return record.weaponName;
}
return getCustomWeaponName(attacker) ?? record?.weaponName;
}
function weaponSuffix(weaponName, mode) {
if (!weaponName) return "";
return mode === "with" ? ` with ${weaponName}` : ` using ${weaponName}`;
}
function fallPhrase(playerId) {
const hit = recentFallDamageByPlayer.get(playerId);
const isRecent = hit && system.currentTick - hit.tick <= RECENT_DAMAGE_TICKS;
return isRecent && hit.damage > 2 ? "fell from a high place" : "hit the ground too hard";
}
function environmentalEscapeMessage(victim, cause, attacker, weaponName, playerId) {
const suffix = weaponSuffix(weaponName, "using");
switch (cause) {
case "fall":
return `${victim} ${fallPhrase(playerId)} while trying to escape ${attacker}${suffix}`;
case "drowning":
return `${victim} drowned while trying to escape ${attacker}${suffix}`;
case "lava":
return `${victim} tried to swim in lava while trying to escape ${attacker}${suffix}`;
case "suffocation":
return `${victim} suffocated in a wall while trying to escape ${attacker}${suffix}`;
case "flyIntoWall":
return `${victim} experienced kinetic energy while trying to escape ${attacker}${suffix}`;
case "void":
return `${victim} didn't want to live in the same world as ${attacker}`;
case "freezing":
return `${victim} was frozen to death by ${attacker}${suffix}`;
case "contact":
return `${victim} was pricked to death while trying to escape ${attacker}${suffix}`;
case "fire":
case "fireTick":
return `${victim} was burned to a crisp while fighting ${attacker}${suffix}`;
default:
return undefined;
}
}
function buildJavaMessage(player, source) {
const victim = displayName(player, undefined, "victim");
const cause = String(source?.cause ?? "none");
const attacker = source?.damagingEntity ?? source?.damagingProjectile;
const attackerRecord = recentAttacker(player);
const killer = attacker ? displayName(attacker, undefined, "killer") : attackerRecord
? displayName(attackerRecord.attacker, attackerRecord.name, "killer")
: undefined;
const weapon = weaponUsedBy(attacker, attackerRecord);
const escapeMessages = setting("idm_escape_messages", true);
if (attacker && cause === "entityAttack") {
return `${victim} was slain by ${killer}${weaponSuffix(weapon, "using")}`;
}
if (attacker && cause === "projectile") {
const projectileType = String(source?.damagingProjectile?.typeId ?? "").toLowerCase();
const verb = projectileType.includes("trident") ? "was impaled by" : projectileType.includes("fireball") ? "was fireballed by" : "was shot by";
return `${victim} ${verb} ${killer}${weaponSuffix(weapon, "using")}`;
}
if (attacker && cause === "maceSmash") {
return `${victim} was smashed by ${killer}${weaponSuffix(weapon, "with")}`;
}
if (attacker && (cause === "entityExplosion" || cause === "blockExplosion")) {
return `${victim} was blown up${cause === "entityExplosion" ? ` by ${killer}` : ""}${weaponSuffix(weapon, "using")}`;
}
if (attacker && cause === "fireworks") {
return `${victim} went off with a bang due to a firework fired by ${killer}${weaponSuffix(weapon, "using")}`;
}
if (escapeMessages && attackerRecord && killer) {
const message = environmentalEscapeMessage(victim, cause, killer, attackerRecord.weaponName, player.id);
if (message) return message;
}
switch (cause) {
case "fall": return `${victim} ${fallPhrase(player.id)}`;
case "drowning": return `${victim} drowned`;
case "lava": return `${victim} tried to swim in lava`;
case "void": return `${victim} fell out of the world`;
case "fire": return `${victim} went up in flames`;
case "fireTick": return `${victim} burned to death`;
case "suffocation": return `${victim} suffocated in a wall`;
case "freezing": return `${victim} froze to death`;
case "flyIntoWall": return `${victim} experienced kinetic energy`;
case "magma": return `${victim} discovered the floor was lava`;
case "starve": return `${victim} starved to death`;
case "lightning": return `${victim} was struck by lightning`;
case "anvil": return `${victim} was squashed by a falling anvil`;
case "fallingBlock": return `${victim} was squashed by a falling block`;
case "stalactite": return `${victim} was skewered by a falling stalactite`;
case "stalagmite": return `${victim} was impaled on a stalagmite`;
case "sonicBoom": return `${victim} was obliterated by a sonically-charged shriek`;
case "wither":
case "magic": return `${victim} was killed by magic`;
case "contact": return `${victim} was pricked to death`;
case "blockExplosion": return `${victim} blew up`;
case "ramAttack": return `${victim} was rammed by a goat`;
case "piston": return `${victim} was squished by a piston`;
case "selfDestruct":
case "none":
case "override": return `${victim} died`;
default:
return killer ? `${victim} was killed by ${killer}${weaponSuffix(weapon, "using")}` : `${victim} died`;
}
}
function buildLegacyMessage(player, source) {
const victim = displayName(player, undefined, "victim");
const cause = String(source?.cause ?? "none");
const attacker = attackerFrom(source);
const attackerRecord = recentAttacker(player);
const killer = attacker ? displayName(attacker, undefined, "killer") : attackerRecord
? displayName(attackerRecord.attacker, attackerRecord.name, "killer")
: undefined;
if (killer) return `${victim} was killed by ${killer}`;
const causeText = {
fall: "fell to their death", drowning: "drowned", lava: "burned in lava",
void: "fell out of the world", fire: "burned to death", fireTick: "burned to death",
freezing: "froze to death", suffocation: "suffocated", starve: "starved to death",
}[cause];
return causeText ? `${victim} ${causeText}` : `${victim} died`;
}
function onPlayerDeath(event) {
const player = event?.deadEntity;
if (player?.typeId !== "minecraft:player" || !featureEnabled()) return;
const source = event.damageSource ?? {};
const javaWording = setting("idm_java_wording", true);
const message = javaWording ? buildJavaMessage(player, source) : buildLegacyMessage(player, source);
try { world.sendMessage(message); }
catch (error) { console.warn("[Jk's JPVP] Could not send a custom death message.", error); }
recentAttackByPlayer.delete(player.id);
recentFallDamageByPlayer.delete(player.id);
}
world.afterEvents.entityHurt.subscribe(rememberAttack);
world.afterEvents.entityDie.subscribe(onPlayerDeath);
world.afterEvents.gameRuleChange.subscribe(event => {
if (event?.rule !== GameRule.ShowDeathMessages || internalRuleWrites > 0 || !featureEnabled()) return;
world.setDynamicProperty(ORIGINAL_RULE_PROPERTY, Boolean(event.value));
if (event.value === true) system.run(syncInvisibleDeathRule);
});
world.afterEvents.worldLoad.subscribe(() => system.run(syncInvisibleDeathRule));
system.runInterval(() => {
const now = system.currentTick;
for (const [playerId, record] of recentAttackByPlayer) {
if (now - record.tick > RECENT_ATTACK_TICKS) recentAttackByPlayer.delete(playerId);
}
for (const [playerId, record] of recentFallDamageByPlayer) {
if (now - record.tick > RECENT_DAMAGE_TICKS) recentFallDamageByPlayer.delete(playerId);
}
}, 100);