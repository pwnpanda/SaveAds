const DEBUG = true;

function log(msg){
    if (DEBUG){
        const stack = new Error().stack;
        const callerLine = stack.split('\n')[2].trim().match(/\d+:\d+$/);
        console.log(`content.js:${callerLine ? callerLine[0] : 'unknown'} - ${msg}`);
        //console.log(stack);
    }
}

function getPriceInt(priceString) {
    currencyPlace = priceString.indexOf("k")
    log(`currencyPlace: ${currencyPlace}`)
    priceToInt = priceString.substring(0, currencyPlace-1)
    log(`priceToInt: ${priceToInt}`)
    return parseInt(priceToInt.replace(/\s+/g, ''))
}

function getAddress(domain){
    addr = ""
    if (domain == "www.finn.no"){
        // ADDR
        // class="pl-4" data-testid="object-address"
        // <span> text address
        addr = document.querySelectorAll('.pl-4')[0].textContent
        /*log("addr obj: ", document.querySelectorAll('.pl-4'))
        log(`addr ${addr}`)*/
    } else if (domain == "hjem.no"){
        // Wait for element to be available
        return new Promise((resolve) => {
            const checkElement = setInterval(() => {
                const elements = document.querySelectorAll('.property--title-location');
                if (elements.length > 0 && elements[0].childNodes.length > 0) {
                    clearInterval(checkElement);
                    // ADDR
                    // document.querySelectorAll('.property--title-location')[0].childNodes[0].childNodes[3].textContent
                    const addr = elements[0].childNodes[0].childNodes[3].textContent;
                    /*log("addr-obj: ", document.querySelectorAll('.property--title-location'))
                    log(`addr ${addr}`)*/
                    resolve(addr);
                }
            }, 100); // Check every 100ms
        });
    } else {
        throw new Error("No valid domain found!");
    }
    //log(`Final addr ${addr}`)

    return addr
}

async function getData(domain) {
    if (domain == "www.finn.no") {
        // PRIS
        // class="pb-24", entry #2,  data-testid="pricing-incicative-price"
        // <span 1> prisantydning
        // <span 2> pris
        priceDiv = document.querySelectorAll('.pb-24')[0]
        log(`priceDiv: ${priceDiv}`)
        price = priceDiv.childNodes[1].textContent
        log(`price: ${price}`)
        priceInt = getPriceInt(price)
        log(`priceInt: ${priceInt}`)

        addr = getAddress(domain)

        return { "Pris": priceInt, "Addresse": addr}
    }
    else if (domain == "hjem.no"){
        // PRIS
        donePrice = await new Promise((resolve) => {
            const checkElement = setInterval(() => {
                elements = document.querySelectorAll('.text-bs0')
                if (elements.length > 0 && elements[0].textContent) {
                    clearInterval(checkElement);
                    price = document.querySelectorAll('.text-bs0')[0].textContent
                    log(`price: ${price}`)
                    priceInt = getPriceInt(price)
                    log(`priceInt: ${priceInt}`)
                    resolve(priceInt)
                }
            }, 100); // Check every 100ms
        });
        log(`Pris: ${donePrice}`)
        
        addr = await getAddress(domain)
        log(`Pris: ${donePrice} Addresse: ${addr}`)
        return { "Pris": donePrice, "Addresse": addr}
    
    } else {
        log(`Error, unknown domain: ${domain}`)
    }
}

function getFirstParamUrl(url) {
    const parsedUrl = new URL(url);
    const params = new URLSearchParams(parsedUrl.search);
    
    // Get the first parameter using the iterator
    const firstParam = params.entries().next();
    
    // If there are no parameters, return the original URL
    if (firstParam.done) {
        return url;
    }
    
    // Get the key and value from the first parameter
    const [key, value] = firstParam.value;
    
    // Construct the URL with only the first parameter
    return `${parsedUrl.origin}${parsedUrl.pathname}?${key}=${value}${parsedUrl.hash}`;
}
  
async function saveData(domain, link, data){
    console.warn(`domain: ${domain} link: ${link} data: {pris: ${data.Pris}, addr: ${data.Addresse}}`)
    try {
        // Prepare the data object
        const saveObject = {
            domain,
            link,
            title: document.title,
            price: data.Pris,
            address: data.Addresse
        };

        // Send message to background script
        const response = await browser.runtime.sendMessage({
            action: "saveEntry",
            data: saveObject
        });

        if (response.error) {
            throw new Error(response.error);
        }

        log('Data saved successfully');
    } catch (error) {
        log(`Error saving data: ${error.message}`);
        throw error;
    }

}

async function processPage(domain, address) {
    //console.log("Processing page!")
    if (typeof window.priceHistory === 'undefined') {
        //console.log('Waiting for priceHistory to initialize...');
        await new Promise(resolve => setTimeout(resolve, 100));
        return processPage(domain, address);
    }
    
    setTimeout(() => window.priceHistory.injectIcon(domain), 1000);
}

async function run() {
    log("run")
    // await ensureDatabaseReady();
    log(`domain: ${domain}`)
    if (domain == "www.finn.no"){
        link = getFirstParamUrl(window.location.href)
    } else if (domain == "hjem.no"){
        link = `${window.location.origin}${window.location.pathname}`
    } else {
        log(`Error, unknown domain: ${domain}`)
        return
    }
    log(`link: ${link}`)
    data = await getData(domain)
    log(`data: ${data}`)
    saveData(domain, link, data)    
}

// Load initial state
browser.storage.local.get('autoSave').then(result => {
    autoSaveEnabled = result.autoSave || false;
    if (autoSaveEnabled) {
        run();
    }
});

// Update the message listener
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "toggleAutoSave") {
        autoSaveEnabled = request.enabled;
        console.log(`Autosave: ${autoSaveEnabled}`)
        if (autoSaveEnabled) {
            run(); // Run immediately when enabled
        }
    }
});


// Listen for visibility changes
document.addEventListener('visibilitychange', function() {
    const currentDomain = window.location.hostname;
    if (document.visibilityState === 'visible') {
        // Only reload for exact domain matches
        if (currentDomain === 'www.finn.no' || currentDomain === 'hjem.no') {
            window.location.reload();
        }
    }
});

// Create a MutationObserver to watch for when React adds the element
const observer = new MutationObserver((mutations) => {
    const iconElement = document.querySelector('.price-history-icon');
    if (iconElement) {
      // Your icon manipulation code here
      observer.disconnect(); // Stop observing once we've found and modified the element
    } else {
        domain = window.location.host;
        processPage(domain, getAddress(domain));
    }
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
/*
  async function ensureDatabaseReady() {
    log('Checking database readiness...');
    if (!window.db) {
        log('Database not ready, waiting...');
        await new Promise(resolve => setTimeout(resolve, 100));
        return ensureDatabaseReady();
    }
    log('Database is ready');
    return window.db;
}

if (!window.indexedDB) {
    console.error('IndexedDB not available in this browser!');
}

window.db = ensureDatabaseReady();
*/
var autoSaveEnabled = true;
log(`Autostore: ${autoSaveEnabled}`);
// Keep the original call as a fallback
domain = window.location.host;
processPage(domain, getAddress(domain));

