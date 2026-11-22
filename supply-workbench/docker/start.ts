import { main } from '../apps/server/dist/main.js';

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
