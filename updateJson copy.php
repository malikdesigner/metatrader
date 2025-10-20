<?php
/**
 * updateJson.php - Trading Data Update API
 * Receives trading data and saves to account-specific directory
 * - singleTrade.json: Latest trade data (overwritten each time)
 * - allTrade.json: Historical log of all trades (appended)
 * Upload to: /public_html/updateJson.php
 */

// Disable error display, enable error logging
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/api_errors.log');

// Set headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed. Use POST.'
    ]);
    exit();
}

// Configuration
define('BASE_DATA_DIR', __DIR__ . '/mt5Data_test');

/**
 * Create directory if it doesn't exist
 */
function ensureDirectoryExists($dir) {
    if (!file_exists($dir)) {
        if (!mkdir($dir, 0755, true)) {
            throw new Exception("Failed to create directory: $dir");
        }
    }
    if (!is_writable($dir)) {
        chmod($dir, 0755);
    }
    return true;
}

/**
 * Sanitize account number
 */
function sanitizeAccountNumber($accountNumber) {
    return preg_replace('/[^a-zA-Z0-9_-]/', '', $accountNumber);
}

/**
 * Calculate values from positions data
 */
function calculateAccountMetrics($data) {
    $metrics = [
        'total_commissions' => 0.00,
        'total_swaps' => 0.00,
        'total_closed_profits' => 0.00,
        'total_closed_losses' => 0.00,
        'breach_trade_profits' => 0.00,
        'violated_trades' => []
    ];

    // Calculate from positions if available
    if (isset($data['positions']) && is_array($data['positions'])) {
        foreach ($data['positions'] as $position) {
            // Extract profit value
            $profit = 0.00;
            if (isset($position['Profit'])) {
                $profitStr = str_replace(['+', ' ', '$', ','], '', $position['Profit']);
                $profit = floatval($profitStr);
            }

            // Count profits and losses
            if ($profit > 0) {
                $metrics['total_closed_profits'] += $profit;
            } elseif ($profit < 0) {
                $metrics['total_closed_losses'] += abs($profit);
            }

            // Track violated trades
            $violatedStatus = isset($position['Violated']) ? $position['Violated'] : 'No';
            $metrics['violated_trades'][] = [
                'Ticket' => $position['Ticket'] ?? 'N/A',
                'Symbol' => $position['Symbol'] ?? 'N/A',
                'Violated' => $violatedStatus
            ];

            // Sum commissions and swaps if available
            if (isset($position['Commission'])) {
                $commissionStr = str_replace(['+', ' ', '$', ','], '', $position['Commission']);
                $metrics['total_commissions'] += floatval($commissionStr);
            }
            if (isset($position['Swap'])) {
                $swapStr = str_replace(['+', ' ', '$', ','], '', $position['Swap']);
                $metrics['total_swaps'] += floatval($swapStr);
            }
        }
    }

    return $metrics;
}

/**
 * Get latest trade from positions or latestTrade data
 */
function getLatestTradeData($data) {
    $latestTrade = null;

    // First, try to get from latestTrade field
    if (isset($data['latestTrade']) && !empty($data['latestTrade'])) {
        $lt = $data['latestTrade'];
        
        // Find the full trade data from positions array
        if (isset($data['positions']) && is_array($data['positions'])) {
            foreach ($data['positions'] as $position) {
                if ($position['Ticket'] === $lt['ticket']) {
                    $latestTrade = $position;
                    break;
                }
            }
        }
    }

    // If not found, get the last position from positions array
    if (!$latestTrade && isset($data['positions']) && is_array($data['positions']) && count($data['positions']) > 0) {
        $latestTrade = end($data['positions']);
    }

    // Format latest trade data
    if ($latestTrade) {
        return [
            'Ticket' => $latestTrade['Ticket'] ?? '',
            'Symbol' => $latestTrade['Symbol'] ?? '',
            'Time' => $latestTrade['Time'] ?? '',
            'Type' => $latestTrade['Type'] ?? '',
            'Volume' => $latestTrade['Volume'] ?? '',
            'Open Price' => $latestTrade['Open Price'] ?? '',
            'Stop Loss' => $latestTrade['Stop Loss'] ?? '',
            'Take Profit' => $latestTrade['Take Profit'] ?? '',
            'Close Price' => $latestTrade['Close Price'] ?? '',
            'Swap' => $latestTrade['Swap'] ?? '0.00',
            'Profit' => $latestTrade['Profit'] ?? '0.00',
            'Comment' => $latestTrade['Comment'] ?? ''
        ];
    }

    return null;
}

/**
 * Transform data to the required format
 */
