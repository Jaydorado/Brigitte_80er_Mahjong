// Texte für Brigittes Mahjong. Hier dürfen alle Texte geändert werden.
// Reihenfolge der Hinweise = Level 1 bis 6.
export const clues = [
  'Familie',
  '9h 31 selzthal umsteigen',
  'Grün/weiß',
  'Klaus wildbolz/Albert fortell',
  'Bezirkschulinspektor',
  '12.2. 1989',
] as const;

export const welcome = {
  title: 'Alles Gute zum 80. Geburtstag, liebe Brigitte!',
  message:
    'Wir haben dir ein kleines Spiel gebaut, ganz für dich allein. In jedem Level versteckt sich unter den Steinen ein Hinweis auf dein Geschenk. Nimm dir Zeit, es gibt keine Eile. Viel Freude beim Rätseln!',
};

export const finale =
  'Du hast alle sechs Hinweise gefunden! Errätst du, was wir gemeinsam vorhaben? Wir freuen uns schon riesig darauf.';
export const credit = 'In Liebe, deine Familie';

// Auf true setzen, sobald die Familie die Texte freigegeben hat. Erst dann bekommt Brigitte den Link.
export const TEXTS_FINAL = false;
