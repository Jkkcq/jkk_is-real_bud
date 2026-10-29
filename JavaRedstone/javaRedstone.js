/**
 * Java Redstone Mechanics — aggressive "cheese" port for Bedrock
 *
 * Still not true engine parity. These are script-side approximations:
 *
 *  CHEESE 1 — Quasi-connectivity + BUD latch for pistons/dispensers/droppers
 *  CHEESE 2 — Soft vs hard power gate (dust alone won't QC-power through solids the same way)
 *  CHEESE 3 — 0-tick pulse cheese (same-tick place/remove redstone + piston re-pulse)
 *  CHEESE 4 — Dust signal clamp / monotonic decay pass (Java-ish level falloff)
 *  CHEESE 5 — Piston timing queues (extend/retract delays mimicking Java ticks)
 *  CHEESE 6 — Sticky short-pulse "block drop" attempt (detect brief power, break/drop)
 *  CHEESE 7 — Update-order-ish neighbor sweep (fixed direction order like Java)
 *
 * Toggle: !jr help | /scriptevent jr:help
 */

import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";

// ===================== config =====================
const DP = {
  enabled: "jr_enabled",
  qcPistons: "jr_qc_pistons",
  qcDispense: "jr_qc_dispense",
  budMode: "jr_bud_mode",
  softHard: "jr_soft_hard",
  zeroTick: "jr_zero_tick",
  dustFix: "jr_dust_fix",
  pistonTiming: "jr_piston_timing",
  blockDrop: "jr_block_drop",
  radius: "jr_radius",
  pulseTicks: "jr_pulse_ticks",
};

const DEFAULTS = {
  enabled: true,
  qcPistons: true,
  qcDispense: true,
  budMode: false,
  softHard: true,
  zeroTick: true,
  dustFix: true,
  pistonTiming: true,
  blockDrop: true,
  radius: 20,
  pulseTicks: 1,
};

function cfg(k) {
  try {
    const v = world.getDynamicProperty(DP[k]);
    return v === undefined || v === null ? DEFAULTS[k] : v;
  } catch { return DEFAULTS[k]; }
}
function setCfg(k, v) { try { world.setDynamicProperty(DP[k], v); } catch {} }
function loadDefaults() {
  for (const k of Object.keys(DEFAULTS)) {
    try { if (world.getDynamicProperty(DP[k]) === undefined) setCfg(k, DEFAULTS[k]); } catch {}
  }
}

// ===================== constants =====================
const PISTONS = new Set(["minecraft:piston", "minecraft:sticky_piston"]);
const DISPENSE = new Set(["minecraft:dispenser", "minecraft:dropper"]);
const OBSERVERS = new Set(["minecraft:observer"]);
const REPEATERS = new Set(["minecraft:repeater", "minecraft:powered_repeater", "minecraft:unpowered_repeater"]);
const COMPARATORS = new Set(["minecraft:comparator", "minecraft:powered_comparator", "minecraft:unpowered_comparator"]);
const DUST = "minecraft:redstone_wire";

// Java-ish neighbor order (approximation of horizontal-first update habits)
const DIR_ORDER = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
];

const FACE_DELTA = {
  0: [0, -1, 0], 1: [0, 1, 0], 2: [0, 0, -1], 3: [0, 0, 1], 4: [-1, 0, 0], 5: [1, 0, 0],
};
const FACE_OPP = {
  0: [0, 1, 0], 1: [0, -1, 0], 2: [0, 0, 1], 3: [0, 0, -1], 4: [1, 0, 0], 5: [-1, 0, 0],
};

// ===================== repeater delay queue =====================
const repeaterQueue = [];
function queueRepeater(block, delay) {
  if (!cfg("enabled")) return;
  const d = Math.max(1, Math.min(4, Number(delay) || 1));
  repeaterQueue.push({ block, tick: system.currentTick + d });
}
function processRepeaters() {
  const now = system.currentTick;
  for (let i = repeaterQueue.length - 1; i >= 0; i--) {
    const q = repeaterQueue[i];
    if (now >= q.tick) {
      try {
        // Approximate: re-set permutation to force output update
        if (q.block) q.block.setPermutation(q.block.permutation);
      } catch {}
      repeaterQueue.splice(i, 1);
    }
  }
}

