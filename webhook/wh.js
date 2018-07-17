"use strict";

const express = require("express");
const request = require("request");
const bodyParser = require("body-parser");

let keys = {};
try { keys = require("./keys"); } catch (error) { console.log("Keys.js file not found"); }

let proverbsIDsSeen = []; // a list of ID's of proverbs that were already shown to user
let anwserVariants = []; // possible answer variants for current question (proverb)
const proverbsTable = "proverbs"; // name of table with proverb tasks in our DB (finishproverbbot)

let users = {
    "sessionId": {
        "proverbsIDsSeen": [],
        "anwserVariants": []
    }
};


let app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000), function() {console.log("FinishProverbVoiceBot: Webhook server is listening, port 5000")});


// Server index and info page
app.get("/", (req, res) => {
    res.send("FinishProverbVoiceBot<br>More details: <a href='https://github.com/IuriiD/finishphrasebot'>Github</a><br><a href='http://iuriid.github.io'>Iurii Dziuban - July 2018</a>");
});


// All callbacks from Dialogflow are processed here
app.post("/webhook", async function(req, res) {
    try {
        let payload;
        let ourReq = req.body;

        console.log("\nResponse from Dialogflow:\n");
        console.log(JSON.stringify(ourReq, null, 2));

        let action = ourReq.result.action;

        let sessionId = ourReq.sessionId;

        // First webhook triggering for a given sessionId
        if (!(sessionId in users)) {
            users[sessionId] = { "proverbsIDsSeen": [], "anwserVariants": [] }
        }

        // In case user's answer is awaited then any his response (including those triggering other intents
        // from SmallTalk) should be treated as an answer (as in case action="useranswers"); but 2 actions
        // are exceptions - "restart" and "stop" (there's though a small probability that correct answer should
        // be a word or phrase from these 2 intents but for now let's leave it as is)
        let contexts = ourReq.result.contexts;
        if (contexts.length > 0) {
            for (let eachContext of contexts) {
                if (eachContext.name = "useranswers") {
                    if (action != "restart" && action != "stop") {
                        action = "useranswers";
                    }
                }
            }
        }

        if (action == "letsplay") {
            users[sessionId] = { "proverbsIDsSeen": [], "anwserVariants": [] };
            payload = await askProverb("");
        }

        else if (action == "useranswers") {
            let usersAnswer = ourReq.result.resolvedQuery;
            let reactionToPrevAnswer = await checkAnswer(usersAnswer, users.sessionId.anwserVariants);
            payload = await askProverb(reactionToPrevAnswer);
        }

        else if (action == "restart") {
            users[sessionId] = { "proverbsIDsSeen": [], "anwserVariants": [] };
            payload = {
                "speech": "Ok, let's start from the beginning.. Ready?",
                "displayText": "Ok, let's start from the beginning.. Ready?",
                "contextOut": [
                    {
                        "name": "letsplay",
                        "parameters": {},
                        "lifespan": 2
                    },
                    {
                        "name": "useranswers",
                        "parameters": {},
                        "lifespan": 0
                    }
                ]
            };
        }

        else if (action == "stop") {
            users[sessionId] = { "proverbsIDsSeen": [], "anwserVariants": [] };
            payload = {
                "speech": "Cancelled! What would you like to do next?",
                "displayText": "Cancelled! What would you like to do next?",
                "contextOut": [
                    {
                        "name": "letsplay",
                        "parameters": {},
                        "lifespan": 0
                    },
                    {
                        "name": "useranswers",
                        "parameters": {},
                        "lifespan": 0
                    }
                ]
            };
        }

        else if (action == "postgresql") {
            console.log('SQL query');
            let userInput = ourReq.result.resolvedQuery;
            let queryFromDF = userInput.split("SQL:")[1];
            let dbResponse = await getQuery(queryFromDF);
            payload = {
                "speech": dbResponse,
                "displayText": dbResponse,
                "contextOut": []
            };
        }

        res.status(200).send(payload);

    } catch (e) {
        console.log(e);

        let payload = {
            "speech": "Sorry, some error happened. Try again a bit later please..",
            "displayText": "Sorry, some error happened. Try again a bit later please..",
            "contextOut": []
        };

        res.status(200).send(payload);
    }
});


