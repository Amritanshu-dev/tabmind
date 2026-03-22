// Handles alarms and notifications in the background

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_ALARM') {
    const delayInMinutes = (msg.remindAt - Date.now()) / 60000;
    if (delayInMinutes > 0) {
      chrome.alarms.create(msg.id, { delayInMinutes });
      // Store context for the notification
      chrome.storage.local.get('tabmind_alarm_meta', (res) => {
        const meta = res.tabmind_alarm_meta || {};
        meta[msg.id] = { reason: msg.reason, url: msg.url };
        chrome.storage.local.set({ tabmind_alarm_meta: meta });
      });
    }
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  chrome.storage.local.get(['tabmind_tabs', 'tabmind_alarm_meta'], (res) => {
    const tabs = res.tabmind_tabs || [];
    const meta = res.tabmind_alarm_meta || {};
    const tab = tabs.find(t => t.id === alarm.name);
    const info = meta[alarm.name];

    if (tab && !tab.done && info) {
      const displayUrl = info.url.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 40);
      chrome.notifications.create(alarm.name, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '⏰ TabMind Reminder',
        message: `${displayUrl}\n"${info.reason}"`,
        buttons: [{ title: 'Open tab' }, { title: 'Dismiss' }],
        requireInteraction: true
      });
    }
  });
});

chrome.notifications.onButtonClicked.addListener((notifId, btnIndex) => {
  if (btnIndex === 0) {
    // Open tab
    chrome.storage.local.get('tabmind_tabs', (res) => {
      const tabs = res.tabmind_tabs || [];
      const tab = tabs.find(t => t.id === notifId);
      if (tab) chrome.tabs.create({ url: tab.url });
    });
  }
  chrome.notifications.clear(notifId);
});