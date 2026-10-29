import { world } from '@minecraft/server';
import { cfg } from '../engine/config.js';
world.afterEvents.projectileHitEntity.subscribe(evd => {
const { source: attacker, projectile } = evd;
const victim = evd.getEntityHit().entity;
if (!attacker) {return}
if (cfg.bow_ding_enabled && projectile?.typeId === "minecraft:arrow") {
if (attacker.typeId === "minecraft:player") {
attacker.playSound("random.orb");
}
if (victim && victim.typeId === "minecraft:player") {
victim.dimension.playSound("random.orb", victim.location);
}
}
});