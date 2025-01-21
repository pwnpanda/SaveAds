// Add at the top of the file
let showFavoritesOnly = false;

async function waitForDatabase() {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds maximum wait time

    while (!window.db && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.db) {
        throw new Error('Database failed to initialize after 5 seconds');
    }

    return window.db;
}

async function initializeDatabase() {
    try {
        const entriesDiv = document.getElementById('entries');
        entriesDiv.textContent = 'Initializing database...';

        // Wait for database to be available
        const db = await waitForDatabase();

        // Make sure database is initialized
        await db.init();

        // Once database is initialized, display the data
        await displayData();
    } catch (error) {
        entriesDiv.textContent = `Error initializing database: ${error.message}`;
    }
}

function createDeleteButton(address) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '&#128465;';
    deleteBtn.title = 'Delete entry';
    deleteBtn.onclick = async () => {
        if (confirm('Are you sure you want to delete this entry?')) {
            try {
                const response = await browser.runtime.sendMessage({
                    action: "deleteEntry",
                    address: address
                });

                if (response.error) {
                    throw new Error(response.error);
                }

                // Refresh the display after successful deletion
                displayData();
            } catch (error) {
                console.error('Error deleting entry:', error);
            }
        }
    };
    return deleteBtn;
}

async function displayData() {
    const entriesDiv = document.getElementById('entries');
    entriesDiv.textContent = 'Loading...';

    try {
        const response = await browser.runtime.sendMessage({
            action: "getAllEntries"
        });

        const favorites = await window.db.favorites.getFavorites();

        if (response.error) {
            throw new Error(response.error);
        }

        const entries = response.data;

        // Group entries by address
        const groupedEntries = {};
        entries.forEach(entry => {
            if (showFavoritesOnly && !favorites.includes(entry.address)) return;

            // Create array for this address if it doesn't exist
            if (!groupedEntries[entry.address]) {
                groupedEntries[entry.address] = [];
            }

            // Add current price point
            groupedEntries[entry.address].push({
                price: entry.price,
                timestamp: entry.timestamp
            });

            // Add historical price points if they exist
            if (entry.priceHistory && Array.isArray(entry.priceHistory)) {
                groupedEntries[entry.address].push(...entry.priceHistory);
            }


        });

        // Clear loading message
        while (entriesDiv.firstChild) {
            entriesDiv.removeChild(entriesDiv.firstChild);
        }

        // Display entries grouped by address
        for (const [address, pricePoints] of Object.entries(groupedEntries)) {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'entry';

            // Sort price points by timestamp
            pricePoints.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const latestEntry = entries.find(e => e.address === address);
            const isFavorite = favorites.includes(address);

            // Create main entry info
            const entryHeader = document.createElement('div');
            entryHeader.className = 'entry-header';

            const h2 = document.createElement('h2');
            h2.textContent = address;
            entryHeader.appendChild(h2);

            // 

            
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';

            const favoriteBtn = document.createElement('button');
            favoriteBtn.className = `favorite-btn ${isFavorite ? 'active' : ''}`;
            favoriteBtn.dataset.address = address;
            favoriteBtn.innerHTML = '&#9733;';
            buttonContainer.appendChild(favoriteBtn);

            const deleteBtn = createDeleteButton(address);
            buttonContainer.appendChild(deleteBtn);

            entryHeader.appendChild(buttonContainer);

            // Add all the entry information
            entryDiv.appendChild(entryHeader);
            entryDiv.appendChild(createInfoParagraph('Current Price', formatPrice(latestEntry.price)));
            entryDiv.appendChild(createInfoParagraph('Title', latestEntry.title));
            entryDiv.appendChild(createInfoParagraph('Link', latestEntry.link, true));
            entryDiv.appendChild(createInfoParagraph('Domain', latestEntry.domain));
            entryDiv.appendChild(createInfoParagraph('First Logged', new Date(latestEntry.timestamp).toLocaleString('nb-NO')));
            entryDiv.appendChild(createInfoParagraph('Last Updated', new Date(latestEntry.lastChecked).toLocaleString('nb-NO')));
            entryDiv.appendChild(createInfoParagraph('Note', latestEntry, false, true));

            // Add price history if there are multiple price points
            if (pricePoints.length > 1) {
                const historyDiv = document.createElement('div');
                historyDiv.className = 'price-history';
                const historyTitle = document.createElement('h3');
                historyTitle.textContent = 'Price History';
                historyDiv.appendChild(historyTitle);

                for (let i = 0; i < pricePoints.length - 1; i++) {
                    const current = pricePoints[i];
                    const previous = pricePoints[i + 1];
                    const priceDiff = current.price - previous.price;
                    const percentChange = ((priceDiff / previous.price) * 100).toFixed(1);

                    const changeDiv = document.createElement('div');
                    changeDiv.className = `price-change ${priceDiff >= 0 ? 'price-increase' : 'price-decrease'}`;
                    
                    changeDiv.appendChild(createTextElement(new Date(current.timestamp).toLocaleDateString('nb-NO')));
                    changeDiv.appendChild(document.createElement('br'));
                    changeDiv.appendChild(createTextElement(
                        `${formatPrice(previous.price)} -> ${formatPrice(current.price)}`
                    ));
                    changeDiv.appendChild(document.createElement('br'));
                    changeDiv.appendChild(createTextElement(
                        `Change: ${priceDiff >= 0 ? '+' : ''}${formatPrice(priceDiff)}, ${percentChange}%`
                    ));

                    historyDiv.appendChild(changeDiv);
                }

                entryDiv.appendChild(historyDiv);
            }

            entriesDiv.appendChild(entryDiv);
        }
        addFavoriteListeners();
    } catch (error) {
        entriesDiv.textContent = `Error loading data: ${error.message}`;
    }
}

