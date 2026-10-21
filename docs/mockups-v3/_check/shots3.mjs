import { start, stop, open, shot, click, errors } from './lib.mjs';
await start();
try {
  await open('nobare=1&device=iphone', 1280, 960); await shot('desktop-iphone');
  await open('nobare=1&device=android&look=dark&theme=pink', 1280, 960, 'dark'); await shot('desktop-android-dark-pink');
  await open('nobare=1', 390, 844); await shot('real-phone-390');
} finally { console.log('ERRORS:', errors.length ? errors : 'none'); stop(); }