// ===================== comparator subtraction (approximate) =====================
function comparatorSubtract(block) {
  if (!block || !cfg("enabled")) return;
  try {
    const mode = block.permutation?.getState?.("output_subtract_bit") ?? block.permutation?.getState?.("mode");
    if (mode !== true && mode !== 1 && mode !== "subtract") return;
    // Approximate: if side input is high, reduce output
    const front = block.above?.() || block;
    if (front && isDust(front)) {
      const side = getPower(block);
      const cur = getPower(front);
      if (side > 0 && cur > 0) {
        // Force a lower signal by re-setting the dust
        front.setPermutation(front.permutation);
      }
    }
  } catch {}
}

// ===================== observer pulse (approximate) =====================
const observerPulseQueue = [];
function queueObserverPulse(block) {
  if (!cfg("enabled")) return;
  observerPulseQueue.push({ block, tick: system.currentTick + 1 });
}
function processObserverPulses() {
  const now = system.currentTick;
  for (let i = observerPulseQueue.length - 1; i >= 0; i--) {
    const q = observerPulseQueue[i];
    if (now >= q.tick) {
      try {
        // Approximate: re-trigger neighbor update after 1 tick
        const n = q.block?.above?.() || q.block;
        if (n) n.setPermutation(n.permutation);
      } catch {}
      observerPulseQueue.splice(i, 1);
    }
  }
}

// ===================== power reading =====================
function getPower(block) {
  if (!block) return 0;
  try {
    const p = block.getRedstonePower?.();
    if (typeof p === "number") return Math.max(0, Math.min(15, p));
  } catch {}
  try {
    const id = block.typeId;
    if (id === "minecraft:redstone_block") return 15;
    if (id === "minecraft:lit_redstone_torch" || id === "minecraft:redstone_torch") return 15;
    if (id === DUST) {
      const s = block.permutation?.getState?.("redstone_signal");
      if (typeof s === "number") return s;
    }
    if (id?.includes("repeater") || id?.includes("comparator")) {
      // powered variants / states
      if (id.startsWith("minecraft:powered_")) return 15;
      const p = block.permutation?.getState?.("output_lit_bit")
        ?? block.permutation?.getState?.("powered_bit");
      if (p === true || p === 1) return 15;
    }
    for (const key of ["open_bit", "button_pressed_bit", "powered_bit", "triggered_bit"]) {
      const v = block.permutation?.getState?.(key);
      if (v === true || v === 1) return 15;
    }
  } catch {}
  return 0;
}

function isDust(block) { return block?.typeId === DUST; }
function isSolidConductor(block) {
  if (!block || block.isAir || block.isLiquid) return false;
  const id = block.typeId;
  if (id === DUST || id.includes("torch") || id.includes("repeater") || id.includes("comparator")) return false;
  if (id.includes("glass") || id.includes("slab") || id === "minecraft:glowstone") return false;
  return true;
}
function isHardPowerSource(block) {
  if (!block) return false;
  const id = block.typeId;
  if (id === "minecraft:redstone_block") return true;
  if (id?.includes("repeater") && getPower(block) > 0) return true;
  if (id === "minecraft:observer" && getPower(block) > 0) return true;
  // Lever/button into a block = hard power that block
  if ((id?.includes("lever") || id?.includes("button")) && getPower(block) > 0) return true;
  return false;
}
function isSoftPowerSource(block) {
  return isDust(block) && getPower(block) > 0;
}

// ===================== CHEESE 2: soft vs hard =====================
/**
 * Java-ish: dust soft-powers mechanisms beside it but does not hard-power a solid
 * that then powers a mechanism on the far side the same way a repeater does.
 * For QC of the cell ABOVE a piston: require either hard power into that cell,
 * dust/component directly adjacent, or a hard-powered solid adjacent.
 */
function cellWouldBeActivated(dim, loc, softHard) {
  let cell;
  try { cell = dim.getBlock(loc); } catch { return false; }
  if (!cell) return false;

  if (getPower(cell) > 0) return true;

  for (const [dx, dy, dz] of DIR_ORDER) {
    let n;
    try { n = dim.getBlock({ x: loc.x + dx, y: loc.y + dy, z: loc.z + dz }); } catch { continue; }
    if (!n) continue;
    const p = getPower(n);
    if (p <= 0) continue;

    if (!softHard) return true;

    // Direct component / dust adjacent → OK (soft or hard into the air cell)
    if (isDust(n) || isHardPowerSource(n) || n.typeId?.includes("torch")) return true;

    // Solid neighbor: only if HARD powered (repeater/block into it), not merely soft from dust
    if (isSolidConductor(n)) {
      if (isStronglyPoweredSolid(n)) return true;
    }
  }
  return false;
}

