// One-off task runner, for testing and manual fills.
//   npm run agent -- collect enrich launches weather numbers intake feed doctor
// For continuous operation use `npm run runner` instead.
import { runCollect } from './collect';
import { runEnrich, expireStaleReview, pendingCount } from './enrich';
import { runLaunches } from './launches';
import { runWeather } from './weather';
import { runNumbers } from './numbers';
import { processIntake, queuedCount } from './intake';
import { claudeAvailable } from './cc';
import { buildFeed } from '../../lib/feed';

const tasks = process.argv.slice(2).filter(Boolean);
const list = tasks.length ? tasks : ['launches', 'weather', 'collect', 'enrich'];

for (const t of list) {
  switch (t) {
    case 'collect': await runCollect(); break;
    case 'enrich': await runEnrich(); break;
    case 'launches': await runLaunches(); break;
    case 'weather': await runWeather(); break;
    case 'numbers': await runNumbers(); break;
    case 'intake': console.log(`handled ${await processIntake()} message(s)`); break;
    case 'expire': await expireStaleReview(); break;
    case 'feed': console.log(JSON.stringify(await buildFeed(), null, 2)); break;
    case 'doctor': {
      const version = await claudeAvailable();
      console.log(`claude CLI:        ${version ?? 'NOT FOUND (install Claude Code, or set CLAUDE_BIN)'}`);
      console.log(`model:             ${process.env.CLAUDE_MODEL || 'sonnet'}`);
      console.log(`SUPABASE_URL:      ${process.env.SUPABASE_URL ? 'set' : 'MISSING'}`);
      console.log(`service role key:  ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING'}`);
      console.log(`telegram token:    ${process.env.TELEGRAM_BOT_TOKEN ? 'set' : 'missing (optional)'}`);
      console.log(`awaiting enrich:   ${await pendingCount()}`);
      console.log(`queued intake:     ${await queuedCount()}`);
      break;
    }
    default: console.error(`unknown task: ${t}`); process.exitCode = 1;
  }
}
