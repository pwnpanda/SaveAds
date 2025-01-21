const DEBUG = true

function dblog(msg) {
    if (DEBUG) {
        const stack = new Error().stack;
        const callerLine = stack.split('\n')[2].trim().match(/\d+:\d+$/);
        console.log(`database.js:${callerLine ? callerLine[0] : 'unknown'} - ${msg}`);
        //console.log(stack);
    }
}

class Favorites {
    constructor() {
        this.storageKey = 'savedAdsFavorites';
    }

    async getFavorites() {
        const result = await browser.storage.local.get(this.storageKey);
        return result[this.storageKey] || [];
    }

    async toggleFavorite(address) {
        const favorites = await this.getFavorites();
        const index = favorites.indexOf(address);
        
        if (index === -1) {
            favorites.push(address);
        } else {
            favorites.splice(index, 1);
        }

        await browser.storage.local.set({ [this.storageKey]: favorites });
        return index === -1; // returns true if address was added, false if removed
    }

    async isFavorite(address) {
        const favorites = await this.getFavorites();
        return favorites.includes(address);
    }
}

const Database = class {
    constructor() {
        this.dbName = 'saveAdsDB';
        this.storeName = 'ads';
        this.version = 5;
        this.db = null;
        this.favorites = new Favorites();
    }

    async init() {
        if (this.db) return this.db;

        dblog('Initializing database...');
        return new Promise((resolve, reject) => {
            try {
                dblog('Opening database connection...');
                const request = indexedDB.open(this.dbName, this.version);
                dblog('Done database connection...');

                dblog(`Request object created: ${request}`);
                dblog(`Initial readyState: ${request.readyState}`);
                // Wait for readyState to change
                const checkReadyState = setInterval(() => {
                    dblog(`Checking readyState: ${request.readyState}`);
                    if (request.readyState === 'done') {
                        clearInterval(checkReadyState);
                        dblog('Request is ready!');
                    }
                }, 100);

                request.onerror = (event) => {
                    const error = `Database error: ${request.error}`;
                    dblog(error);
                    reject(new Error(error));
                };

                request.onblocked = (event) => {
                    const error = 'Database blocked: please close other tabs with this site open';
                    dblog(error);
                    reject(new Error(error));
                };
                request.onsuccess = (event) => {
                    dblog('Database initialized successfully');
                    this.db = event.target.result;  // Assign to this.db here
                    
                    // Add error handler for database connection
                    this.db.onerror = (event) => {
                        dblog(`Database error: ${event.target.error}`);
                    };

                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    dblog('Database upgrade needed, creating object store...');
                    try {
                        const db = event.target.result;
                       
                       const store = db.createObjectStore(this.storeName, {
                            keyPath: 'address'
                        });

                        // Create indexes for searching
                        store.createIndex('address', 'address', { unique: false });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('lastChecked', 'lastChecked', { unique: false });

                        dblog('Object store and indexes created successfully');
                    } catch (error) {
                        const errorMsg = `Error during database upgrade: ${error}`;
                        dblog(errorMsg);
                        reject(new Error(errorMsg));
                    }
                                    
                };

            } catch (error) {
                const errorMsg = `Failed to initialize database: ${error}`;
                dblog(errorMsg);
                reject(new Error(errorMsg));
            }
        });
    }


    async save(data, preserveTimestamps = false) {
        if (!this.db) await this.init();
    
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
    
            // Get existing record for this address
            const request = store.get(data.address);

            dblog("IN SAVEDATA");
    
            request.onsuccess = () => {
                const existingRecord = request.result;
                const currentTime = new Date().toISOString();
                
                if (existingRecord) {
                    // Preserve existing note if not provided in new data
                    const note = data.note !== undefined ? data.note : existingRecord.note;

                    // If price hasn't changed, just update lastChecked
                    if (existingRecord.price === data.price) {
                        const updateRecord = {
                            ...existingRecord,
                            note,
                            lastChecked: preserveTimestamps ? data.lastChecked : currentTime
                        };
                        store.put(updateRecord).onsuccess = () => resolve();
                        return;
                    }
                    
                    // If price has changed, add to price history
                    const priceHistory = existingRecord.priceHistory || [];
                    priceHistory.push({
                        price: existingRecord.price,
                        timestamp: existingRecord.timestamp
                    });
    
                    const updateRecord = {
                        ...data,
                        note,
                        priceHistory,
                        lastChecked: preserveTimestamps ? data.lastChecked : currentTime,
                        timestamp: preserveTimestamps ? data.timestamp : existingRecord.timestamp
                    };
                    store.put(updateRecord).onsuccess = () => resolve();
                } else {
                    // First record for this address
                    const newRecord = {
                        ...data,
                        note: data.note || '',
                        priceHistory: [],
                        timestamp: preserveTimestamps ? data.timestamp : currentTime,
                        lastChecked: preserveTimestamps ? data.lastChecked : currentTime
                    };
                    store.add(newRecord).onsuccess = () => resolve();
                }
            };
    
            request.onerror = () => reject(request.error);
        });
    }

    async getHistoryByAddress(address) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);

            const request = store.get(address);

            request.onsuccess = () => {
                const record = request.result;
                if (!record) {
                    resolve([]);
                    return;
                }

                // Combine current price with price history
                const history = [...record.priceHistory, {
                    price: record.price,
                    timestamp: record.timestamp
                }];

                resolve(history.sort((a, b) =>
                    new Date(b.timestamp) - new Date(a.timestamp)
                ));
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Get all entries
    async getAll() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Update entry
    async update(data) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, "readwrite");
            const store = transaction.objectStore(this.storeName);

            // First get the existing entry
            const getRequest = store.get(data.address);

            getRequest.onsuccess = () => {
                const existingData = getRequest.result;
                const updatedData = {
                    ...existingData,
                    ...data,
                    lastModified: new Date().toISOString()
                };

                const updateRequest = store.put(updatedData);
                updateRequest.onsuccess = () => resolve(updateRequest.result);
                updateRequest.onerror = () => reject(updateRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Delete entry
    async delete(address) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(address);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear() {
        if (!this.db) await this.init();
    
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.clear();
            
            request.onsuccess = () => {
                dblog('Database cleared successfully');
                resolve();
            };
            
            request.onerror = () => {
                dblog('Error clearing database');
                reject(request.error);
            };
        });
    }

    async analyzePriceHistory(address) {
        const history = await this.getHistoryByAddress(address);
        if (history.length < 2) return null;

        const sortedHistory = history.sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        const analysis = {
            address,
            currentPrice: sortedHistory[sortedHistory.length - 1].price,
            priceChanges: [],
            totalChange: {
                amount: 0,
                percentage: 0
            },
            averageChange: {
                amount: 0,
                percentage: 0
            }
        };

        for (let i = 1; i < sortedHistory.length; i++) {
            const prev = sortedHistory[i - 1];
            const current = sortedHistory[i];
            const change = {
                from: prev.price,
                to: current.price,
                difference: current.price - prev.price,
                percentage: ((current.price - prev.price) / prev.price) * 100,
                date: current.timestamp
            };
            analysis.priceChanges.push(change);
        }

        // Calculate total change
        const firstPrice = sortedHistory[0].price;
        const lastPrice = sortedHistory[sortedHistory.length - 1].price;
        analysis.totalChange = {
            amount: lastPrice - firstPrice,
            percentage: ((lastPrice - firstPrice) / firstPrice) * 100
        };

        // Calculate average change
        if (analysis.priceChanges.length > 0) {
            analysis.averageChange = {
                amount: analysis.priceChanges.reduce((sum, change) => sum + change.difference, 0) / analysis.priceChanges.length,
                percentage: analysis.priceChanges.reduce((sum, change) => sum + change.percentage, 0) / analysis.priceChanges.length
            };
        }

        return analysis;
    }
}

const db = new Database();  // Make sure to use 'new'

(async () => {
    try {
        await db.init();
        window.db = db;
        dblog('Database initialized and attached to window');
    } catch (error) {
        dblog(`Failed to initialize database: ${error}`);
    }
})();