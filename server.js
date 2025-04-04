const express = require('express');
const bodyParser = require('body-parser');
const forexScript = require('./index_final2'); // Import your Forex script
const cors = require('cors');

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

// API route for Forex balance data
app.post('/api/forex', async (req, res) => {
  try {
    console.log(req.query);
    // Get credentials from request body
    const { username, password } = req.query;
    
    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    console.log(`API received request for username: ${username}`);
    
    // Execute the Forex script with the provided credentials
    const balanceData = await forexScript.run(username, password);
    
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
app.post('/api/j2ttech', async (req, res) => {
  try {
    console.log(req.query);
    // Get credentials from request body
    const { username, password } = req.query;
    
    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    console.log(`API received request for username: ${username}`);
    
    // Execute the Forex script with the provided credentials
    const balanceData = await forexScript.run(username, password);
    
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
// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Forex Balance API server running on port ${PORT}`);
});