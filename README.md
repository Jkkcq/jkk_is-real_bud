# Minecraft Bedrock Addons

Pack names in the world UI:

- **Another java pvp addon** (`JavaPvP/`, behavior + resource, 10.3.54)
- **Another java redstone addon** (`JavaRedstone/`, behavior + resource, 1.22.4)

Both target Minecraft Bedrock 1.26.50+ (`@minecraft/server` 2.10.0). Enable the Beta APIs experiment if the world asks for it. Load each behavior pack together with its resource pack.

## Another java pvp addon (10.3.54)
Location: `JavaPvP/`

### Fixes
- `/jk:config` and the combat loop load again (removed a stray `}` that broke `config.js`)
- Entity-hurt combat handler parse error fixed (`hit.js` try/catch + `handleDamage` return)
- Personal config form now saves the correct control values (`shield_side_pose`, offhand swap, etc.)
- Custom shield raise delay now actually applies (was always 1 tick)
- Side shield pose reads `shield_side_pose`
- Fishing item retrieval + true armor durability honor live `cfg` values
- Offhand right-click now subscribes (`world` / `system` are imported in `offhandRightClick.js`)
- Relative script imports include `.js`, which Bedrock's module loader requires

### New / restored Java parity
- Ender pearl cooldown (default 20 ticks)
- Hit interrupts eating / charging use
- Crit coyote air window
- Egg / snowball throw spacing
- Config menu: Combat → Java Parity

Features:
- Java-style combat mechanics, offhand, mace techniques
- Saturation shower HUD, emote hotbar swap
- CPvP / advanced sword / redstone-adjacent combat extras

## Another java redstone addon (v1.22.4)
Location: `JavaRedstone/`

### Fixes / wiring
- Piston timing `runInterval` try/catch parse break fixed
- Features that existed as dead helpers are now scanned/wired:
  torch burnout, rail updates, instant wire, sticky double-retract,
  comparator subtract pass, copper bulb checks, note-block observer pulse
- `!jr help` / `/jr:redstone help` / status updated for the wired feature set
- Redstone scans are tick-budgeted so a full-volume block walk cannot hang the script watchdog
- Sticky piston delay stores coordinates and re-reads the block when the delay ends
- New toggles: `!jr torch|rails|wire|retract|bulb|sticky|pushlimit|note`

### Core cheese still included
- Quasi-connectivity, soft/hard power, 0-tick pulses
- Dust decay, piston timing, sticky short-pulse drop

## Usage
Each addon has:
- `BP/` - Behavior pack (scripts, manifests)
- `RP/` - Resource pack (textures, manifests)

In-game:
- Another java pvp addon: `/jk:config world` or `/jk:config personal`
- Another java redstone addon: `/jr:redstone help` or `/scriptevent jr:help` (`!jr help` still works where chat events exist)
