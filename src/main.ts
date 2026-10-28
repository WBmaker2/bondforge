import { App } from './app/App';
import { loadProgress } from './storage/progress';
import './ui/styles/index.css';

const root = document.getElementById('app');
if (root) {
  const app = new App(root, loadProgress());
  if (import.meta.hot) {
    import.meta.hot.dispose(() => app.dispose());
  }
}

if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      // Offline support is optional; the app still runs without a service worker.
    });
}
