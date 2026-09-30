import './ui/styles.css';
import { levels } from './levels/levels';
import { loadSave, writeSave } from './progress/save';
import { mountLevel } from './ui/levelScreen';

const root = document.querySelector<HTMLElement>('#app')!;

// Temporary dev route until the screen router lands: `?level=N` mounts level N directly.
const devLevel = levels.find((l) => l.id === Number(new URLSearchParams(location.search).get('level')));
if (devLevel) {
  mountLevel(root, devLevel, {
    save: loadSave(localStorage),
    persist: (s) => writeSave(localStorage, s),
    onExit: () => location.assign(location.pathname),
    onWon: (id) => console.info(`[level ${id}] won`),
  });
} else {
  root.innerHTML = '<h1>Brigittes Mahjong</h1>';
}