function transformToRequiredFormat($data) {
    $accountInfo = $data['account_info'] ?? [];
    $metrics = calculateAccountMetrics($data);
    $latestTrade = getLatestTradeData($data);

    // Extract balance values
    $balance = floatval($accountInfo['balance'] ?? 0);
    $equity = floatval($accountInfo['equity'] ?? 0);
    $freeMargin = floatval($accountInfo['free_margin'] ?? 0);
    
    // Calculate current profit (equity - balance)
    $currentProfit = $equity - $balance;
    
    // Calculate max drawdown percentage
    $maxDrawdownPercent = 0.00;
    if ($balance > 0) {
        $maxDrawdownPercent = (($balance - $equity) / $balance) * 100;
        $maxDrawdownPercent = max(0, $maxDrawdownPercent); // Don't allow negative
    }

    // Calculate adjusted drawdown
    $adjustedDrawdownPercent = -round($maxDrawdownPercent / 100, 4);

    // Check if DD rules are broken (0.25% threshold)
    $openingBalanceRuleBroken = ($maxDrawdownPercent >= 0.25) ? "Yes" : "No";
    $peakEquityRuleBroken = ($maxDrawdownPercent >= 0.25) ? "Yes" : "No";
    $ruleBrokenCount = 0;
    if ($openingBalanceRuleBroken === "Yes") $ruleBrokenCount++;
    if ($peakEquityRuleBroken === "Yes") $ruleBrokenCount++;

    // Format violated trades string
    $violatedTradesStr = "";
    foreach ($metrics['violated_trades'] as $trade) {
        $violatedTradesStr .= "[Ticket: {$trade['Ticket']}, Symbol: {$trade['Symbol']}, Violated: {$trade['Violated']}] ";
    }
    $violatedTradesStr = trim($violatedTradesStr) ?: "No violations";

    // Get leverage (default to 1000 if not provided)
    $leverage = isset($accountInfo['leverage']) ? intval($accountInfo['leverage']) : 1000;

    // Calculate active days (from account opening date)
    $activeDays = 0;
    if (isset($accountInfo['accountOpeningDate']) && !empty($accountInfo['accountOpeningDate'])) {
        // Handle different date formats
        $dateStr = str_replace('.', '-', $accountInfo['accountOpeningDate']);
        $openingDate = strtotime($dateStr);
        if ($openingDate) {
            $currentDate = time();
            $activeDays = floor(($currentDate - $openingDate) / (60 * 60 * 24));
        }
    }

    // Determine account status
    $accountStatus = "Normal";
    if ($ruleBrokenCount > 0) {
        $accountStatus = "Violated";
    }
 $peakEquity = isset($data['peak_equity']) ? floatval($data['peak_equity']) : 0;

    // Calculate peak equity percentage change
    $peakEquityPercentChange = 0;
    if ($balance > 0) {
        $peakEquityPercentChange = (($peakEquity - $balance) / $balance) * 100;
    }
    // Build the final formatted data
    $formattedData = [
        "Account Number" => intval($accountInfo['account_number'] ?? 0),
        "Account Opening Balance" => number_format($balance, 2, '.', ''),
        "Account Equity" => number_format($equity, 2, '.', ''),
        "Free Margin" => number_format($freeMargin, 2, '.', ''),
        "Target Profit" => "0.00",
         "Peak Equity" => number_format($peakEquity, 2, '.', ''),
    "Peak Equity % Change" => number_format($peakEquityPercentChange, 2, '.', ''),
        "Current Profit" => number_format($currentProfit, 2, '.', ''),
        "Breach Trade Profits" => number_format($metrics['breach_trade_profits'], 2, '.', ''),
        "Total Closed Losses" => number_format($metrics['total_closed_losses'], 2, '.', ''),
        "Total Closed Profits" => number_format($metrics['total_closed_profits'], 2, '.', ''),
        "Active Account Days" => $activeDays,
        "Max Drawdown" => number_format($maxDrawdownPercent, 2, '.', ''),
        "Leverage" => $leverage,
        "EA Logic: 'Rule Broken (0.25% Opening Balance DD)' Based On Adjusted Profit" => $openingBalanceRuleBroken,
        "Rule Broken (0.25% Peak Equity DD)" => $peakEquityRuleBroken,
        "Rule Broken Count" => $ruleBrokenCount,
        "Violated Trades" => $violatedTradesStr,
        "Total Commissions" => number_format($metrics['total_commissions'], 2, '.', ''),
        "Total Swaps" => number_format($metrics['total_swaps'], 2, '.', ''),
        "Account Status" => $accountStatus,
        "High Reward Mark (Max DD % Locked)" => "0.10",
        "Adjusted Drawdown %" => $adjustedDrawdownPercent,
        "Adjusted Profit DD Triggered" => $openingBalanceRuleBroken,
        "Timestamp" => date('Y-m-d H:i:s')
    ];

    $formattedData["MaxTrade"] = isset($data['maxTrade']) ? $data['maxTrade']: 0;
        $formattedData["maxOpenTrades"] = isset($data['maxOpenTrades']) ? $data['maxOpenTrades']: 0;

    // Add latest trade data if available
    if ($latestTrade) {
        $formattedData["Latest Trade"] = $latestTrade;
    }

    return $formattedData;
}

