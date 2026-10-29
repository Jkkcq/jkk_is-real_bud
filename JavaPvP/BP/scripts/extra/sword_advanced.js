import { world, system } from "@minecraft/server";
import { cfg } from "../engine/config.js";
function enabled() {
try {
return cfg.sword_advanced_enabled !== false;
} catch {
return true;
}
}
const lastVel = new Map();
function dampenOnHit(player) {
if (!enabled() || !cfg.sword_combo_dampen) return;
if (!player || player.typeId !== "minecraft:player") return;
try {
const v = player.getVelocity?.();
if (!v) return;
const mult = Math.max(0.2, Math.min(1, Number(cfg.sword_combo_dampen_mult ?? 0.6)));
const nx = v.x * mult;
const nz = v.z * mult;
if (typeof player.applyKnockback === "function") {
try {
player.applyKnockback({ x: nx - v.x, z: nz - v.z }, 0);
} catch {
try {
player.applyKnockback(nx - v.x, nz - v.z, 0, 0);
} catch {}
}
}
} catch {}
}
try {
world.afterEvents.entityHurt.subscribe((ev) => {
if (!enabled()) return;
const e = ev.hurtEntity;
if (!e || e.typeId !== "minecraft:player") return;
const cause = ev.damageSource?.cause;
if (cause && String(cause).toLowerCase().includes("void")) return;
system.run(() => dampenOnHit(e));
});
} catch {}
const wasAir = new Map();
system.runInterval(() => {
if (!enabled() || cfg.sword_jump_reset_assist === false) return;
for (const p of world.getPlayers()) {
try {
const id = p.id;
const grounded = p.isOnGround && !p.isFalling;
const prev = wasAir.get(id);
if (prev === true && grounded) {
if (cfg.sword_jump_reset_boost) {
try {
const yaw = (p.getRotation().y) * (Math.PI / 180);
const s = Number(cfg.sword_jump_reset_boost_strength ?? 0.08);
p.applyKnockback({ x: -Math.sin(yaw) * s, z: Math.cos(yaw) * s }, 0);
} catch {}
}
}
wasAir.set(id, !grounded);
} catch {}
}
}, 2);
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
lastVel.delete(playerId);
wasAir.delete(playerId);
});