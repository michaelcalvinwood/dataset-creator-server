const httpsPort = 6315;
//const httpPort = 5101;

const privateKeyPath = '/etc/letsencrypt/live/dataset.nlpkit.net/privkey.pem';
const fullchainPath = '/etc/letsencrypt/live/dataset.nlpkit.net/fullchain.pem';

const express = require('express');
const https = require('https');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const papa = require("papaparse");
const ai = require('./utils/ai');

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '200mb'})); 
app.use(cors());

// app.get('/', (req, res) => {
//     res.send('Hello, World!');
// });

const handleGetCsv = async (req, res) => {
    const { url } = req.body;

    if (!url) return res.status(400).json('bad command');
    console.log('url', url)

    try {
        const response = await axios.get(url);
        const json = papa.parse(response.data)
        return res.status(200).json(json);
    } catch(e) {
        console.error(e);
        return res.status(500).json('internal server error');
    }


}

const handleGetTransformed = async (req, res) => {
    const { text } = req.body;

    if (!text) return res.status(400).json('bad request');

    try {
        const transformed = await ai.rewriteAsNewsArticle(text);
        return res.status(200).json({transformed})
    } catch (e) {
        console.error(e);
        return res.status(500).json('internal server error');
    }
}

const httpsServer = https.createServer({
    key: fs.readFileSync(privateKeyPath),
    cert: fs.readFileSync(fullchainPath),
  }, app);
  

  httpsServer.listen(httpsPort, () => {
    console.log(`HTTPS Server running on port ${httpsPort}`);
});

app.post('/getCsv', (req, res) => handleGetCsv(req, res));
app.post('/getTransformed', (req, res) => handleGetTransformed(req, res));

