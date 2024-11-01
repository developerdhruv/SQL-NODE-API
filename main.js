const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');  
const app = express();
const port = 3042;

app.use(cors());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'vehiclesdata'
});
if (db) {
    console.log("Database connected");
}

// Updated endpoint to include keyword search
app.get('/api/products', (req, res) => {
    const { make, model, year, keyword } = req.query;
    let query = 'SELECT * FROM dataweb WHERE 1=1';
    const queryParams = [];

    if (make) {
        query += ` AND Meta_cpr_make = ?`;
        queryParams.push(make);
    }
    if (model) {
        query += ` AND Meta_cpr_model LIKE ?`;
        queryParams.push(`%${model}%`);
    }
    if (year) {
        query += ` AND Meta_year_start <= ? AND Meta_year_end >= ?`;
        queryParams.push(year, year);
    }
    if (keyword) {
        // Allow searching by Name or Description
        query += ` AND (Name LIKE ? OR Description LIKE ?)`;
        queryParams.push(`%${keyword}%`, `%${keyword}%`);
    }

    db.query(query, queryParams, (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// Endpoint to get product details by ID
app.get('/api/products/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM dataweb WHERE ID = ?', [id], (err, result) => {
        if (err) throw err;
        res.json(result[0]);
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
