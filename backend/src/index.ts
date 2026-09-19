import { createApp } from './app';
import { loadConfig, type AppConfig } from './config';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(`\n✖ ${(error as Error).message}\n`);
  process.exit(1);
}

const app = createApp(config);
app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (model: ${config.model})`);
});