// Helper function to create info paragraphs
function createInfoParagraph(label, value, isLink = false, isEditable = false) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}:`;
    p.appendChild(strong);
    
    if (isLink) {
        const a = document.createElement('a');
        a.href = value;
        a.textContent = ' View Ad';
        a.target = '_blank';
        p.appendChild(a);
    } else if (isEditable) {
        const textarea = document.createElement('textarea');
        textarea.value = value.note || '';
        textarea.rows = 3;
        textarea.style.width = '100%';
        textarea.style.marginTop = '5px';
        textarea.dataset.address = label === 'Note' ? value.address : '';

        textarea.addEventListener('change', async (e) => {
            try {
                console.log(`Storing new note for address: ${e.target.dataset.address}`)
                const response = await browser.runtime.sendMessage({
                    action: "updateEntry",
                    data: {
                        address: e.target.dataset.address,
                        note: e.target.value
                    }
                });
                
                if (response.error) {
                    throw new Error(response.error);
                }
            } catch (error) {
                console.error('Error updating note:', error);
            }
        });
        
        p.appendChild(textarea);
    } else {
        p.appendChild(document.createTextNode(` ${value}`));
    }
    
    return p;
}

// Helper function to create text elements
function createTextElement(text) {
    return document.createTextNode(text);
}

function addFavoriteListeners() {
    document.querySelectorAll('.favorite-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const address = e.target.dataset.address;
            try {
                const isFavorite = await window.db.favorites.toggleFavorite(address);
                e.target.classList.toggle('active', isFavorite);

                if (showFavoritesOnly) {
                    // If we're showing favorites only, refresh the display
                    // to remove unfavorited items immediately
                    displayData();
                }
            } catch (error) {
                console.error('Error toggling favorite:', error);
            }
        });
    });
}
function formatPrice(price) {
    return new Intl.NumberFormat('nb-NO', {
        style: 'currency',
        currency: 'NOK',
        maximumFractionDigits: 0
    }).format(price);
}

function refreshData() {
    displayData();
}

function exportData() {
    browser.runtime.sendMessage({ action: "getAllEntries" })
        .then(response => {
            if (response.error) {
                throw new Error(response.error);
            }
            const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `saveads-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Error exporting data:', error);
        });
}


