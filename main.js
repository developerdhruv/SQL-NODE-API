// Existing imports and setup remain the same
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

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Database connected');
    }
});

// Existing endpoints...

// New endpoint to fetch distinct makes
app.get('/api/makes', (req, res) => {
    const query = 'SELECT DISTINCT Meta_cpr_make AS make FROM dataweb WHERE Meta_cpr_make IS NOT NULL';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching makes:', err);
            res.status(500).send('Error fetching makes');
        } else {
            const makes = results.map(row => row.make);
            res.json(makes);
        }
    });
});

// New endpoint to fetch models based on selected make
app.get('/api/models', (req, res) => {
    const { make } = req.query;
    const query = 'SELECT DISTINCT Meta_cpr_model AS model FROM dataweb WHERE Meta_cpr_make = ? AND Meta_cpr_model IS NOT NULL';

    db.query(query, [make], (err, results) => {
        if (err) {
            console.error('Error fetching models:', err);
            res.status(500).send('Error fetching models');
        } else {
            const models = results.map(row => row.model);
            res.json(models);
        }
    });
});

// Existing product fetching endpoint...
app.get('/api/products', (req, res) => {
    const { make, model, year, keyword, category } = req.query;
    let query = 'SELECT * FROM dataweb WHERE 1=1';
    const queryParams = [];

    if (make) {
        query += ' AND Meta_cpr_make = ?';
        queryParams.push(make);
    }
    if (model) {
        query += ' AND Meta_cpr_model LIKE ?';
        queryParams.push(`%${model}%`);
    }
    if (year) {
        query += ' AND Meta_year_start <= ? AND Meta_year_end >= ?';
        queryParams.push(year, year);
    }
    if (keyword) {
        query += ' AND (Name LIKE ? OR Description LIKE ?)';
        queryParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
        query += ' AND Categories LIKE ?';
        queryParams.push(`%${category}%`);
    }

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Error fetching products:', err);
            res.status(500).send('Error fetching products');
        } else {
            res.json(results);
        }
    });
});

// Endpoint to fetch a single product by ID (already present)
app.get('/api/products/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM dataweb WHERE ID = ?', [id], (err, result) => {
        if (err) {
            console.error('Error fetching product:', err);
            res.status(500).send('Error fetching product');
        } else {
            res.json(result[0]);
        }
    });
});

// Existing endpoint for keyword suggestions...
app.get('/api/suggestions', (req, res) => {
    const { term } = req.query;
    if (!term) {
        return res.json([]); // Return empty array if no term is provided
    }

    const query = `
        SELECT DISTINCT Name 
        FROM dataweb 
        WHERE Name LIKE ? OR Meta_cpr_make LIKE ? OR Meta_cpr_model LIKE ?
        LIMIT 10
    `;
    const searchTerm = `%${term}%`;

    db.query(query, [searchTerm, searchTerm, searchTerm], (err, results) => {
        if (err) {
            console.error('Error fetching suggestions:', err);
            res.status(500).send('Error fetching suggestions');
        } else {
            res.json(results.map(row => row.Name));
        }
    });
});

// New endpoint to fetch categories (already present)
app.get('/api/categories', (req, res) => {
    const query = 'SELECT DISTINCT Categories FROM dataweb';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching categories:', err);
            res.status(500).send('Error fetching categories');
        } else {
            const categories = results.map(row => row.Categories);
            res.json(categories);
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
