const express = require("express");
const axios = require("axios");
const app = express();

// You can even encrypt or encode these in DB later
const IMAGES = {
    "banner123": "https://data.monitoringservice.co/img/21-9-2025/18/50_2212_1533214_1758480760803-landing.jpg",
    "banner124": "https://data.monitoringservice.co/img/21-9-2025/18/50_2212_1533214_1758480582984-ad-iFrame-1.jpg",
};

app.get("/api/banner/:id", async (req, res) => {
    const realUrl = IMAGES[req.params.id];
    if (!realUrl) return res.status(404).send("Not found");

    try {
        const response = await axios.get(realUrl, { responseType: "arraybuffer" });
        res.setHeader("Content-Type", "image/jpeg");
        res.send(response.data);
    } catch (err) {
        res.status(500).json({ error: "Failed to load banner" });
    }
});

app.listen(3000, () => console.log("Server running on port 3000"));
