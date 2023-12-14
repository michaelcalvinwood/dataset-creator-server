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

const createTransformedVersions = async (start = 1, end = 100) => {
    const url = 'https://www.michaelcalvinwood.net/datasets/text-data/NewsArticles.csv';
    const file = './public/datasets/inputs.json';

    let inputs = [];
    try {
        inputs = JSON.parse(fs.readFileSync(file))
    } catch (e) {
        console.error(e)
    } 

    // for (let i = 0; i < inputs.length; ++i) console.log(inputs[i].substring(0, 100));
    // return;

    let numInputs = inputs.length;
    const next = numInputs + 1;

    if (next > start) start = next;
    
    console.log('start', start, 'end', end)

    if (start <= end) {
        const response = await axios.get(url);

        const orig = papa.parse(response.data).data;
    
        for (let i = start; i <= end; ++i) {
            const text = orig[i][4] ? orig[i][3] + "\n" + orig[i][4] + "\n" + orig[i][5] :  orig[i][3] + "\n" + orig[i][5];
    
            const transformed = await ai.rewriteAsNewsArticle(text);
    
            console.log(`Transformed ${i}: `, transformed);
    
            inputs.push(transformed);
        }
    
        fs.writeFileSync(file, JSON.stringify(inputs), 'utf8');    
    }
    

}

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

createTransformedVersions();