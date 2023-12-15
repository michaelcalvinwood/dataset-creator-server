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
const nlp = require('./utils/nlp');

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '200mb'})); 
app.use(cors());

// app.get('/', (req, res) => {
//     res.send('Hello, World!');
// });

const readJsonFile = (file, empty = 'error') => {
    try {
        const json = JSON.parse(fs.readFileSync(file));
        return json;
    } catch(e) {
        console.error(e);
        switch (empty) {
            case 'error':
                return false;
            case 'array':
                return [];
            case 'object':
                return {}
            case 'string':
                return ''
            default:
                return false;
        }
    }
}

const writeJsonFile = (file, json) => {
    try {
        fs.writeFileSync(file, JSON.stringify(json), 'utf-8');
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

const sentenceEndsWithPunctuation = sentence => {
    if (!sentence) return false;

    const lastChar = sentence[sentence.length - 1];
    return !!lastChar.match(/^[.,:!?]/)
}

const test = () => {
    const file = './public/datasets/inputs.json';
    const inputs = JSON.parse(fs.readFileSync(file));
    const stripped = [];

    for (let i = 0; i < inputs.length; ++i) {
        const paragraphs = inputs[i].split("\n");
        const test = sentenceEndsWithPunctuation(paragraphs[0]);

        if (!test) {
            paragraphs.shift();
            paragraphs.shift();
        }

        stripped.push(paragraphs.join("\n"));
    }

    fs.writeFileSync('./public/datasets/stripped.json', JSON.stringify(stripped), 'utf-8');
   
}

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

const handleGetSamples = async (req, res) => {
    const tokens = req.query.tokens ? Number(req.query.tokens) : 400;

    console.log('tokens', tokens);
    
    try {
        const samples = JSON.parse(fs.readFileSync('./public/datasets/stripped.json'));
        const examples = [];
        for (let i = 0; i < samples.length; ++i) {
            const paragraphs = samples[i].split("\n")
            let text = paragraphs[0] ? paragraphs[0] : '';
            let curTokens = nlp.numGpt3Tokens(text);
            for (let j = 1; j < paragraphs.length; ++j) {
                const newTokens = nlp.numGpt3Tokens(paragraphs[j]);
                if ((curTokens + newTokens) > tokens) break;
                text += "\n" + paragraphs[j];
                curTokens += newTokens;
            }

            examples.push(text)
        }
        res.status(200).send(examples)
    } catch(e) {
        console.error(e);
        return res.status(500).json('internal server error');
    } 

}

const handleAddCsvEntry = async (req, res) => {
    const { input, output, name } = req.body;

    if (!input || !output || !name) return res.status(400).json("bad request");

    const file = '/var/www/nlpkit.net/datasets/pairs.json';

    const pairs = readJsonFile(file, 'array');

    const test = pairs.find(pair => pair.input == input);

    if (test) test.output = output;
    else pairs.push({input, output});

    writeJsonFile(file, pairs);

    return res.status(200).json('ok');

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
app.get('/getSamples', (req, res) => handleGetSamples(req, res));
app.post('/addCsvEntry', (req, res) => handleAddCsvEntry(req, res));

//createTransformedVersions();
//test();

const createJsonl = () => {
    const file = '/var/www/nlpkit.net/datasets/pairs.json';
    const outFile = file + 'l';
    const pairs = readJsonFile(file);
    
    try {
        fs.unlinkSync(outFile);
    } catch (e) {

    }

    for (let i = 0; i < pairs.length; ++i) {
        const entry = {
            messages: [
              { role: "system", content: "You are an assistant that replaces all pronouns and coreferences with their references." },
              { role: "user", content: `For the provided Text, replace pronouns and coreferences with their references.\n\nText:\n${pairs[i].input}` },
              { role: "assistant", content: pairs[i].output }
            ]
        }

        fs.appendFileSync(outFile, JSON.stringify(entry) + "\n", "utf-8");
    }

    ai.uploadFile(outFile);
}

const fineTune = async (fileId) => {
    ai.fineTune(fileId);
}

//createJsonl();

fineTune('file-anMdbekK3RqAx3hVl63KSjah')

