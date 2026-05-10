/**
 * Background Service Worker for TRCVASTIAN
 * Handles background tasks, messaging, and alarms
 */

console.log('[Background] Service Worker initialized');

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CV_EXTRACTED':
      handleCVExtracted(message.data, sender);
      sendResponse({ success: true });
      break;

    case 'JOB_DETECTED':
      handleJobDetected(message.data, sender);
      sendResponse({ success: true });
      break;

    case 'LINKEDIN_FORM_FOUND':
      handleLinkedInForm(message.data, sender);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async response
});

// Install/Update handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Background] Extension installed');
  }
});

async function handleCVExtracted(data: any, sender: chrome.runtime.MessageSender) {
  console.log('[Background] CV extracted:', data);
  notifyPopup({
    type: 'CV_EXTRACTED',
    data,
  });
}

async function handleJobDetected(data: any, sender: chrome.runtime.MessageSender) {
  console.log('[Background] Job detected:', data);
  const settings = await chrome.storage.local.get('trcvastian_settings');
  if (settings.trcvastian_settings?.autoApply && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'AUTO_APPLY',
      data,
    });
  }
}

async function handleLinkedInForm(data: any, sender: chrome.runtime.MessageSender) {
  console.log('[Background] LinkedIn form found:', data);
  if (sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'FILL_FORM',
      data,
    });
  }
}

function notifyPopup(message: any) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup not open, ignore
  });
}

export default {};