async function checkAnswer(usersAnswer, anwserVariants) {
    if (anwserVariants.includes(usersAnswer)) {
        return "Quite right!";
    } else {
        return `Nope. Correct variant is: "..${anwserVariants[0]}".`;
    }
}


// Randomly chooses a proverb's ID among IDs that hasn't been presented yet
async function askProverb(reactionToPrevAnswer) {
    // Get row/proverbs total number
    let q = `SELECT COUNT(*) from ${proverbsTable}`;
    let dbResponse = await getQuery(q);
    let proverbsCount = JSON.parse(dbResponse).rows[0].count;

    // Get a random proverb's ID which hasn't been shown yet (not in proverbsIDsSeen)
    let nextProverbID = null;
    for (let i=0; i<proverbsCount; i++) {
        let randN = Math.floor(Math.random() * proverbsCount) + 1;
        if (!users.sessionId.proverbsIDsSeen.includes(randN)) {
            nextProverbID = randN;
            users.sessionId.proverbsIDsSeen.push(randN);
            break;
        }
    }

    // Prepare payload for Dialogflow (speech + context) - by default for the end of the game
    let response = `${reactionToPrevAnswer}You answered all questions! Try again?`;
    let payload = {
        "speech": response,
        "displayText": response,
        "contextOut": [{
            "name": "endgame",
            "parameters": {},
            "lifespan": 2
        }]
    };

    // All proverbs have been asked
    if (!nextProverbID) {
        proverbsIDsSeen = [];
        return payload;
    }

    // Request a phrase with chosen ID
    q = `SELECT * FROM ${proverbsTable} where id=${nextProverbID}`;
    dbResponse = await getQuery(q);
    let dbResponseParsed = JSON.parse(dbResponse);
    console.log("\nDB RESPONSE:\n");
    //console.log(dbResponseParsed);

    let proverbStarts = dbResponseParsed.rows[0].proverbstarts;
    users.sessionId.anwserVariants = dbResponseParsed.rows[0].proverbends;
    //let proverbID = dbResponseParsed.rows[0].id;

    let speech = reactionToPrevAnswer;
    console.log("\nproverbsIDsSeen.length: " + users.sessionId.proverbsIDsSeen.length);
    if (users.sessionId.proverbsIDsSeen.length == 1) {
        speech += `Ok. Here's my first question: ${proverbStarts}...`;
    } else {
        speech += ` Next one: ${proverbStarts}...`;
    }

    payload = {
        "speech": speech,
        "displayText": speech,
        "contextOut": [{
            "name": "useranswers",
            "parameters": {},
            "lifespan": 2
        }]
    };

    // Asking to finish a proverb
    return payload;
}


async function getQuery(q) {
    try {
        const { Client } = require('pg');

        // Credentials for Heroku
        /*
        const user = "ydxzwdgaxatmet"; // postgres
        const host = "ec2-54-235-249-33.compute-1.amazonaws.com"; // localhost
        const database = "d6fkk5vc9s6g8p"; // finishproverbbot
        const dbPort = 5432;
        */

        // Credentials for local machine
        const user = "postgres"; // postgres
        const host = "localhost"; // localhost
        const database = "finishproverbbot"; // finishproverbbot
        const dbPort = 5432;

        const client = new Client({
            user: user,
            host: host,
            database: database,
            password: process.env.postgreSQLKey || keys.postgreSQLKey,
            port: dbPort,
        });

        client.connect();

        let ourQuery = await client.query(q);
        //console.log(JSON.stringify(ourQuery, null, 2));
        client.end();
        return JSON.stringify(ourQuery);
    } catch (e) {
        console.log(`Ups.. ${e}`);
        return false;
    }
}


