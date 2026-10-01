// Texte für Brigittes Mahjong. Hier dürfen alle Texte geändert werden.
// Reihenfolge der Hinweise = Level 1 bis 8.
export const clues = [
  'Familie',
  'Reise',
  '9h 31 Selzthal umsteigen',
  'Grün/weiß',
  'Übernachten bei Klaus & Albert unmöglich',
  'Hertha verbindet',
  'Bezirkschulinspektor',
  '12.2.1989',
] as const;

export const welcome = {
  title: 'Alles Gute zum 80. Geburtstag!',
  // Zwei Absätze, getrennt durch eine Leerzeile (\n\n).
  message:
    'Jetzt kannst – oder besser gesagt: musst – du beweisen, wie geistig fit du auch mit 80 noch bist.\n\n' +
    'Jedes erfolgreich absolvierte Level eines dir wohlbekannten Spieles liefert dir einen Hinweis und bringt dich deinem Geschenk ein Stück näher.',
};

export const finale =
  'Du hast alle acht Hinweise gefunden! Errätst du, was wir gemeinsam vorhaben? Wir freuen uns schon riesig darauf.';
export const credit = 'In Liebe, deine Familie';

// Nach dem gelösten Rätsel, über dem Foto.
export const reveal = {
  title: 'Wir fahren nach Gmunden!',
  message: 'Wir freuen uns auf eine gemeinsame Zeit in Gmunden 😊',
};

// Auf true setzen, sobald die Familie die Texte freigegeben hat. Erst dann bekommt Brigitte den Link.
export const TEXTS_FINAL = false;
