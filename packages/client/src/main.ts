import { App } from './App';

const app = new App();

// Expose app instance globally for console access (dev/testing)
(window as unknown as Record<string, unknown>).app = app;
