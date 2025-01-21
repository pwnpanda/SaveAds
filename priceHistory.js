const PriceHistory = class {
    constructor() {
        this.popup = null;
        this.iconSelectors = {
            'www.finn.no': '.pb-24', // Placeholder for finn.no price container
            'hjem.no': '.text-bs0'   // Placeholder for hjem.no price container
        };
    }

    createPopup() {
        const popup = document.createElement('div');
        popup.className = 'price-history-popup';
        
        const style = document.createElement('style');
        style.textContent = `
            .price-history-popup {
                display: none;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 10000;
                max-width: 500px;
                max-height: 80vh;
                overflow-y: auto;
            }
            .price-history-popup.visible {
                display: block;
            }
            .price-history-icon {
                cursor: pointer;
                margin-left: 8px;
                padding: 4px;
            }
            .price-history-close {
                position: absolute;
                top: 10px;
                right: 10px;
                cursor: pointer;
                padding: 5px;
            }
            .overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            }
            .overlay.visible {
                display: block;
            }
        `;
        document.head.appendChild(style);
        
        const closeButton = document.createElement('span');
        closeButton.className = 'price-history-close';
        closeButton.innerHTML = '✕';
        closeButton.onclick = () => this.hidePopup();
        
        popup.appendChild(closeButton);
        document.body.appendChild(popup);
        
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.onclick = () => this.hidePopup();
        document.body.appendChild(overlay);
        
        this.popup = popup;
        this.overlay = overlay;
    }

    showPopup() {
        this.popup.classList.add('visible');
        this.overlay.classList.add('visible');
    }

    hidePopup() {
        this.popup.classList.remove('visible');
        this.overlay.classList.remove('visible');
    }

    createHistoryIcon() {
        const icon = document.createElement('span');
        icon.className = 'price-history-icon';
        icon.innerHTML = 'ⓘ';  // Unicode information symbol
        icon.title = 'View price history';
        icon.style.cssText = `
            font-size: 32px;  // Changed from 16px to 32px
            color: #2196F3;   // Changed from #666 to blue (#2196F3)
            vertical-align: middle;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;      // Changed from 20px to 40px
            height: 40px;     // Changed from 20px to 40px
            border-radius: 50%;
            transition: color 0.2s ease;
        `;

        // Update hover effect to darken the blue
        icon.onmouseover = () => icon.style.color = '#1976D2';  // Darker blue on hover
        icon.onmouseout = () => icon.style.color = '#2196F3';   // Back to original blue

        return icon;
    }

    createHistoryElement(analysis) {
        const container = document.createElement('div');
        container.className = 'price-history-details';
        
        // Add styles
        const styles = `
            .price-history-details {
                padding: 15px;
                font-family: Arial, sans-serif;
            }
            .price-change {
                margin: 10px 0;
                padding: 8px;
                background: #f5f5f5;
                border-radius: 4px;
            }
            .price-change.increase { color: #c62828; }
            .price-change.decrease { color: #2e7d32; }
            .summary { 
                font-weight: bold; 
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid #eee;
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        container.appendChild(styleElement);

        // Add summary
        const summary = document.createElement('div');
        summary.className = 'summary';
        summary.textContent = `Total price change: ${this.formatPrice(analysis.totalChange.amount)} (${analysis.totalChange.percentage.toFixed(1)}%)`;
        container.appendChild(summary);

        // Reverse the price changes array to show newest first
        const reversedChanges = [...analysis.priceChanges].reverse();

        // Add individual price changes
        reversedChanges.forEach(change => {
            const changeElement = document.createElement('div');
            changeElement.className = `price-change ${change.difference > 0 ? 'increase' : 'decrease'}`;

            const dateText = document.createTextNode(this.formatDate(change.date));
            changeElement.appendChild(dateText);
            changeElement.appendChild(document.createElement('br'));

            const priceText = document.createTextNode(
                `${this.formatPrice(change.from)} → ${this.formatPrice(change.to)}`
            );
            changeElement.appendChild(priceText);
            changeElement.appendChild(document.createElement('br'));

            const changeText = document.createTextNode(
                `Change: ${this.formatPrice(change.difference)} (${change.percentage.toFixed(1)}%)`
            );
            changeElement.appendChild(changeText);
            container.appendChild(changeElement);
        });

        return container;
    }

    formatPrice(price) {
        return new Intl.NumberFormat('nb-NO', {
            style: 'currency',
            currency: 'NOK'
        }).format(price);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('nb-NO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    async show(address) {
        if (!this.popup) {
            this.createPopup();
        }

        const analysis = await db.analyzePriceHistory(address);
        if (!analysis) {
            console.log('No price history available');
            return;
        }

        const historyElement = this.createHistoryElement(analysis);
        this.popup.innerHTML = ''; // Clear existing content
        const closeButton = document.createElement('span');
        closeButton.className = 'price-history-close';
        closeButton.innerHTML = '✕';
        closeButton.onclick = () => this.hidePopup();
        
        this.popup.appendChild(closeButton);
        this.popup.appendChild(historyElement);
    }

    injectIcon(domain) {
        const selector = this.iconSelectors[domain];
        if (!selector) return;

        const priceContainer = document.querySelector(selector);
        if (!priceContainer) return;

        // Check if icon already exists
        const existingIcon = priceContainer.querySelector('.price-history-icon');
        if (existingIcon) return;

        const icon = this.createHistoryIcon();
        priceContainer.appendChild(icon);
        
        icon.onclick = async () => {
            console.log("trying to get data!")
            
            try {
                const address = await getAddress(domain);
                if (address){
                    console.log("Got data")
                    await this.showDatabaseStatus(address);
                }
            } catch (error) {
                console.error('Error showing price history:', error);
            }
        };
    }

    async showDatabaseStatus(address) {
        if (!this.popup) {
            this.createPopup();
        }
        
        console.log("In showDatabaseStatus")

        try {
            // Get history from background script
            const historyResponse = await browser.runtime.sendMessage({
                action: "getHistoryByAddress",
                address: address
            });
    
            if (historyResponse.error) {
                throw new Error(historyResponse.error);
            }
    
            const history = historyResponse.data;
            const container = document.createElement('div');
            container.className = 'database-status';
            
            if (!history || history.length < 2) {
                const noDataDiv = document.createElement('div');
                noDataDiv.className = 'no-data';

                const br = document.createElement('br');
                noDataDiv.appendChild(br);

                const p = document.createElement('p');
                p.textContent = !history?.length ? 
                    'No price information for this ad!' : 
                    `Price has stayed the same since ${this.formatDate(history[0].timestamp)}`;
                noDataDiv.appendChild(p);

                container.appendChild(noDataDiv);
            } else {
                const analysisResponse = await browser.runtime.sendMessage({
                    action: "analyzePriceHistory",
                    address: address
                });
    
                if (analysisResponse.error) {
                    throw new Error(analysisResponse.error);
                }
    
                if (analysisResponse.data) {
                    container.appendChild(this.createHistoryElement(analysisResponse.data));
                }
            }
    
            this.popup.innerHTML = ''; // Clear existing content
            const closeButton = document.createElement('span');
            closeButton.className = 'price-history-close';
            closeButton.innerHTML = '✕';
            closeButton.onclick = () => this.hidePopup();
            
            this.popup.appendChild(closeButton);
            this.popup.appendChild(container);
            this.showPopup();
        } catch (error) {
            console.error('Error showing database status:', error);
        }
    }
}

window.priceHistory = new PriceHistory();