function setupImportHandlers() {
    const modal = document.getElementById('importModal');
    const importButton = document.getElementById('importButton');
    const confirmButton = document.getElementById('confirmImport');
    const cancelButton = document.getElementById('cancelImport');
    const fileInput = document.getElementById('importFile');

    importButton.addEventListener('click', () => {
        modal.style.display = 'block';
    });

    cancelButton.addEventListener('click', () => {
        modal.style.display = 'none';
        fileInput.value = ''; // Reset file input
    });

    confirmButton.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file to import');
            return;
        }

        try {
            const importMode = document.querySelector('input[name="importMode"]:checked').value;
            const fileContent = await file.text();
            const importedData = JSON.parse(fileContent);

            if (!Array.isArray(importedData)) {
                throw new Error('Invalid import file format');
            }

            await importData(importedData, importMode);
            
            // Refresh the display
            await displayData();
            
            // Close modal and reset
            modal.style.display = 'none';
            fileInput.value = '';
            
            console.log('Data imported successfully!');
        } catch (error) {
            console.error('Import error:', error);
            alert(`Import failed: ${error.message}`);
        }
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
            fileInput.value = '';
        }
    });
}

async function importData(importedData, importMode) {
    if (!window.db) {
        throw new Error('Database not initialized');
    }

    if (importMode === 'overwrite') {
        // Clear existing data
        const response = await browser.runtime.sendMessage({
            action: "clearDB"
        });
        // TODO add debugging
    }

    // Process each entry
    for (const entry of importedData) {
        let finalEntry = { ...entry };

        if (importMode === 'merge') {
            // Check if entry exists
            const existingEntry = await browser.runtime.sendMessage({
                action: "getHistoryByAddress",
                address: entry.address
            });
            
            if (existingEntry && existingEntry.data) {  // Add check for existingEntry.data
                // Create a combined price history array
                const combinedHistory = [];
                
                // Add existing price history
                if (existingEntry.data.priceHistory) {
                    combinedHistory.push(...existingEntry.data.priceHistory);
                }
                
                // Add new price history
                if (entry.priceHistory) {
                    combinedHistory.push(...entry.priceHistory);
                }
                
                // Add current prices as history entries if they don't match
                if (existingEntry.data.price !== entry.price) {
                    combinedHistory.push({
                        price: existingEntry.data.price,
                        timestamp: existingEntry.data.timestamp
                    });
                }
                
                // Remove duplicates based on timestamp
                const uniqueHistory = Array.from(new Map(
                    combinedHistory.map(item => [item.timestamp, item])
                ).values());
                
                // Sort by timestamp
                uniqueHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                finalEntry.priceHistory = uniqueHistory;
                
                // Preserve existing note if new entry doesn't have one
                if (!finalEntry.note && existingEntry.data.note) {
                    finalEntry.note = existingEntry.data.note;
                }
            }
        }
        console.log(entry);
        console.warn(finalEntry);
        
        await browser.runtime.sendMessage({
            action: "saveEntry",
            data: {
                ...finalEntry,
                preserveTimestamps: true
            }
        });
    }
}

// Add event listeners when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add button click handlers
    setupImportHandlers();
    document.getElementById('refreshButton').addEventListener('click', refreshData);
    document.getElementById('exportButton').addEventListener('click', exportData);
    document.getElementById('toggleFavorites').addEventListener('click', function() {
        showFavoritesOnly = !showFavoritesOnly;
        this.textContent = showFavoritesOnly ? 'Show All' : 'Show Favorites Only';
        displayData();
    });

    // Initialize database and display data
    displayData();
});
