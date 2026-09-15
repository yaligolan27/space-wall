// Usage: tsx agent/src/index.ts [osint] [launches] [weather] [numbers] [feed]   (default: launches weather osint)
import { runOsint } from './osint';
import { runLaunches } from './launches';
import { runWeather } from './weather';
import { runNumbers } from './numbers';
import { buildFeed } from '../../lib/feed';

const tasks = process.argv.slice(2).filter(Boolean);
const list = tasks.length ? tasks : ['launches', 'weather', 'osint'];
for (const t of list) {
  if (t === 'osint') await runOsint();
  else if (t === 'launches') await runLaunches();
  else if (t === 'weather') await runWeather();
  else if (t === 'numbers') await runNumbers();
  else if (t === 'feed') console.log(JSON.stringify(await buildFeed(), null, 2));
  else { console.error('unknown task', t); process.exitCode = 1; }
}