function isStronglyPoweredSolid(block) {
  // Hard-powered if a hard source points into it or redstone block adjacent etc.
  for (const [dx, dy, dz] of DIR_ORDER) {
    let n;
    try { n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz }); } catch { continue; }
    if (!n) continue;
    if (isHardPowerSource(n) && getPower(n) > 0) return true;
    if (n.typeId === "minecraft:redstone_block") return true;
  }
  // Or the solid itself reports power > 0 while not being dust
  return getPower(block) > 0 && !isDust(block);
}

function isQuasiPowered(block) {
  const softHard = cfg("softHard") !== false;
  const above = {
    x: block.location.x,
    y: block.location.y + 1,
    z: block.location.z,
  };
  return cellWouldBeActivated(block.dimension, above, softHard);
}

// ===================== piston state =====================
function facingOf(block) {
  try { return block.permutation?.getState?.("facing_direction") ?? 1; } catch { return 1; }
}
function isExtendedPiston(block) {
  try {
    for (const k of ["is_expanded", "expanded", "extended"]) {
      const v = block.permutation?.getState?.(k);
      if (v === true || v === 1) return true;
    }
  } catch {}
  try {
    const d = FACE_DELTA[facingOf(block)] || [0, 1, 0];
    const arm = block.dimension.getBlock({
      x: block.location.x + d[0],
      y: block.location.y + d[1],
      z: block.location.z + d[2],
    });
    if (arm?.typeId?.includes("piston_arm") || arm?.typeId?.includes("extension")) return true;
  } catch {}
  return false;
}

// ===================== CHEESE 1/3: force pulse + 0-tick =====================
const pulsing = new Set();
function keyOf(b) {
  const l = b.location;
  return `${b.dimension.id}|${Math.floor(l.x)}|${Math.floor(l.y)}|${Math.floor(l.z)}`;
}

function findAirNeighbor(block) {
  const { x, y, z } = block.location;
  const prefer = FACE_OPP[facingOf(block)] || [0, -1, 0];
  const order = [prefer, ...DIR_ORDER];
  for (const [dx, dy, dz] of order) {
    try {
      const b = block.dimension.getBlock({ x: x + dx, y: y + dy, z: z + dz });
      if (b && (b.isAir || b.isLiquid)) return b;
    } catch {}
  }
  return undefined;
}

/**
 * Pulse a redstone block beside the component.
 * zeroTick: schedule remove on the same script tick chain (runTimeout 0 / 1)
 * so Bedrock sees a vanishingly short pulse — cheese for 0-tick style behavior.
 */
function forceActivate(block, opts = {}) {
  const k = keyOf(block);
  if (pulsing.has(k)) return false;
  const target = findAirNeighbor(block);
  if (!target) return false;

  let prevType = "minecraft:air";
  let prevPerm = null;
  try {
    prevType = target.typeId;
    prevPerm = target.permutation;
  } catch {}

  pulsing.add(k);
  try { target.setType("minecraft:redstone_block"); } catch {
    pulsing.delete(k);
    return false;
  }

  const zero = opts.zeroTick || cfg("zeroTick");
  const ticks = zero ? 1 : Math.max(1, Math.min(10, Number(cfg("pulseTicks")) || 1));

  const restore = () => {
    try {
      const b = block.dimension.getBlock(target.location);
      if (!b) return;
      if (prevPerm) {
        try { b.setPermutation(prevPerm); } catch { b.setType(prevType); }
      } else b.setType(prevType === "minecraft:water" ? "minecraft:air" : prevType);
    } catch {}
    pulsing.delete(k);
  };

  if (zero) {
    // Same-tick / next-tick cheese: double-run restore attempts
    system.run(restore);
    system.runTimeout(restore, 1);
  } else {
    system.runTimeout(restore, ticks);
  }
  return true;
}

