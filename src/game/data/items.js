// Item definitions: pure data. kind: 'coin' (goes straight to the purse),
// 'use' (consumable with an effect id handled in systems/inventory.js),
// 'mat' (sellable material), 'charm' (equippable, adds stats).
// `drop` picks the loot model variant: 0 coins, 1 pouch, 2 flask, 3 gem. `color` is a pencil (0-255).

export const ITEMS = {
  glint: { name: 'Glint', kind: 'coin', drop: 0, color: [244, 190, 62] },

  tonic: { name: 'Red Tonic', kind: 'use', effect: 'heal', power: 0.45, value: 12, price: 26, drop: 2, color: [198, 62, 58], desc: 'Restores 45% of your health.' },
  draught: { name: 'Blue Draught', kind: 'use', effect: 'focus', power: 0.6, value: 14, price: 32, drop: 2, color: [84, 108, 156], desc: 'Restores 60% of your focus.' },

  sprout_leaf: { name: 'Sprout Leaf', kind: 'mat', value: 4, drop: 1, color: [116, 168, 90], desc: 'Still a little wriggly.' },
  puff_spore: { name: 'Puff Spore', kind: 'mat', value: 6, drop: 1, color: [224, 92, 70], desc: 'Do not sneeze near it.' },
  hog_bristle: { name: 'Hog Bristle', kind: 'mat', value: 9, drop: 1, color: [176, 128, 84], desc: 'Stiff as a nail.' },
  wisp_ember: { name: 'Wisp Ember', kind: 'mat', value: 12, drop: 3, color: [136, 180, 216], desc: 'Cool to the touch.' },
  crag_shard: { name: 'Crag Shard', kind: 'mat', value: 18, drop: 3, color: [150, 142, 132], desc: 'Hums when struck.' },
  snap_claw: { name: 'Snap Claw', kind: 'mat', value: 8, drop: 1, color: [226, 176, 52], desc: 'Mind your fingers.' },

  charm_might: { name: 'Boar-Tooth Charm', kind: 'charm', stats: { might: 3 }, value: 60, drop: 3, color: [240, 158, 74], desc: '+3 Might while worn.' },
  charm_grace: { name: 'Tideglass Charm', kind: 'charm', stats: { grace: 3 }, value: 60, drop: 3, color: [70, 150, 150], desc: '+3 Grace while worn.' },
  charm_vigor: { name: 'Heartwood Charm', kind: 'charm', stats: { vigor: 3 }, value: 60, drop: 3, color: [224, 112, 128], desc: '+3 Vigor while worn.' },
  charm_mind: { name: 'Lanternseed Charm', kind: 'charm', stats: { mind: 3 }, value: 60, drop: 3, color: [84, 108, 156], desc: '+3 Mind while worn.' },
};

export const SHOP_STOCK = ['tonic', 'draught'];

// What a trader will make from what you carry: the thing, what it takes, and the fee.
export const RECIPES = [
  { id: 'tonic', needs: { sprout_leaf: 3 }, glint: 4 },
  { id: 'draught', needs: { wisp_ember: 2 }, glint: 6 },
  { id: 'charm_might', needs: { hog_bristle: 6, snap_claw: 3 }, glint: 40 },
  { id: 'charm_vigor', needs: { puff_spore: 6, crag_shard: 3 }, glint: 40 },
  { id: 'charm_grace', needs: { snap_claw: 5, sprout_leaf: 5 }, glint: 40 },
  { id: 'charm_mind', needs: { wisp_ember: 5, puff_spore: 4 }, glint: 40 },
];
