"use strict";

const express = require("express");
const request = require("request");
const bodyParser = require("body-parser");

let keys = {};
try { keys = require("./keys"); } catch (error) { console.log("Keys.js file not found"); }

let proverbsIDsSeen = []; // a list of ID's of proverbs that were already shown to user
let anwserVariants = []; // possible answer variants for current question (proverb)
const proverbsTable = "proverbs"; // name of table with proverb tasks in our DB (finishproverbbot)


let app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000), function() {console.log("FinishProverbVoiceBot: Webhook server is listening, port 5000")});


// Server index and info page
app.get("/", (req, res) => {
    res.send("FinishProverbVoiceBot<br>More details: <a href='https://github.com/IuriiD/finishproverbvoicebot'>Github</a><br><a href='http://iuriid.github.io'>Iurii Dziuban - July 2018</a>");
});


// All callbacks from Dialogflow are processed here
app.post("/webhook", async function(req, res) {
    try {
        let payload;
        let ourReq = req.body;
        console.log("\nResponse from Dialogflow:\n");
        console.log(JSON.stringify(ourReq, null, 2));

        let action = ourReq.result.action;
        console.log(`#####################\nAction: ${action}`);

        if (action == "letsplay") {
            console.log('here');
            payload = await askProverb("");
        }

        else if (action == "useranswers") {
            console.log('here2');
            let usersAnswer = ourReq.result.resolvedQuery;
            console.log(`\nusersAnswer: ${usersAnswer}`);
            let reactionToPrevAnswer = await checkAnswer(usersAnswer, anwserVariants);
            console.log(`\nreactionToPrevAnswer: ${reactionToPrevAnswer}`);
            payload = await askProverb(reactionToPrevAnswer);
        }

        res.status(200).send(payload);

    } catch (e) {
        console.log(e);
    }
});


async function checkAnswer(usersAnswer, anwserVariants) {
    if (anwserVariants.includes(usersAnswer)) {
        return "Quite right!\n";
    } else {
        return `Nope. Correct variant is: "..${anwserVariants[0]}".\n`;
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
        if (!proverbsIDsSeen.includes(randN)) {
            nextProverbID = randN;
            proverbsIDsSeen.push(randN);
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
    console.log(dbResponseParsed);

    let proverbStarts = dbResponseParsed.rows[0].proverbstarts;
    anwserVariants = dbResponseParsed.rows[0].proverbends;
    let proverbID = dbResponseParsed.rows[0].id;

    let speech = reactionToPrevAnswer;
    console.log("\nproverbsIDsSeen.length: " + proverbsIDsSeen.length);
    if (proverbsIDsSeen.length == 1) {
        speech += `Ok. Here's my first question:\n${proverbStarts}...`;
    } else {
        speech += `Next one: \n${proverbStarts}...`;
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

        const user = "postgres";
        const host = "localhost";
        const database = "finishproverbbot";
        const dbPort = 5432;

        const client = new Client({
            user: user,
            host: host,
            database: database,
            password: keys.postgreSQLKey,
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