// ===================== CHEESE 5: piston timing queue =====================
/** pending extends: key -> { blockRef data, atTick } */
const extendQueue = new Map();
const retractWatch = new Map(); // sticky short-pulse drop cheese

function queueJavaExtend(block) {
  if (!cfg("pistonTiming")) {
    forceActivate(block, { zeroTick: cfg("zeroTick") });
    return;
  }
  // Java: piston takes ~1-2 game ticks to start extending — keep it tight
  const k = keyOf(block);
  if (extendQueue.has(k) || pulsing.has(k)) return;
  const at = system.currentTick + 1;
  extendQueue.set(k, {
    dimId: block.dimension.id,
    x: Math.floor(block.location.x),
    y: Math.floor(block.location.y),
    z: Math.floor(block.location.z),
    at,
  });
}

system.runInterval(() => {
  try {
    if (!cfg("enabled") || !cfg("pistonTiming")) return;
    const now = system.currentTick;
    for (const [k, job] of extendQueue) {
      if (now < job.at) continue;
      extendQueue.delete(k);
      try {
        const dim = world.getDimension(job.dimId);
        const b = dim.getBlock({ x: job.x, y: job.y, z: job.z });
        if (!b || !PISTONS.has(b.typeId)) continue;
        if (isExtendedPiston(b)) continue;
        if (!isQuasiPowered(b) && getPower(b) <= 0) continue;
        forceActivate(b, { zeroTick: false });
      } catch {}
    }
  } catch {}
}, 1);

// ===================== CHEESE 6: sticky short-pulse block drop =====================
/**
 * Track sticky pistons that were powered then unpowered within a short window.
 * On Java, a 1-tick pulse can drop the block (not pull it back). We approximate by
 * detecting extended sticky + power lost quickly, then breaking the block in front
 * if still attached-looking.
 */
function noteStickyPowered(block) {
  if (!cfg("blockDrop")) return;
  if (block.typeId !== "minecraft:sticky_piston") return;
  const k = keyOf(block);
  retractWatch.set(k, {
    dimId: block.dimension.id,
    x: Math.floor(block.location.x),
    y: Math.floor(block.location.y),
    z: Math.floor(block.location.z),
    face: facingOf(block),
    tick: system.currentTick,
    wasQC: isQuasiPowered(block) || getPower(block) > 0,
  });
}

system.runInterval(() => {
  if (!cfg("enabled") || !cfg("blockDrop")) return;
  const now = system.currentTick;
  for (const [k, w] of retractWatch) {
    if (now - w.tick < 2) continue; // wait at least 2 ticks
    if (now - w.tick > 6) { retractWatch.delete(k); continue; }
    try {
      const dim = world.getDimension(w.dimId);
      const b = dim.getBlock({ x: w.x, y: w.y, z: w.z });
      if (!b || b.typeId !== "minecraft:sticky_piston") { retractWatch.delete(k); continue; }
      const powered = isQuasiPowered(b) || getPower(b) > 0;
      if (powered) { w.tick = now; continue; } // still powered
      // short pulse ended — try drop block in front of face
      const d = FACE_DELTA[w.face] || [0, 1, 0];
      // block two steps out is the pushed block location when extended
      const front = dim.getBlock({ x: w.x + d[0] * 2, y: w.y + d[1] * 2, z: w.z + d[2] * 2 });
      const arm = dim.getBlock({ x: w.x + d[0], y: w.y + d[1], z: w.z + d[2] });
      if (front && !front.isAir && !front.isLiquid && !front.typeId.includes("piston")) {
        // Only cheese-drop if arm still out or was recently extended
        if (arm?.typeId?.includes("piston") || isExtendedPiston(b) || now - w.tick <= 4) {
          const typeId = front.typeId;
          try {
            front.setType("minecraft:air");
            dim.spawnItem(new ItemStack(typeId, 1), {
              x: front.location.x + 0.5,
              y: front.location.y + 0.5,
              z: front.location.z + 0.5,
            });
          } catch {}
        }
      }
    } catch {}
    retractWatch.delete(k);
  }
}, 1);

// ===================== CHEESE 4: dust decay pass =====================
/**
 * Walk dust near players and enforce level = max(neighbor sources)-1 style falloff.
 * Won't beat the engine, but can correct some illegal high-signal islands when we can write state.
 */
