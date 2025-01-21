import "./database.js";

// Store the global auto-save state
let autoSaveEnabled = true;

// Initialize database instance
let db = null;

// Wait for database to be initialized
async function initializeDatabase() {
    while (!window.db) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    db = window.db;
}

// Initialize database when background script starts
initializeDatabase().catch(console.error);

// Add message handlers for database operations
browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (!db) {
        return { error: "Database not initialized" };
    }

    try {
        switch (request.action) {
            case "getHistoryByAddress":
                console.log("In getHistoryByAddress in background")
                const history = await db.getHistoryByAddress(request.address);
                return { data: history };

            case "analyzePriceHistory":
                console.log("In analyzePriceHistory in background")
                const analysis = await db.analyzePriceHistory(request.address);
                return { data: analysis };

            case "getAllEntries":
                console.log("In getAllEntries in background")
                const entries = await db.getAll();
                return { data: entries };

            case "saveEntry":
                console.log("In saveEntry in background")
                await db.save(request.data, request.data.preserveTimestamps);
                return { success: true };
            
            case "updateEntry":
                console.log("In updateEntry in background")
                await db.update(request.data);
                return { success: true };
        
            case "deleteEntry":
                console.log("In deleteEntry in background")
                await db.delete(request.address);
                return { success: true };

            case "clearDB":
                console.log("In clearDB in background")
                await db.clear();
                return { success: true };

            default:
                return { error: "Unknown action" };
        }
    } catch (error) {
        console.error('Database operation error:', error);
        return { error: error.message };
    }
});

// Load initial state
browser.storage.local.get('autoSave').then(result => {
    autoSaveEnabled = result.autoSave || false;
    updateIcon(autoSaveEnabled);  // Add this line
});

// Handle browser action (icon) clicks
browser.browserAction.onClicked.addListener((tab, clickData) => {
    // Check if any modifier key was pressed during click
    if (clickData.modifiers.length > 0) {
        // Open the data viewer page
        browser.tabs.create({
            url: browser.runtime.getURL("view-data.html")
        });
    } else {
        // Normal toggle behavior
        autoSaveEnabled = !autoSaveEnabled;
        
        // Save the new state
        browser.storage.local.set({
            autoSave: autoSaveEnabled
        });
        
        // Update icon
        updateIcon(autoSaveEnabled);
        
        // Broadcast the new state to all tabs
        broadcastAutoSaveState();
    }
});

// Listen for new tab creation
browser.tabs.onCreated.addListener((tab) => {
    // Wait for the tab to finish loading
    browser.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
            // Send current auto-save state to the new tab
            browser.tabs.sendMessage(tabId, {
                action: "setAutoSave",
                enabled: autoSaveEnabled
            }).catch(() => {
                // Ignore errors for tabs that don't have our content script
            });
            browser.tabs.onUpdated.removeListener(listener);
        }
    });
});

// Function to broadcast auto-save state to all tabs
async function broadcastAutoSaveState() {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, {
            action: "setAutoSave",
            enabled: autoSaveEnabled
        }).catch(() => {
            // Ignore errors for tabs that don't have our content script
        });
    }
}

function updateIcon(enabled) {
    browser.browserAction.setIcon({
        path: {
            "48": enabled ? "save.png" : "save-disabled.png",
            "96": enabled ? "save.png" : "save-disabled.png"
        }
    });
    
    browser.browserAction.setTitle({
        title: enabled ? "SaveAds (Enabled)" : "SaveAds (Disabled)"
    });
}
