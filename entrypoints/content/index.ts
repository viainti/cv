/**
 * @wxt-config {"matches":["https://*.linkedin.com/*","https://*.indeed.com/*"],"run_at":"document_end"}
 */

/**
 * Content Script for TRCVASTIAN
 * Injected into LinkedIn and Indeed pages
 */

console.log('[Content] Script loaded, ready for injection');

// This file will be injected by the browser extension
// Runtime initialization happens when the script is injected into a page

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Received message:', message.type);

  switch (message.type) {
    case 'AUTO_APPLY':
      handleAutoApply(message.data);
      sendResponse({ success: true });
      break;

    case 'FILL_FORM':
      handleFillForm(message.data);
      sendResponse({ success: true });
      break;

    case 'EXTRACT_PAGE_DATA':
      const data = extractPageData();
      sendResponse(data);
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true;
});

function handleAutoApply(data: any) {
  const form = document.querySelector('form');
  if (form) {
    (form as HTMLFormElement).submit();
  }
}

function handleFillForm(data: any) {
  console.log('[Content] Filling form with data');
  // Form filling logic will be implemented in the UI layer
}

function extractPageData() {
  return {
    url: window.location.href,
    platform: window.location.hostname.includes('linkedin') ? 'linkedin' : 'indeed',
    timestamp: Date.now(),
  };
}

export default {};