function dustLevel(block) {
  try {
    const s = block.permutation?.getState?.("redstone_signal");
    if (typeof s === "number") return s;
  } catch {}
  return getPower(block);
}

function setDustLevel(block, level) {
  level = Math.max(0, Math.min(15, level | 0));
  try {
    const perm = block.permutation;
    const next = perm.withState("redstone_signal", level);
    block.setPermutation(next);
    return true;
  } catch {
    try {
      // Older state name
      const next = block.permutation.withState("redstone_signal", level);
      block.setPermutation(next);
      return true;
    } catch { return false; }
  }
}

function dustPassAround(player, radius) {
  if (!cfg("dustFix")) return;
  const dim = player.dimension;
  const { x, y, z } = player.location;
  const r = Math.min(12, radius); // keep cheap
  // Multi-iteration relaxation in fixed DIR_ORDER (cheese for update order)
  for (let iter = 0; iter < 2; iter++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          let b;
          try { b = dim.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y) + dy, z: Math.floor(z) + dz }); } catch { continue; }
          if (!b || !isDust(b)) continue;

          let maxIn = 0;
          for (const [ox, oy, oz] of DIR_ORDER) {
            let n;
            try { n = dim.getBlock({ x: b.location.x + ox, y: b.location.y + oy, z: b.location.z + oz }); } catch { continue; }
            if (!n) continue;
            if (isDust(n)) maxIn = Math.max(maxIn, dustLevel(n));
            else if (isHardPowerSource(n) || n.typeId === "minecraft:redstone_block" || n.typeId?.includes("torch")) {
              maxIn = Math.max(maxIn, getPower(n));
            } else if (isStronglyPoweredSolid(n)) {
              maxIn = Math.max(maxIn, 15);
            }
          }
          const want = maxIn <= 0 ? 0 : maxIn - 1;
          const cur = dustLevel(b);
          // Only lower illegal high values (don't fight the engine upward every tick)
          if (cur > want + 1 && cur > 0) {
            setDustLevel(b, want);
          }
        }
      }
    }
  }
}

// ===================== main QC process =====================
function processQC(block) {
  const id = block.typeId;
  const isP = cfg("qcPistons") !== false && PISTONS.has(id);
  const isD = cfg("qcDispense") !== false && DISPENSE.has(id);
  if (!isP && !isD) return;

  if (isP) {
    if (isExtendedPiston(block)) {
      noteStickyPowered(block);
      return;
    }
    if (!isQuasiPowered(block)) return;
    noteStickyPowered(block);
    queueJavaExtend(block);
    return;
  }

  // dispensers / droppers — pulse when QC
  if (isD && isQuasiPowered(block)) {
    forceActivate(block, { zeroTick: cfg("zeroTick") });
  }
}

function scanAround(entity, radius) {
  const dim = entity.dimension;
  const x = Math.floor(entity.location.x);
  const y = Math.floor(entity.location.y);
  const z = Math.floor(entity.location.z);
  const r = Math.max(6, Math.min(32, Number(radius) || 20));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        let b;
        try { b = dim.getBlock({ x: x + dx, y: y + dy, z: z + dz }); } catch { continue; }
        if (!b) continue;
        const id = b.typeId;
        if (!PISTONS.has(id) && !DISPENSE.has(id)) continue;
        processQC(b);
      }
    }
  }
}

// ===================== scheduling =====================
let scanDue = false;
function requestScan() { scanDue = true; }

let scanTick = 0;
system.runInterval(() => {
  if (cfg("enabled") === false) return;
  scanTick++;
  // Responsive: scan every tick if due, otherwise every 2 ticks
  if (!scanDue && scanTick % 2 !== 0) return;
  if (cfg("budMode") && !scanDue) return;
  scanDue = false;
  const r = Math.min(12, cfg("radius"));
  for (const p of world.getPlayers()) {
    try { scanAround(p, r); } catch {}
  }
}, 1);

// denser dust pass
system.runInterval(() => {
  if (!cfg("enabled") || !cfg("dustFix")) return;
  for (const p of world.getPlayers()) {
    try { dustPassAround(p, 8); } catch {}
  }
}, 10);

