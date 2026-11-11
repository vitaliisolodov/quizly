// Set to the HTTPS address of the deployed relay. Leave empty to use PeerJS on GitHub Pages.
const deployedRelay = '';
const localPreview = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8080';
window.QUIZLY_RELAY_URL = localPreview ? `http://${location.hostname}:3100` : deployedRelay;
