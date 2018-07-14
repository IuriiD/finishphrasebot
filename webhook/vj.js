"use strict";

let keys = {};
try {
    keys = require("./keys");
} catch (error) {
    console.log("Keys.js file not found");
}

const { Pool, Client } = require('pg');

const user = "postgres";
const host = "localhost";
const database = "finishproverbvoicebot";
const myTable = "proverb";
const dbPort = 5432;


const pool = new Pool({
    user: user,
    host: host,
    database: database,
    password: keys.postgreSQLKey,
    port: dbPort,
});

async function getPool() {
    try {
        let ourPool = await pool.query(`SELECT * from ${myTable}`);
        console.log("\n" + JSON.stringify(ourPool, null, 2));
        pool.end();
    } catch (e) {
        console.log(`Ups.. ${e}`);
    }

}

const client = new Client({
    user: user,
    host: host,
    database: database,
    password: keys.postgreSQLKey,
    port: dbPort,
});

client.connect();

async function getQuery(q) {
    try {
        let ourQuery = await client.query(q);
        console.log(JSON.stringify(ourQuery, null, 2));
        client.end();
    } catch (e) {
        console.log(`Ups.. ${e}`);
    }

}

let q = `SELECT * from ${myTable}`;
//q = `UPDATE ${jokesTable} SET rating = 5 WHERE number = 1`;
getQuery(q);

/*
client.query('SELECT * from jokes', (err, res) => {
    console.log(err, res);
    client.end();
});
*/