/**
 * Append data to allTrade.json
 */
function appendToAllTrades($accountDir, $formattedData) {
    $allTradeFile = $accountDir . '/allTrade.json';
    
    // Read existing data
    $allTrades = [];
    if (file_exists($allTradeFile)) {
        $existingData = file_get_contents($allTradeFile);
        $allTrades = json_decode($existingData, true);
        
        // If file is corrupted or not an array, start fresh
        if (!is_array($allTrades)) {
            $allTrades = [];
        }
    }
    
    // Append new data
    $allTrades[] = $formattedData;
    
    // Save back to file
    $jsonData = json_encode($allTrades, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($jsonData === false) {
        throw new Exception("Failed to encode allTrade.json data: " . json_last_error_msg());
    }
    
    if (file_put_contents($allTradeFile, $jsonData, LOCK_EX) === false) {
        throw new Exception("Failed to write to allTrade.json");
    }
    
    return count($allTrades);
}

/**
 * Save trading data to JSON files
 */
function saveTradingData($accountNumber, $data) {
    try {
        // Sanitize account number
        $accountNumber = sanitizeAccountNumber($accountNumber);
        
        if (empty($accountNumber)) {
            throw new Exception("Invalid account number");
        }

        // Create account directory path
        $accountDir = BASE_DATA_DIR . '/' . $accountNumber;
        
        // Ensure directories exist
        ensureDirectoryExists(BASE_DATA_DIR);
        ensureDirectoryExists($accountDir);

        // Transform data to required format
        $formattedData = transformToRequiredFormat($data);

        // 1. Save to singleTrade.json (overwrite - latest only)
        $singleTradeFile = $accountDir . '/singleTrade.json';
        $jsonData = json_encode($formattedData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($jsonData === false) {
            throw new Exception("Failed to encode JSON data: " . json_last_error_msg());
        }

        if (file_put_contents($singleTradeFile, $jsonData, LOCK_EX) === false) {
            throw new Exception("Failed to write to singleTrade.json");
        }

        // 2. Append to allTrade.json (historical log)
        $totalRecords = appendToAllTrades($accountDir, $formattedData);

        return [
            'success' => true,
            'message' => 'Trading data saved successfully',
            'account_number' => $accountNumber,
            'singleTrade_path' => 'mt5Data_test/' . $accountNumber . '/singleTrade.json',
            'allTrade_path' => 'mt5Data_test/' . $accountNumber . '/allTrade.json',
            'total_records_in_allTrade' => $totalRecords,
            'account_equity' => $formattedData['Account Equity'],
            'current_profit' => $formattedData['Current Profit'],
            'account_status' => $formattedData['Account Status'],
            'latest_trade_ticket' => isset($formattedData['Latest Trade']) ? $formattedData['Latest Trade']['Ticket'] : 'N/A',
            'saved_at' => date('Y-m-d H:i:s'),
            'singleTrade_size' => filesize($singleTradeFile) . ' bytes',
            'allTrade_size' => filesize($accountDir . '/allTrade.json') . ' bytes'
        ];

    } catch (Exception $e) {
        throw new Exception("Error saving data: " . $e->getMessage());
    }
}

// Main execution
try {
    // Get raw POST data
    $rawData = file_get_contents('php://input');
    
    if (empty($rawData)) {
        throw new Exception("No data received");
    }

    // Decode JSON data
    $data = json_decode($rawData, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception("Invalid JSON data: " . json_last_error_msg());
    }

    // Extract account number from the data
    $accountNumber = null;
    
    // Try different possible locations for account number
    if (isset($data['account_info']['account_number'])) {
        $accountNumber = $data['account_info']['account_number'];
    } elseif (isset($data['data']['account_info']['account_number'])) {
        $accountNumber = $data['data']['account_info']['account_number'];
    } elseif (isset($data['account_number'])) {
        $accountNumber = $data['account_number'];
    }
    
    if (empty($accountNumber)) {
        throw new Exception("Account number not found in data. Please ensure account_info.account_number is set.");
    }

    // Save the data
    $result = saveTradingData($accountNumber, $data);
    
    // Log success
    error_log("Trading data saved successfully for account: $accountNumber (Total records: {$result['total_records_in_allTrade']})");
    
    http_response_code(200);
    echo json_encode($result);

} catch (Exception $e) {
    http_response_code(400);
    
    $errorResponse = [
        'success' => false,
        'error' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s')
    ];
    
    echo json_encode($errorResponse);
    
    // Log error
    error_log("Trading API Error: " . $e->getMessage());
}
?>