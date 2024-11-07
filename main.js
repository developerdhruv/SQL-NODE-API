const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = 3042;
const dotenv = require('dotenv');
app.use(cors());
dotenv.config();

let db;

async function initializeDB() {
    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            connectionLimit: 10,
            waitForConnections: true,
            queueLimit: 0,
        });
        console.log('Database connected');
    } catch (err) {
        console.error('Database connection failed:', err);
        throw err;
    }
}

initializeDB().catch((err) => {
    console.error('Error initializing database:', err);
    process.exit(1);
});

// Existing endpoints...

// New endpoint to fetch distinct makes
app.get('/api/makes', async (req, res) => {
    const { term } = req.query;

    try {
        let query;
        const queryParams = [];

        if (term) {
            query = `
                SELECT DISTINCT Meta_cpr_make AS make
                FROM dataweb
                WHERE Meta_cpr_make LIKE ?
                  AND Meta_cpr_make IS NOT NULL
                ORDER BY 
                    LOCATE(?, Meta_cpr_make) ASC,  -- Rank by position of the search term in the make
                    LENGTH(Meta_cpr_make) ASC      -- Then by length of the make for tie-breaking
            `;
            queryParams.push(`%${term}%`, term);
        } else {
            query = `
                SELECT DISTINCT Meta_cpr_make AS make
                FROM dataweb
                WHERE Meta_cpr_make IS NOT NULL
                ORDER BY Meta_cpr_make ASC;
            `;
        }

        const [results] = await db.query(query, queryParams);
        const makes = results.map(row => row.make);
        res.json(makes);
    } catch (err) {
        console.error('Error fetching makes:', err);
        res.status(500).send('Error fetching makes');
    }
});

// New endpoint to fetch models based on selected make
app.get('/api/models', async (req, res) => {
    const { make, term } = req.query;

    if (!make) {
        return res.status(400).send('Make parameter is required');
    }

    try {
        let query;
        const queryParams = [make];

        if (term) {
            query = `
                SELECT DISTINCT Meta_cpr_model AS model
                FROM dataweb
                WHERE Meta_cpr_make = ?
                  AND Meta_cpr_model LIKE ?
                  AND Meta_cpr_model IS NOT NULL
                ORDER BY LOCATE(?, Meta_cpr_model) ASC, LENGTH(Meta_cpr_model) ASC
            `;
            queryParams.push(`%${term}%`, term);
        } else {
            query = `
                SELECT DISTINCT Meta_cpr_model AS model
                FROM dataweb
                WHERE Meta_cpr_make = ?
                  AND Meta_cpr_model IS NOT NULL
                ORDER BY Meta_cpr_model ASC
            `;
        }

        const [results] = await db.query(query, queryParams);
        let models = [];
        results.forEach(row => {
            const modelList = row.model.split(',');
            models = models.concat(modelList);
        });
        models = [...new Set(models)]
            .filter(model => model.trim() !== "")
            .sort();
        res.json(models);
    } catch (err) {
        console.error('Error fetching models:', err);
        res.status(500).send('Error fetching models');
    }
});

// Existing product fetching endpoint...
app.get('/api/products', async (req, res) => {
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

    try {
        const [results] = await db.query(query, queryParams);
        res.json(results);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).send('Error fetching products');
    }
});

// Endpoint to fetch a single product by ID (already present)
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [[result]] = await db.query('SELECT * FROM dataweb WHERE ID = ?', [id]);
        res.json(result);
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).send('Error fetching product');
    }
});

// Existing endpoint for keyword suggestions...
app.get('/api/suggestions', async (req, res) => {
    const { term } = req.query;
    if (!term) {
        return res.json([]); // Return empty array if no term is provided
    }

    try {
        const query = `
            SELECT DISTINCT Name 
            FROM dataweb 
            WHERE Name LIKE ? OR Meta_cpr_make LIKE ? OR Meta_cpr_model LIKE ?
            LIMIT 10
        `;
        const searchTerm = `%${term}%`;
        const [results] = await db.query(query, [searchTerm, searchTerm, searchTerm]);
        res.json(results.map(row => row.Name));
    } catch (err) {
        console.error('Error fetching suggestions:', err);
        res.status(500).send('Error fetching suggestions');
    }
});

// New endpoint to fetch categories (already present)
app.get('/api/categories', async (req, res) => {
    try {
        const [results] = await db.query('SELECT DISTINCT Categories FROM dataweb');
        const categories = results.map(row => row.Categories);
        res.json(categories);
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).send('Error fetching categories');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});