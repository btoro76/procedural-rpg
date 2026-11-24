// Monster definitions: pure data. `archetype` names the shader model
// (gfx/archetypes), `colors` are three pencils (0-255). The land's rule for its
// beasts, taken from Valsera: a hide in one earthy pencil, a pale underside
// left as paper, and ONE mustard part (226,176,52), the part that hurts.
// To add a monster:
// add a row here, list it in a biome's `monsters`, and (if it needs a new
// shape) register an archetype.
//
// aggro = radius at which it attacks unprovoked (0 = peaceful until hit)
// loot rows: [itemId, chance, [min, max]]

export const MONSTERS = {
  sproutling: {
    name: 'Sproutling', archetype: 'sproutling', scale: 1.0, radius: 0.36, height: 0.95,
    hp: 26, atk: 5, speed: 2.5, range: 1.15, attackTime: 0.8, cooldown: 1.7, aggro: 0, xp: 9, stride: 2.0,
    colors: [[150, 178, 120], [116, 168, 90], [226, 176, 52]],        // sage body, leaf, mustard feet
    loot: [['glint', 1, [1, 4]], ['sprout_leaf', 0.55, [1, 2]], ['tonic', 0.07, [1, 1]]],
  },
  puffcap: {
    name: 'Puffcap', archetype: 'puffcap', scale: 1.05, radius: 0.4, height: 1.05,
    hp: 40, atk: 7, speed: 2.0, range: 1.2, attackTime: 0.9, cooldown: 1.9, aggro: 5.5, xp: 14, stride: 5.5,
    colors: [[224, 92, 70], [226, 176, 52], [248, 232, 190]],        // poppy cap, mustard rim, cream stem
    loot: [['glint', 1, [2, 6]], ['puff_spore', 0.5, [1, 2]], ['tonic', 0.08, [1, 1]], ['charm_vigor', 0.012, [1, 1]]],
  },
  bristlehog: {
    name: 'Bristlehog', archetype: 'bristlehog', scale: 1.1, radius: 0.48, height: 1.0,
    hp: 68, atk: 10, speed: 3.5, range: 1.35, attackTime: 0.7, cooldown: 1.8, aggro: 7.5, xp: 23, stride: 3.1,
    colors: [[74, 77, 94], [226, 176, 52], [226, 188, 130]],         // charcoal hide, mustard bristles and tusks, tan snout
    loot: [['glint', 1, [4, 9]], ['hog_bristle', 0.5, [1, 2]], ['tonic', 0.1, [1, 1]], ['charm_might', 0.015, [1, 1]]],
  },
  wisp: {
    name: 'Glimmerwisp', archetype: 'wisp', scale: 1.0, radius: 0.36, height: 1.45,
    hp: 32, atk: 9, speed: 3.0, range: 1.5, attackTime: 0.7, cooldown: 1.6, aggro: 7, xp: 18, stride: 1.0, glow: true,
    colors: [[136, 180, 216], [70, 150, 150], [226, 176, 52]],       // sky body, teal fins, mustard halo
    loot: [['glint', 1, [3, 8]], ['wisp_ember', 0.5, [1, 1]], ['draught', 0.1, [1, 1]], ['charm_mind', 0.015, [1, 1]]],
  },
  cragling: {
    name: 'Cragling', archetype: 'cragling', scale: 1.0, radius: 0.55, height: 1.5,
    hp: 125, atk: 15, speed: 1.9, range: 1.5, attackTime: 1.15, cooldown: 2.4, aggro: 6, xp: 40, stride: 5.0,
    colors: [[150, 142, 132], [226, 176, 52], [84, 108, 156]],       // stone, mustard fists
    loot: [['glint', 1, [8, 16]], ['crag_shard', 0.55, [1, 2]], ['tonic', 0.14, [1, 1]], ['charm_vigor', 0.03, [1, 1]]],
  },
  shellsnap: {
    name: 'Shellsnap', archetype: 'shellsnap', scale: 1.05, radius: 0.48, height: 0.75,
    hp: 50, atk: 8, speed: 2.9, range: 1.25, attackTime: 0.6, cooldown: 1.5, aggro: 5, xp: 17, stride: 2.2,
    colors: [[188, 84, 60], [226, 176, 52], [226, 188, 130]],        // brick shell, mustard claws, tan legs
    loot: [['glint', 1, [3, 7]], ['snap_claw', 0.5, [1, 1]], ['tonic', 0.08, [1, 1]], ['charm_grace', 0.015, [1, 1]]],
  },
};
