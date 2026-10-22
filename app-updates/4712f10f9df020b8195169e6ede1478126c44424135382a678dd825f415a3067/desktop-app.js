(() => {
  const sections = {
    controls: ['mappingTitle', 'calibrationTitle', 'gyroTitle'],
    vibration: ['vibrationTitle'],
    presets: ['presetTitle', 'controllerPresetTitle'],
    automation: ['turboTitle', 'macroTitle']
  };
  if (document.querySelector('#appSettingsTitle')) sections.appsettings = ['appSettingsTitle'];
  const links = [...document.querySelectorAll('[data-app-view]')];
  const cards = [...document.querySelectorAll('.dashboard .card')];
  function showView() {
    const requested = location.hash.slice(1);
    const view = Object.hasOwn(sections, requested) ? requested : 'controls';
    for (const card of cards) {
      card.classList.toggle('app-section-hidden', !sections[view].includes(card.getAttribute('aria-labelledby')));
    }
    for (const link of links) {
      if (link.dataset.appView === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.body.dataset.appView = view;
    document.title = `${links.find(link => link.dataset.appView === view).textContent.trim()} · NS2 Pro`;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showView);
  showView();
})();