for (const ev of [
  "blockPlace", "blockBreak", "buttonPush", "leverAction",
  "pressurePlatePush", "tripWireTrip", "projectileHitBlock",
]) {
  try {
    const signal = world.afterEvents[ev];
    if (signal?.subscribe) signal.subscribe(() => requestScan());
  } catch {}
}

// ===================== UI / commands =====================
function statusLines() {
  return [
    `§6[Java Redstone]§r enabled=§f${cfg("enabled")}`,
    `§7QC pistons=§f${cfg("qcPistons")} §7dispense=§f${cfg("qcDispense")} §7BUD=§f${cfg("budMode")}`,
    `§7soft/hard=§f${cfg("softHard")} §70-tick=§f${cfg("zeroTick")} §7dust=§f${cfg("dustFix")}`,
    `§7pistonTiming=§f${cfg("pistonTiming")} §7blockDrop=§f${cfg("blockDrop")}`,
    `§7radius=§f${cfg("radius")} §7pulse=§f${cfg("pulseTicks")}t`,
  ];
}

function handle(player, raw) {
  const parts = String(raw || "status").trim().toLowerCase().split(/\s+/);
  const c = parts[0];
  const toggle = (key) => { setCfg(key, !cfg(key)); player.sendMessage(`§6[JR]§r ${key}=§f${cfg(key)}`); };

  if (c === "toggle" || c === "on" || c === "off") {
    const n = c === "on" ? true : c === "off" ? false : !cfg("enabled");
    setCfg("enabled", n);
    player.sendMessage(`§6[JR]§r ${n ? "§aON" : "§cOFF"}`);
    return;
  }
  if (c === "bud") return toggle("budMode");
  if (c === "pistons") return toggle("qcPistons");
  if (c === "dispense") return toggle("qcDispense");
  if (c === "softhard" || c === "soft") return toggle("softHard");
  if (c === "0tick" || c === "zerotick") return toggle("zeroTick");
  if (c === "dust") return toggle("dustFix");
  if (c === "timing") return toggle("pistonTiming");
  if (c === "drop") return toggle("blockDrop");
  if (c === "radius" && parts[1]) {
    setCfg("radius", Math.max(6, Math.min(32, parseInt(parts[1], 10) || 20)));
    player.sendMessage(`§6[JR]§r radius=§f${cfg("radius")}`);
    return;
  }
  if (c === "allon") {
    for (const k of Object.keys(DEFAULTS)) if (typeof DEFAULTS[k] === "boolean") setCfg(k, true);
    player.sendMessage("§6[JR]§r all features §aON");
    return;
  }
  if (c === "help" || c === "?") {
    player.sendMessage([
      "§6=== Java Redstone (cheese port) ===",
      "§eQC§7 — power space above piston/dispenser/dropper",
      "§eSoft/Hard§7 — dust vs repeater-style QC checks",
      "§e0-tick§7 — same-tick pulse remove cheese",
      "§eDust§7 — force decay pass near players",
      "§eTiming§7 — delayed piston extend queue",
      "§eDrop§7 — sticky short-pulse block-drop attempt",
      "§eTorch/Rails/Wire/Retract§7 — see BP main pack for full set",
      "§f!jr toggle|bud|softhard|0tick|dust|timing|drop|pistons|dispense",
      "§f!jr radius 20§7  §f!jr allon",
      "§8Still approximate — not real Java engine redstone.",
    ].join("\n"));
    return;
  }
  player.sendMessage(statusLines().join("\n"));
}

try {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (!String(ev.id || "").toLowerCase().startsWith("jr:")) return;
    const sub = String(ev.id).slice(3);
    const p = ev.sourceEntity;
    if (p?.typeId === "minecraft:player") handle(p, sub || "status");
  });
} catch {}

try {
  world.beforeEvents.chatSend.subscribe((ev) => {
    const m = String(ev.message || "").trim();
    if (!m.toLowerCase().startsWith("!jr")) return;
    ev.cancel = true;
    system.run(() => handle(ev.sender, m.slice(3).trim() || "status"));
  });
} catch {}

system.runInterval(() => {
  try { processObserverPulses(); } catch {}
  try { processRepeaters(); } catch {}
}, 1);

system.run(() => {
  loadDefaults();
  try {
    world.sendMessage("§6[Java Redstone]§r cheese port loaded — §f!jr help§7 for QC/0-tick/dust/timing/drop");
  } catch {}
});
