const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;
console.log(PORT)
// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set a reasonable timeout for the request
app.use((req, res, next) => {
  res.setTimeout(300000, () => {
    console.log('Request has timed out.');
    res.status(408).send({ error: 'Request timeout' });
  });
  next();
});

// ============================================
// CREATE ACCOUNT ENDPOINT
// ============================================
app.post('/api/create-account', async (req, res) => {
  try {
    console.log('========================================');
    console.log('Received create account request');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('========================================');

    // Lazy load the module only when needed
    const createAccountScript = require('./create_account.js');

    const {
      fullName,
      email,
      phone,
      country,
      accountType,
      currency,
      leverage,
      password: userPassword,  // Rename to avoid conflict
      ...additionalParams
    } = req.body;

    // Split full name into first and last name
    let firstName = '';
    let lastName = '';
    if (fullName) {
      const parts = fullName.trim().split(' ');
      firstName = parts.shift();
      lastName = parts.join(' ');
    }

    // Validation
    const errors = [];
    if (!fullName) errors.push('fullName is required');
    if (!email) errors.push('email is required');
    if (!phone) errors.push('phone is required');

    if (errors.length > 0) {
      console.log('Validation failed:', errors);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    console.log(`Creating account for: ${fullName} (${email})`);

    const accountData = await createAccountScript.createAccount({
      firstName,
      lastName,
      email,
      phone,
      country,
      accountType,
      currency,
      leverage,
      password: userPassword,
      fullName,
      ...additionalParams
    });

    console.log('Account creation result:', JSON.stringify(accountData, null, 2));

    if (accountData && accountData.error) {
      console.error('Account creation error:', accountData.error);
      return res.status(500).json({
        success: false,
        error: accountData.error,
        details: accountData
      });
    }

    if (!accountData.success) {
      return res.status(500).json({
        success: false,
        error: 'Account creation failed',
        details: accountData
      });
    }

    console.log('✓ Account created successfully!');

    // Extract only login and password from accountDetails
    const accountLogin = accountData.accountDetails?.login;
    const accountPassword = accountData.accountDetails?.password;

    res.json({
      success: true,
      message: 'Account created successfully',

      login: accountLogin,
      password: accountPassword

    });

  } catch (error) {
    console.error('Create Account API Error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// SWITCH MARKETS ENDPOINT (POST)
// ============================================
app.post('/api/switchmarkets', async (req, res) => {
  try {
    console.log('========================================');
    console.log('Received Switch Markets request');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('========================================');

    // Lazy load the module only when needed
    const switchMarketsScript = require('./switchmarkets.js');

    // Get credentials from request body
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    console.log(`Fetching Switch Markets data for username: ${username}`);

    // Execute the Switch Markets script
    const result = await switchMarketsScript.runSwitchMarkets(username, password);

    console.log('Switch Markets result:', JSON.stringify(result, null, 2));

    // Check if there was an error
    if (result && result.error) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch Switch Markets data',
        details: result
      });
    }

    console.log('✓ Switch Markets data fetched successfully!');
    res.json({
      success: true,
      message: 'Switch Markets data fetched successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Switch Markets API Error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// SWITCH MARKETS ENDPOINT (GET)
// ============================================
app.get('/api/switchmarkets', async (req, res) => {
  try {
    console.log('========================================');
    console.log('Received Switch Markets GET request');
    console.log('Query params:', JSON.stringify(req.query, null, 2));
    console.log('========================================');

    // Lazy load the module only when needed
    const switchMarketsScript = require('./switchmarkets.js');

    // Get credentials from query parameters
    const { username, password } = req.query;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required as query parameters'
      });
    }

    console.log(`Fetching Switch Markets data for username: ${username}`);

    // Execute the Switch Markets script
    const result = await switchMarketsScript.runSwitchMarkets(username, password);

    console.log('Switch Markets result:', JSON.stringify(result, null, 2));

    // Check if there was an error
    if (result && result.error) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch Switch Markets data',
        details: result
      });
    }

    console.log('✓ Switch Markets data fetched successfully!');
    res.json({
      success: true,
      message: 'Switch Markets data fetched successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Switch Markets API Error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// FOREX ENDPOINT (POST)
// ============================================
app.post('/api/forex', async (req, res) => {
  try {
    // Lazy load the module only when needed
    const forexScript = require('./index.js');

    const username = req.body.username || req.query.username;
    const password = req.body.password || req.query.password;
    const server = req.body.server || req.query.server;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const balanceData = await forexScript.run(username, password, server);

    if (balanceData && balanceData.error) {
      return res.status(500).json({
        success: false,
        error: balanceData.error
      });
    }

    res.json({
      success: true,
      data: balanceData
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// FOREX ENDPOINT (GET)
// ============================================
app.get('/api/forex', async (req, res) => {
  try {
    // Lazy load the module only when needed
    const forexScript = require('./index.js');

    const { username, password, server = "forex" } = req.query;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    console.log(`API received GET request for username: ${username}, server: ${server}`);

    const balanceData = await forexScript.run(username, password, server);

    if (balanceData && balanceData.error) {
      return res.status(500).json({
        success: false,
        error: balanceData.error
      });
    }

    res.json({
      success: true,
      data: balanceData
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

// Endpoint to get the screenshot
app.get('/api/screenshot', (req, res) => {
  const screenshotPath = path.join(process.cwd(), 'screenshots', 'login.png');
  res.sendFile(screenshotPath, (err) => {
    if (err) {
      console.error('Error sending screenshot:', err);
      res.status(404).json({
        success: false,
        error: 'Screenshot not found'
      });
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      createAccount: 'POST /api/create-account',
      switchMarkets: 'POST/GET /api/switchmarkets',
      forex: 'POST/GET /api/forex',
      screenshot: 'GET /api/screenshot',
      health: 'GET /api/health'
    }
  });
});

// Start the server
app.listen(3000, '0.0.0.0', () => {
  console.log(`===========================================`);
  console.log(`Forex Balance API server running on port ${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`- POST /api/create-account`);
  console.log(`- POST /api/switchmarkets`);
  console.log(`- GET  /api/switchmarkets`);
  console.log(`- POST /api/forex`);
  console.log(`- GET  /api/forex`);
  console.log(`- GET  /api/health`);
  console.log(`===========================================`);
});