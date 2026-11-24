// Talents: the choices a level brings. Each level offers three; the hero takes
// one. A talent is a row here (a name, what it says, how many times it can be
// taken) and one or two lines where its effect lives: passive ones in
// stats.js `derive`, skill ones beside the skill in data/skills.js. `skill`
// names the skill a talent changes, so it is only offered once that skill is
// unlocked. To add one: a row here, and the line that reads its rank.

import { SKILLS } from './skills.js';

export const TALENTS = {
  wide: { name: 'Wide Arc', skill: 'cleave', max: 2, desc: 'Cleave reaches a fifth farther.' },
  rend: { name: 'Rending Cut', skill: 'cleave', max: 2, desc: 'Cleave hits a quarter harder.' },
  twin: { name: 'Twin Embers', skill: 'bolt', max: 1, desc: 'Ember Bolt throws two motes, a little apart.' },
  tinder: { name: 'Quick Tinder', skill: 'bolt', max: 2, desc: 'Ember Bolt is ready a fifth sooner.' },
  stride: { name: 'Long Stride', skill: 'step', max: 2, desc: 'Gale Step carries you a quarter farther.' },
  gust: { name: 'Parting Gust', skill: 'step', max: 1, desc: 'Gale Step cuts whatever it passes through.' },
  roots: { name: 'Deep Roots', skill: 'mend', max: 2, desc: 'Mend restores a third more.' },
  hide: { name: 'Thick Hide', max: 3, desc: 'Blows hurt 8% less.' },
  keen: { name: 'Keen Eye', max: 3, desc: 'Six more blows in a hundred are critical.' },
  feet: { name: 'Light Feet', max: 2, desc: 'You run 6% faster.' },
  thrift: { name: 'Thrift', max: 2, desc: 'Skills cost 12% less focus.' },
  forage: { name: 'Forager', max: 2, desc: 'Creatures drop a quarter more glint.' },
  second: { name: 'Second Wind', max: 2, desc: 'A killing blow gives back 5 focus.' },
};

/** How many times the journey has taken a talent. */
export const rank = (sheet, id) => (sheet.talents && sheet.talents[id]) || 0;

/** Three talents to choose from (fewer when few are left), or null when none are. */
export function rollOffer(sheet) {
  const open = Object.keys(TALENTS).filter((id) => {
    const t = TALENTS[id];
    if (rank(sheet, id) >= t.max) return false;
    return !t.skill || sheet.level >= SKILLS.find((s) => s.id === t.skill).unlock;
  });
  for (let i = open.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [open[i], open[j]] = [open[j], open[i]]; }
  return open.length ? open.slice(0, 3) : null;
}

/** Takes one of the three on offer. Returns true if it was there to take. */
export function takeTalent(sheet, id) {
  if (!sheet.picks || !sheet.offer || !sheet.offer.includes(id)) return false;
  sheet.talents = sheet.talents || {};
  sheet.talents[id] = rank(sheet, id) + 1;
  sheet.picks--;
  sheet.offer = sheet.picks > 0 ? rollOffer(sheet) : null;
  if (!sheet.offer) sheet.picks = 0;
  return true;
}
