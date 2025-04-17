const express = require('express');
const bodyParser = require('body-parser');
const forexScript = require('./index.js'); // Import your Forex script

// const forexScript = require('./index_final2'); // Import your Forex script
const cors = require('cors');
const path = require('path');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set a reasonable timeout for the request (Puppeteer operations can take time)
app.use((req, res, next) => {
  res.setTimeout(300000, () => {
    console.log('Request has timed out.');
    res.status(408).send({ error: 'Request timeout' });
  });
  next();
});

// API route for Forex balance data - support both POST body and GET query parameters
app.post('/api/forex', async (req, res) => {
  try {
    // Log request information for debugging
   
    // Get credentials from request body OR query parameters
    // This makes the API more flexible
    const username = req.body.username || req.query.username;
    const password = req.body.password || req.query.password;
    const server = req.body.server || req.query.server;
    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    
    
    // Execute the Forex script with the provided credentials
    const balanceData = await forexScript.run(username, password,server);
    
    // Check if there was an error during script execution
    if (balanceData && balanceData.error) {
      return res.status(500).json({
        success: false,
        error: balanceData.error
      });
    }
    
    // Return the balance data as JSON
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

// Also support GET requests for easier testing
app.get('/api/forex', async (req, res) => {
  try {
    // Get credentials from query parameters
    const { username, password, server = "forex" } = req.query;
    
    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    console.log(`API received GET request for username: ${username}, server: ${server}`);
    
    // Execute the Forex script with the provided credentials
    const balanceData = await forexScript.run(username, password, server);
    
    // Check if there was an error during script execution
    if (balanceData && balanceData.error) {
      return res.status(500).json({
        success: false,
        error: balanceData.error
      });
    }
    
    // Return the balance data as JSON
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
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Forex Balance API server running on port ${PORT}`);
});