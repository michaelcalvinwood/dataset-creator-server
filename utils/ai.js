// openai 4 migration guide: https://chat.openai.com/share/b175130a-0d77-465e-8187-59b92590df8b

const debug = true;

require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;

const { Configuration, OpenAIApi } = require("openai");

const nlp = require('./nlp');

const config = {
    apiKey: process.env.FUSAION_OPENAI_KEY,
  }

console.log('OpenAI Config', config);

const configuration = new Configuration(config);
const openai = new OpenAIApi(configuration);
const sleep = seconds => new Promise(r => setTimeout(r, seconds * 1000));

exports.uploadFile = async (file) => {
    try {
        const response = await openai.createFile(
        fs.createReadStream(file),
        "fine-tune"
        );
        console.log('File ID: ', response.data.id)
    } catch (err) {
        console.log('err: ', err)
    }
}

exports.fineTune = async (fileId, n_epochs = 10) => {

    const request = {
        url: `https://api.openai.com/v1/fine_tuning/jobs`,
        method: 'post',
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.FUSAION_OPENAI_KEY}`
        },
        data: {
            training_file: fileId,
            model: "gpt-3.5-turbo-0613",
            hyperparameters: {
                n_epochs
            }
        }
    }

    try {
        const response = await axios(request);
        console.log(response.data);
    } catch(e) {
        console.error(e);
    }


    return;
    try {
      const response = await openai.createFineTune({
        training_file: fileId,
        model: 'gpt-3.5-turbo',
        n_epochs: 10
      })
      console.log('response: ', response)
    } catch (err) {
      console.log('error: ', err.response.data.error)
    }
  }

async function turboChatCompletion (prompt, temperature = 0, service = 'You are a helpful, accurate assistant.') {
    /* 
     * NO NEED TO SPECIFY MAX TOKENS
     * role: assistant, system, user
     */


    const request = {
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'post',
        headers: {
            'Authorization': `Bearer ${process.env.FUSAION_OPENAI_KEY}`,
        },
        data: {
            // model: "gpt-3.5-turbo",
            // model: "gpt-3.5-turbo-16k",
            model: "gpt-3.5-turbo-1106",
            temperature,
            messages:[
                {
                    role: 'system',
                    content: service,

                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        }
    }

    return axios(request);
}


exports.getTurboResponse = async (prompt, temperature = 0, service = 'You are a helpful, accurate assistant.') => {
    if (debug) console.log('TURBO', prompt);

    if (!prompt.endsWith("\n")) prompt += "\n";

    let result;
    let success = false;
    let count = 0;
    let seconds = 3;
    let maxCount = 10;
    while (!success) {
        try {
            result = await turboChatCompletion(prompt, temperature, service);
            success = true;
        } catch (err) {
            console.error("axios err.data", err.response.status, err.response.statusText, err.response.data);
            ++count;
            if (count >= maxCount || err.response.status === 400) {
                console.log("STATUS 400 EXIT");
                return {
                    status: 'error',
                    number: err.response.status,
                    message: err.response,
                }
            }
            seconds *= 2;
            await sleep(seconds);
            console.log('Retrying query:', prompt);
        }
    }

    const response = {
        status: 'success',
        finishReason: result.data.choices[0].finish_reason,
        content: result.data.choices[0].message.content
    }

    if (debug) console.log(response);

    return response;
}

const getTurboJSON = async (prompt, temperature = .4) => {
    let response = await this.getTurboResponse(prompt, temperature);

    if (response.status === 'error') return false;

    try {
        const json = JSON.parse(response.content.replaceAll("\n", ""));
        return json;
    } catch (err) {
        return false;
    }
}

const getTurboText = async (prompt, temperature = .4) => {
    let response = await this.getTurboResponse(prompt, temperature);

    if (response.status === 'error') return false;

    return response.content;
}

exports.chatGPT = async (prompt, temperature = .4) => await getTurboText(prompt, temperature);
exports.chatJSON = async (prompt, temperature = .4) => await getTurboJSON(prompt, temperature);

exports.rewriteAsNewsArticle = async (text) => {
    // console.log('typeof text', typeof text, text)
    const numTextWords = text.split(' ').length;
    const numResponseWords = Math.floor(.9 * numTextWords);

    const prompt = `'''Rewrite the following Document in the format of a news article. Use simple terms and sentences. The response must be at least ${numResponseWords} words.
    
    Document:
    ${text}'''`

    return await this.chatGPT(prompt);
}
exports.explainToHighScholer = async (text) => {
    const numTextWords = text.split(' ').length;
    const numResponseWords = Math.floor(.9 * numTextWords);

    const prompt = `'''Explain the facts and ideas disclosed in the following Document. Use simple terms and sentences. The response must be at least ${numResponseWords} words.
    
    Document:
    ${text}'''`

    const response = await exports.chatGPT(prompt);
    
    const paragraphs = response.split("\n");
    const transformed = [];

    for (let i = 0; i < paragraphs.length; ++i) {
        const sentences = nlp.getSentences(paragraphs[i]);

        for (let j = 0; j < sentences.length; ++j) {
            let sentence = sentences[j];
            if (!sentence.length) continue;

            console.log('orig sentence: ', sentence.length, sentence)
            sentence = sentence.replace('In this document, ', '');
            sentence = sentence.replace('The document highlights that ', '');
            sentence = sentence.replace('The document argues that ', '' );
            sentence = sentence.replace('The document concludes by stating that ', 'In conclusion, ');
            sentence = sentence.replace('The document is discussing ', 'This document discusses ');
            sentence = sentence.replace('is discussing', 'discusses');
            
            if (sentence.indexOf('the document explains the') !== -1) continue;
            if (sentence.indexOf('It discusses the') !== -1) continue;
            
            sentence = sentence.replace('the document explains ', '');

            console.log('new sentence: ', sentence.length, sentence)
            console.log("\n\n")

            sentence = sentence[0].toUpperCase() + sentence.slice(1)
            if (j < (sentences.length - 1))
                transformed.push(sentence + ' ');
            else
                transformed.push(sentence)
        }
        
        transformed.push("\n");
    }

    return transformed.join('')

}

exports.getFactsAndQuotes = async (text, maxPercent = 100) => {
    const numSentences = nlp.numSentences;
    const numFacts = Math.floor(numSentences * (maxPercent / 100));

    const prompt = `'''Extract ${numFacts} from the Text below. Use simple terms and sentences. Also extract all third-party quotes. The return format must be stringified JSON in the following format:
    {
        facts: array of facts goes here,
        quotes: array of quotes goes here in the following format: {quote, speaker, affiliation}
    }
    
    Text:
    ${text}'''`

    console.log('prompt', prompt);

    return exports.chatJSON(prompt)

}

exports.getGist = async (text, numSentences = 3) => {
    const prompt = `"""Give the overall gist of the Text below in ${numSentences > 1 ? `${numSentences} sentences` : `1 sentence`}.
    
    Text:
    ${text}\n"""\n`;

    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    return response.content;
}

exports.getKeywordsAndAffiliations = async (text) => {
    const prompt = `"""Provide a list of keywords and a list of affiliations contained in the following text. The keyword list must include all names of people, organizations, events, products, and services as well as all significant topics, concepts, and ideas. The affiliation list must include the individual's name as well as all titles, roles, and organizations that the individual is affiliated with. The returned format must be stringified JSON in the following format: {
        "keywords": array of keywords goes here,
        "affiliations": array of affiliations goes here
        }
        
        Text:
        ${text}
        """
        `
    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    try {
        const json = JSON.parse(response.content.replaceAll("\n", ""));
        return json;
    } catch (err) {
        return false;
    }


    return response.content;
}

exports.getConceptsNamesAndAffiliations = async (text) => {
    const prompt = `"""Provide a list of concepts, names, and affiliations contained in the following text. The concept list must include all significant topics, concepts, and ideas. The names list must include all names of all people, organizations, events, products, and services. The affiliation list must include each individual's name as well as all titles, roles, and organizations that the individual is affiliated with. The returned format must be stringified JSON in the following format: {
        "concepts": array of concepts goes here,
        "names": array of names goes here,
        "affiliations": array of affiliations goes here
        }
        
        Text:
        ${text}
        """
        `
    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    try {
        const json = JSON.parse(response.content.replaceAll("\n", ""));
        return json;
    } catch (err) {
        return false;
    }


    return response.content;
}

exports.getFactsRelatedToTopic = async (topic, text) => {
    const prompt = `"""I want to find all facts, ideas, and concepts in the provided Text that are related to the Topic provided below. Be sure to include all relevant facts, ideas, and concepts. If there are no facts, ideas, or concepts related to the topic then return an empty list. 

    The return format must solely be stringified JSON in the following format: {
    "facts": array of relevant facts, ideas, and concepts goes here
    }
    
    Topic:
    ${topic}

    Text:
    ${text}
    """
    `

    let response = await this.getTurboResponse(prompt, .4);

    console.log("RESPONSE", response);

    if (response.status === 'error') return false;

    let json;
    try {
        json = JSON.parse(response.content.replaceAll("\n", ""));
        
    } catch (err) {
        json = false;
    }
    
    console.log('json', json);

    return json;
}

exports.getOverallTopic = async (text, numWords = 32) => {
    const prompt = `"""In ${numWords} words, tell me the overall gist of the following text.

    Text:
    ${text}
    """`;

    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    return response.content;
}

exports.getTopicAndGist = async (text, numGistSentences = 3, numTopicWords = 32) => {
    const prompt = `"""In ${numGistSentences > 1 ? `${numGistSentences} sentences` : `1 sentence`} tell me the gist of the following text. Also, in ${numTopicWords} words or less, tell me the overall topic of the following text. The return format must be in stringified JSON in the following format: {
        "gist": gist goes here,
        "topic": topic goes here
    }

    Text:
    ${text}
    """`;

    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    try {
        const json = JSON.parse(response.content.replaceAll("\n", ""));
        return json;
    } catch (err) {
        return false;
    }
}

exports.getRelevantFacts = async (text, numFacts = 3) => {
    const prompt = `"""Find the ${numFacts} most relevant facts in regards to the Text below. The The return format must be in stringified JSON in the following format: {
        "facts": array of facts goes here
    }

    Text:
    ${text}
    """`;

    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    try {
        const json = JSON.parse(response.content.replaceAll("\n", ""));
        return json;
    } catch (err) {
        return false;
    }
}

exports.getArticleFromSourceList = async (topic, sourceList) => {
    const prompt = `"""Acting as a witty professor, write a warm and conversational news article on the Topic below using the facts from the various Sources below. Create the article using as many facts as possible without repeating any information.
    
    Topic:
    ${topic}\n
    ${sourceList}"""\n`;

    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    return response.content;
}

exports.rewriteArticleInEngagingManner = async (article) => {
    const prompt = `"""As a professional journalist, rewrite the following News Article in a dynamic and engaging style. Ensure your response preserves all the quotes in the news article.
    News Article:
    ${article}\n"""\n`;
    
    let response = await this.getTurboResponse(prompt, .4);

    if (response.status === 'error') return false;

    return response.content;
}


exports.extractReleventQuotes = async (topic, text) => {
    const prompt = `"""Below is a Topic and Text. I want to find all the speaker quotes cited in the Text that are relevant to the Topic. I solely want quote citations that are relevant to the topic.  The return format must solely be stringified JSON in the following format:
    {
        "quotes": array of relevant quotes along with the name of the speaker in the following format goes here {"quote": relevant quote, "speaker": speaker of relevant quote}
    }
        
    Topic:
    ${topic}

    Text:
    ${text.trim()}"""
    `;
 
    return await getTurboJSON(prompt, .4);
}

exports.insertQuotesFromQuoteList = async (initialArticle, quoteList) => {
    const prompt = `"""Below is a News Article and a list of Quotes. For each quote that is relevant to the news article, make the news article longer by incorporating every relevant quote. If none of the quotes are relevant to the news article then return the news article in its original form.
    
    News Article:
    ${initialArticle}
    
    ${quoteList}
    """
    `
   return await getTurboText(prompt, .4);
}

exports.getTagsAndTitles = async (article, numTitles = 10) => {
    const prompt = `"""Give ${numTitles} interesting, eye-catching titles for the provided News Article below.
    Also generate a list of tags that include the important words and phrases in the response. 
    The list of tags must also include the names of all people, products, services, places, companies, and organizations mentioned in the response.
    Also generate a conclusion for the news article.
    The return format must be stringified JSON in the following format: {
        "titles": array of titles goes here
        "tags": array of tags go here
        "conclusion": conclusion goes here
    }
    News Article:
    ${article}\n"""\n`;

    return await getTurboJSON(prompt, .7);
}