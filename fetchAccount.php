<?php
//fetchAccount.php
// Database connection settings
$servername = 'localhost';
$username = 'u799514067_account';
$password = '6/Djb/]yY[JM';
$dbname = 'u799514067_account';

try {
    $conn = new PDO("mysql:host=$servername;dbname=$dbname;charset=utf8mb4", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Get the server parameter from the query string
    $server = isset($_GET['server']) ? trim($_GET['server']) : '';

    // Build query
    $whereClause = '';
    $params = [];

    $whereClause = 'WHERE status = "connected"'; // Exclude failed accounts
    $params = [];

    if ($server !== '') {
        $whereClause .= " AND server = :server";
        $params[':server'] = $server;
    }
    $sql = "SELECT account_number as username, password, server
            FROM user_proc_demo_accounts
            $whereClause";

    $stmt = $conn->prepare($sql);
    // bind only if needed
    if ($server !== '') {
        $stmt->bindParam(':server', $params[':server']);
    }

    $stmt->execute();
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    header('Content-Type: application/json');
    echo json_encode($accounts, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

} catch(PDOException $e) {
    header('Content-Type: application/json', true, 500);
    echo json_encode(["error" => $e->getMessage()]);
}
$conn = null;
?>
